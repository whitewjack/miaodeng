#!/usr/bin/env python3
"""秒登 MiaoDeng Server - 支持多用户数据隔离 (IPv4 + IPv6 双栈)"""

import json
import os
import re
import sqlite3
import time
import socket
import hashlib
import base64
import secrets
import string
import ssl
import threading
import shutil
import urllib.request
import urllib.error
import posixpath
import zipfile
from http import HTTPStatus
from http.server import HTTPServer, SimpleHTTPRequestHandler
from socketserver import ThreadingMixIn
from urllib.parse import urlparse, parse_qs, unquote

try:
    PORT = int(os.environ.get('PORT', '6680'))
except Exception:
    PORT = 6680
DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(DIR, 'data')
USERS_FILE = os.path.join(DATA_DIR, 'users.json')
LIKES_FILE = os.path.join(DATA_DIR, 'likes.json')
MESSAGES_FILE = os.path.join(DATA_DIR, 'messages.json')
SQLITE_DB_FILE = os.path.join(DATA_DIR, 'sso.db')
ENCRYPT_KEY_FILE = os.path.join(DATA_DIR, '.encrypt-key')
ADMIN_PASSWORD_FILE = os.path.join(DATA_DIR, '.admin-password')
LEGACY_ENCRYPT_KEYS = ['miaodeng-secret-2024']
ENCRYPT_KEY = ''
ADMIN_PASSWORD_HASH = ''
DEFAULT_SESSION_TTL_SECONDS = 8 * 60 * 60
DEFAULT_REMEMBER_SESSION_TTL_SECONDS = 30 * 24 * 60 * 60
VALID_ROLES = {'readonly', 'editor', 'admin'}
SESSIONS = {}
SESSIONS_LOCK = threading.Lock()
DB_INIT_LOCK = threading.Lock()
DB_INITIALIZED = False
DB_MIGRATION_KEY = 'json_to_sqlite_v1'
BACKUP_RETENTION_DEFAULT = 10
BACKUP_INTERVAL_SECONDS_DEFAULT = 24 * 60 * 60
BACKUP_STARTUP_MIN_INTERVAL_SECONDS_DEFAULT = 60 * 60
BACKUP_LOCK = threading.RLock()
BACKUP_SCHEDULER_STARTED = False
SERVER_START_TS = int(time.time())
LOCAL_DEV_ORIGIN_PREFIXES = (
    'http://localhost',
    'http://127.0.0.1',
    'https://localhost',
    'https://127.0.0.1',
)
STATIC_ALLOWED_FILES = {
    '/sso-portal.html',
    '/README.md',
    '/README-INSTALL.txt',
    '/CHANGELOG.md',
    '/install-quick.sh',
    '/install-mac.sh',
    '/install-windows.bat',
    '/auto-login.user.js',
    '/bookmarklet.js',
    '/miaodeng-latest.zip',
    '/auto-login-extension.zip',
    '/auto-login-extension-store.zip',
}
STATIC_ALLOWED_PREFIXES = (
    '/chrome-extension/',
    '/css/',
    '/js/',
)

EXTENSION_DIR = os.path.join(DIR, 'chrome-extension')
EXTENSION_ARCHIVE_AUTO = os.path.join(DIR, 'auto-login-extension.zip')
EXTENSION_ARCHIVE_STORE = os.path.join(DIR, 'auto-login-extension-store.zip')
EXTENSION_ARCHIVE_LATEST = os.path.join(DIR, 'miaodeng-latest.zip')
EXTENSION_ARCHIVE_LOCK = threading.Lock()
EXTENSION_ARCHIVE_TARGETS = {
    '/auto-login-extension.zip': EXTENSION_ARCHIVE_AUTO,
    '/auto-login-extension-store.zip': EXTENSION_ARCHIVE_STORE,
    '/miaodeng-latest.zip': EXTENSION_ARCHIVE_LATEST,
}


def get_cors_allowed_origins():
    raw = (os.environ.get('CORS_ALLOW_ORIGINS', '') or '').strip()
    if not raw:
        return set()
    values = [item.strip() for item in re.split(r'[\s,]+', raw) if item.strip()]
    return set(values)


CORS_ALLOWED_ORIGINS = get_cors_allowed_origins()


class DualStackHTTPServer(ThreadingMixIn, HTTPServer):
    """支持 IPv4 + IPv6 双栈的多线程 HTTP 服务器"""
    address_family = socket.AF_INET6
    allow_reuse_address = True
    daemon_threads = True

    def server_bind(self):
        try:
            self.socket.setsockopt(socket.IPPROTO_IPV6, socket.IPV6_V6ONLY, 0)
        except (AttributeError, OSError):
            pass
        super().server_bind()


class IPv4ThreadingHTTPServer(ThreadingMixIn, HTTPServer):
    """IPv4 回退模式也保持多线程，避免慢请求阻塞全部 API。"""
    allow_reuse_address = True
    daemon_threads = True


# ============ 密码哈希 ============

def hash_password(password, salt=None):
    """SHA256 加盐哈希"""
    if salt is None:
        salt = os.urandom(16).hex()
    hashed = hashlib.sha256((salt + password).encode()).hexdigest()
    return f"{salt}:{hashed}"


def verify_hashed_password(stored, password):
    """验证 hash_password 格式密码"""
    if not stored:
        return False
    if ':' in stored and len(stored) > 40:
        salt, hashed = stored.split(':', 1)
        return hashlib.sha256((salt + password).encode()).hexdigest() == hashed
    # 兼容旧格式（明文）
    return stored == password


def generate_random_secret(length=20):
    """生成可读性较好的随机密码/密钥片段"""
    alphabet = string.ascii_letters + string.digits
    return ''.join(secrets.choice(alphabet) for _ in range(length))


def read_text_file(path):
    if not os.path.exists(path):
        return ''
    with open(path, 'r', encoding='utf-8') as f:
        return f.read().strip()


def write_secure_text_file(path, content):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'w', encoding='utf-8') as f:
        f.write(content)
    try:
        os.chmod(path, 0o600)
    except OSError:
        pass


def has_existing_encrypted_data():
    """检查是否存在历史 enc: 数据（用于兼容迁移）"""
    if not os.path.exists(DATA_DIR):
        return False
    for name in os.listdir(DATA_DIR):
        if not (name.startswith('systems-') and name.endswith('.json')):
            continue
        path = os.path.join(DATA_DIR, name)
        try:
            with open(path, 'r', encoding='utf-8') as f:
                if 'enc:' in f.read():
                    return True
        except Exception:
            continue
    return False


def init_encrypt_key():
    """初始化凭据加密密钥：环境变量优先，其次本地持久化"""
    env_key = os.environ.get('ENCRYPT_KEY', '').strip()
    if env_key:
        print('🔐 凭据加密密钥来源: 环境变量 ENCRYPT_KEY')
        return env_key

    file_key = read_text_file(ENCRYPT_KEY_FILE)
    if file_key:
        print(f'🔐 凭据加密密钥来源: 本地文件 {ENCRYPT_KEY_FILE}')
        return file_key

    # 兼容旧版本：首次升级且检测到历史 enc: 数据时，先沿用旧密钥并持久化
    if has_existing_encrypted_data():
        legacy_key = LEGACY_ENCRYPT_KEYS[0]
        write_secure_text_file(ENCRYPT_KEY_FILE, legacy_key)
        print('⚠️ 检测到历史加密数据，已启用兼容迁移密钥并持久化到本地。')
        print('   建议后续设置 ENCRYPT_KEY 并完成数据重写迁移。')
        return legacy_key

    generated_key = secrets.token_urlsafe(32)
    write_secure_text_file(ENCRYPT_KEY_FILE, generated_key)
    print('⚠️ 未设置 ENCRYPT_KEY，已自动生成并持久化本地密钥。')
    print(f'   密钥文件: {ENCRYPT_KEY_FILE}')
    return generated_key


def init_admin_password_hash():
    """初始化管理员密码：环境变量优先，其次本地哈希文件"""
    env_password = os.environ.get('ADMIN_PASSWORD', '').strip()
    if env_password:
        print('🔐 管理员密码来源: 环境变量 ADMIN_PASSWORD')
        return hash_password(env_password)

    stored = read_text_file(ADMIN_PASSWORD_FILE)
    if stored:
        # 兼容旧明文文件，自动迁移到 hash
        if ':' not in stored or len(stored) <= 40:
            stored = hash_password(stored)
            write_secure_text_file(ADMIN_PASSWORD_FILE, stored)
            print('⚠️ 检测到旧版明文管理员密码文件，已自动迁移为哈希存储。')
        print(f'🔐 管理员密码来源: 本地文件 {ADMIN_PASSWORD_FILE}')
        return stored

    generated_password = generate_random_secret(20)
    stored_hash = hash_password(generated_password)
    write_secure_text_file(ADMIN_PASSWORD_FILE, stored_hash)
    print('⚠️ 未设置 ADMIN_PASSWORD，已自动生成管理员密码（仅本次显示一次）：')
    print(f'   ADMIN_PASSWORD={generated_password}')
    print(f'   哈希已保存: {ADMIN_PASSWORD_FILE}')
    return stored_hash


# ============ 凭据加密（at-rest 保护）============

CREDENTIAL_FIELDS = ['password', 'otp', 'token', 'otp_secret']
LEGACY_ENCRYPT_PREFIX = 'enc:'
CURRENT_ENCRYPT_PREFIX = 'enc2:'


def _decrypt_with_key(data, key):
    return ''.join([chr(b ^ ord(key[i % len(key)])) for i, b in enumerate(data)])


def _looks_like_plaintext(text):
    """弱校验：用于错误密钥回退判断，尽量不影响旧数据读取"""
    if not text:
        return True
    if '\x00' in text:
        return False
    printable = sum(1 for ch in text if ch.isprintable())
    return printable / len(text) >= 0.85


def encrypt_field(text):
    """XOR + base64 加密"""
    if not text:
        return text
    if not ENCRYPT_KEY:
        return text
    key = ENCRYPT_KEY
    encrypted = bytes([ord(c) ^ ord(key[i % len(key)]) for i, c in enumerate(text)])
    return CURRENT_ENCRYPT_PREFIX + base64.b64encode(encrypted).decode()


def decrypt_field(text):
    """解密凭据字段"""
    if not text or not isinstance(text, str):
        return text
    try:
        if text.startswith(CURRENT_ENCRYPT_PREFIX):
            if not ENCRYPT_KEY:
                return text
            data = base64.b64decode(text[len(CURRENT_ENCRYPT_PREFIX):])
            return _decrypt_with_key(data, ENCRYPT_KEY)

        if not text.startswith(LEGACY_ENCRYPT_PREFIX):
            return text

        data = base64.b64decode(text[len(LEGACY_ENCRYPT_PREFIX):])
        # 旧格式优先尝试历史密钥，尽量保证升级后旧数据可读
        candidate_keys = list(LEGACY_ENCRYPT_KEYS)
        if ENCRYPT_KEY and ENCRYPT_KEY not in candidate_keys:
            candidate_keys.append(ENCRYPT_KEY)

        primary = ''
        for key in candidate_keys:
            value = _decrypt_with_key(data, key)
            if not primary:
                primary = value
            if _looks_like_plaintext(value):
                return value
        return primary
    except Exception:
        return text


def encrypt_system(system):
    """加密系统凭据字段（写入前调用）"""
    s = dict(system)
    for field in CREDENTIAL_FIELDS:
        if (
            field in s and s[field]
            and not str(s[field]).startswith(LEGACY_ENCRYPT_PREFIX)
            and not str(s[field]).startswith(CURRENT_ENCRYPT_PREFIX)
        ):
            s[field] = encrypt_field(s[field])
    return s


def decrypt_system(system):
    """解密系统凭据字段（读取后调用）"""
    s = dict(system)
    for field in CREDENTIAL_FIELDS:
        if field in s and s[field]:
            s[field] = decrypt_field(s[field])
    return s


def redact_system_credentials(systems):
    """返回去除敏感凭据的系统列表副本。"""
    safe_items = []
    for item in systems or []:
        if not isinstance(item, dict):
            continue
        safe = dict(item)
        for field in CREDENTIAL_FIELDS:
            if field in safe:
                safe[field] = ''
        safe_items.append(safe)
    return safe_items


# ============ 会话管理 ============

def get_session_ttl_seconds():
    """读取会话过期时间，默认 8 小时，可通过环境变量覆盖"""
    raw_seconds = os.environ.get('SESSION_TTL_SECONDS', '').strip()
    raw_hours = os.environ.get('SESSION_TTL_HOURS', '').strip()
    ttl = DEFAULT_SESSION_TTL_SECONDS
    try:
        if raw_seconds:
            ttl = int(raw_seconds)
        elif raw_hours:
            ttl = int(float(raw_hours) * 3600)
    except ValueError:
        ttl = DEFAULT_SESSION_TTL_SECONDS
    return max(60, ttl)


SESSION_TTL_SECONDS = get_session_ttl_seconds()


def get_remember_session_ttl_seconds():
    """读取“记住登录”会话时长，默认 30 天，可通过环境变量覆盖"""
    raw_seconds = os.environ.get('REMEMBER_SESSION_TTL_SECONDS', '').strip()
    raw_days = os.environ.get('REMEMBER_SESSION_TTL_DAYS', '').strip()
    ttl = DEFAULT_REMEMBER_SESSION_TTL_SECONDS
    try:
        if raw_seconds:
            ttl = int(raw_seconds)
        elif raw_days:
            ttl = int(float(raw_days) * 24 * 3600)
    except ValueError:
        ttl = DEFAULT_REMEMBER_SESSION_TTL_SECONDS
    return max(60, ttl)


REMEMBER_SESSION_TTL_SECONDS = get_remember_session_ttl_seconds()


def _to_iso8601(ts):
    return time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime(ts))


def _extract_auth_token(headers):
    token = (headers.get('X-Auth-Token', '') or '').strip()
    if token:
        return token
    auth = (headers.get('Authorization', '') or '').strip()
    if not auth:
        return ''
    if auth.lower().startswith('bearer '):
        return auth[7:].strip()
    return auth


def _purge_expired_sessions(now=None):
    if now is None:
        now = int(time.time())
    expired = []
    with SESSIONS_LOCK:
        for token, session in SESSIONS.items():
            if session.get('expires_at', 0) <= now:
                expired.append(token)
        for token in expired:
            SESSIONS.pop(token, None)


def parse_bool(value, default=False):
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return value != 0
    if isinstance(value, str):
        text = value.strip().lower()
        if text in {'1', 'true', 'yes', 'y', 'on'}:
            return True
        if text in {'0', 'false', 'no', 'n', 'off', ''}:
            return False
    return default


def create_session(user, role, remember=False):
    now = int(time.time())
    remember = bool(remember)
    ttl_seconds = REMEMBER_SESSION_TTL_SECONDS if remember else SESSION_TTL_SECONDS
    expires_at = now + ttl_seconds
    token = secrets.token_urlsafe(32)
    session = {
        'token': token,
        'user': user,
        'role': role,
        'remember': remember,
        'created_at': now,
        'expires_at': expires_at,
    }
    with SESSIONS_LOCK:
        SESSIONS[token] = session
    return dict(session)


def invalidate_user_sessions(user):
    with SESSIONS_LOCK:
        to_delete = [token for token, s in SESSIONS.items() if s.get('user') == user]
        for token in to_delete:
            SESSIONS.pop(token, None)


def get_valid_session(token):
    if not token:
        return None
    now = int(time.time())
    _purge_expired_sessions(now)
    with SESSIONS_LOCK:
        session = SESSIONS.get(token)
        if not session:
            return None
        if session.get('expires_at', 0) <= now:
            SESSIONS.pop(token, None)
            return None
        if not user_exists(session.get('user', '')):
            SESSIONS.pop(token, None)
            return None
        role = get_user_role(session.get('user', ''))
        if session.get('role') != role:
            session['role'] = role
        return dict(session)


def build_session_payload(session, include_token=False):
    now = int(time.time())
    expires_at = int(session.get('expires_at', now))
    payload = {
        'token_type': 'Bearer',
        'expires_in': max(0, expires_at - now),
        'expires_at': _to_iso8601(expires_at),
        'role': session.get('role', 'readonly'),
        'user': session.get('user'),
        'remember': bool(session.get('remember', False)),
    }
    if include_token:
        payload['token'] = session.get('token')
    return payload


# ============ SQLite 数据层 ============

def normalize_system_user(user=None):
    """系统数据使用的用户名 key（兼容历史 systems-*.json 命名规则）"""
    if not user:
        user = 'default'
    safe_user = re.sub(r'[^a-zA-Z0-9_\-\u4e00-\u9fff]', '', str(user))
    if not safe_user:
        safe_user = 'default'
    return safe_user


def _db_connect():
    os.makedirs(DATA_DIR, exist_ok=True)
    conn = sqlite3.connect(SQLITE_DB_FILE, timeout=30)
    conn.row_factory = sqlite3.Row
    return conn


def _init_db_schema(conn):
    conn.execute('''
        CREATE TABLE IF NOT EXISTS users (
            username TEXT PRIMARY KEY,
            password TEXT NOT NULL,
            role TEXT NOT NULL
        )
    ''')
    conn.execute('''
        CREATE TABLE IF NOT EXISTS systems (
            username TEXT PRIMARY KEY,
            data_json TEXT NOT NULL
        )
    ''')
    conn.execute('''
        CREATE TABLE IF NOT EXISTS login_rules (
            username TEXT PRIMARY KEY,
            data_json TEXT NOT NULL
        )
    ''')
    conn.execute('''
        CREATE TABLE IF NOT EXISTS likes (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            data_json TEXT NOT NULL
        )
    ''')
    conn.execute('''
        CREATE TABLE IF NOT EXISTS messages (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            data_json TEXT NOT NULL
        )
    ''')
    conn.execute('''
        CREATE TABLE IF NOT EXISTS meta (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        )
    ''')
    conn.execute('''
        CREATE TABLE IF NOT EXISTS audit_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp TEXT NOT NULL,
            actor_user TEXT,
            actor_role TEXT,
            action TEXT NOT NULL,
            target_user TEXT,
            resource_id TEXT,
            resource_name TEXT,
            client_ip TEXT,
            details_json TEXT
        )
    ''')


def _read_json_file(path, default):
    if not os.path.exists(path):
        return default
    try:
        with open(path, 'r', encoding='utf-8') as f:
            return json.load(f)
    except Exception:
        return default


def _migrate_json_to_sqlite(conn):
    row = conn.execute('SELECT value FROM meta WHERE key = ?', (DB_MIGRATION_KEY,)).fetchone()
    if row:
        return

    # 兼容更老版本：systems.json -> data/systems-default.json（保留原文件备份）
    old_db = os.path.join(DIR, 'systems.json')
    new_db = os.path.join(DATA_DIR, 'systems-default.json')
    if os.path.exists(old_db) and not os.path.exists(new_db):
        shutil.copyfile(old_db, new_db)
        print('📦 已迁移旧数据: systems.json → data/systems-default.json（保留原文件）')

    raw_users = _read_json_file(USERS_FILE, {})
    if isinstance(raw_users, dict):
        users, _ = normalize_users(raw_users)
        for username, record in users.items():
            conn.execute(
                'INSERT OR IGNORE INTO users(username, password, role) VALUES (?, ?, ?)',
                (username, str(record.get('password', '') or ''), str(record.get('role', 'editor') or 'editor'))
            )

    if os.path.exists(DATA_DIR):
        for name in sorted(os.listdir(DATA_DIR)):
            if not (name.startswith('systems-') and name.endswith('.json')):
                continue
            username = name[8:-5] or 'default'
            systems = _read_json_file(os.path.join(DATA_DIR, name), [])
            if not isinstance(systems, list):
                systems = []
            conn.execute(
                'INSERT OR IGNORE INTO systems(username, data_json) VALUES (?, ?)',
                (username, json.dumps(systems, ensure_ascii=False))
            )

    likes = _read_json_file(LIKES_FILE, {'count': 0, 'users': []})
    if not isinstance(likes, dict):
        likes = {'count': 0, 'users': []}
    conn.execute(
        'INSERT OR IGNORE INTO likes(id, data_json) VALUES (1, ?)',
        (json.dumps(likes, ensure_ascii=False),)
    )

    messages = _read_json_file(MESSAGES_FILE, [])
    if not isinstance(messages, list):
        messages = []
    conn.execute(
        'INSERT OR IGNORE INTO messages(id, data_json) VALUES (1, ?)',
        (json.dumps(messages, ensure_ascii=False),)
    )

    conn.execute(
        'INSERT OR REPLACE INTO meta(key, value) VALUES (?, ?)',
        (DB_MIGRATION_KEY, str(int(time.time())))
    )


def ensure_db_ready():
    global DB_INITIALIZED
    if DB_INITIALIZED:
        return
    with DB_INIT_LOCK:
        if DB_INITIALIZED:
            return
        with _db_connect() as conn:
            _init_db_schema(conn)
            _migrate_json_to_sqlite(conn)
            conn.commit()
        DB_INITIALIZED = True


# ============ 数据备份与恢复 ============

def get_backup_dir():
    return os.path.join(DATA_DIR, 'backups')


def _parse_int_env(keys, default, minimum=None, maximum=None):
    for key in keys:
        raw = str(os.environ.get(key, '') or '').strip()
        if not raw:
            continue
        try:
            value = int(float(raw))
        except ValueError:
            continue
        if minimum is not None:
            value = max(minimum, value)
        if maximum is not None:
            value = min(maximum, value)
        return value
    value = default
    if minimum is not None:
        value = max(minimum, value)
    if maximum is not None:
        value = min(maximum, value)
    return value


def get_backup_retention_count():
    return _parse_int_env(
        ['BACKUP_RETENTION_COUNT', 'BACKUP_RETENTION'],
        BACKUP_RETENTION_DEFAULT,
        minimum=1,
        maximum=200,
    )


def get_backup_interval_seconds():
    raw_seconds = _parse_int_env(['BACKUP_INTERVAL_SECONDS'], 0, minimum=0)
    if raw_seconds > 0:
        return raw_seconds
    raw_hours = _parse_int_env(['BACKUP_INTERVAL_HOURS'], 0, minimum=0)
    if raw_hours > 0:
        return raw_hours * 3600
    return BACKUP_INTERVAL_SECONDS_DEFAULT


def get_startup_backup_min_interval_seconds():
    raw_seconds = _parse_int_env(['BACKUP_STARTUP_MIN_INTERVAL_SECONDS'], 0, minimum=0)
    if raw_seconds > 0:
        return raw_seconds
    raw_minutes = _parse_int_env(['BACKUP_STARTUP_MIN_INTERVAL_MINUTES'], 0, minimum=0)
    if raw_minutes > 0:
        return raw_minutes * 60
    return BACKUP_STARTUP_MIN_INTERVAL_SECONDS_DEFAULT


def _sanitize_backup_kind(kind):
    safe = re.sub(r'[^a-zA-Z0-9_-]', '-', str(kind or 'manual')).strip('-').lower()
    return safe or 'manual'


def _build_backup_filename(kind):
    kind = _sanitize_backup_kind(kind)
    stamp = time.strftime('%Y%m%d-%H%M%S', time.localtime())
    suffix = generate_random_secret(6).lower()
    return f'sso-{stamp}-{kind}-{suffix}.db'


def _validate_backup_file_name(file_name):
    name = str(file_name or '').strip()
    if not name:
        return ''
    if len(name) > 180:
        return ''
    if os.path.basename(name) != name:
        return ''
    if '/' in name or '\\' in name:
        return ''
    if not re.fullmatch(r'[A-Za-z0-9._-]+\.db', name):
        return ''
    return name


def _backup_entry_from_path(path, file_name=None):
    if not os.path.exists(path):
        return None
    stat = os.stat(path)
    ts = int(stat.st_mtime)
    return {
        'file': file_name or os.path.basename(path),
        'size': int(stat.st_size),
        'mtime': ts,
        'time': time.strftime('%Y-%m-%d %H:%M:%S', time.localtime(ts)),
        'time_iso': _to_iso8601(ts),
    }


def _list_backup_entries_unlocked():
    backup_dir = get_backup_dir()
    if not os.path.exists(backup_dir):
        return []
    entries = []
    for name in os.listdir(backup_dir):
        if not name.endswith('.db'):
            continue
        safe_name = _validate_backup_file_name(name)
        if not safe_name:
            continue
        path = os.path.join(backup_dir, safe_name)
        item = _backup_entry_from_path(path, safe_name)
        if item:
            entries.append(item)
    entries.sort(key=lambda x: (x.get('mtime', 0), x.get('file', '')), reverse=True)
    return entries


def list_backups(limit=None):
    with BACKUP_LOCK:
        entries = _list_backup_entries_unlocked()
    if isinstance(limit, int) and limit > 0:
        return entries[:limit]
    return entries


def _prune_backups_unlocked(retention=None, protected_names=None):
    retention = retention if retention is not None else get_backup_retention_count()
    protected = set(protected_names or [])
    backups = _list_backup_entries_unlocked()
    preserved = 0
    removed = []
    for item in backups:
        name = item.get('file', '')
        if name in protected:
            continue
        preserved += 1
        if preserved <= retention:
            continue
        target = os.path.join(get_backup_dir(), name)
        try:
            os.remove(target)
            removed.append(name)
        except OSError:
            continue
    return removed


def create_sqlite_backup(kind='manual', protected_names=None):
    ensure_db_ready()
    os.makedirs(get_backup_dir(), exist_ok=True)
    file_name = _build_backup_filename(kind)
    backup_path = os.path.join(get_backup_dir(), file_name)
    tmp_path = backup_path + '.tmp'

    with BACKUP_LOCK:
        try:
            with sqlite3.connect(SQLITE_DB_FILE, timeout=30) as src_conn:
                src_conn.execute('PRAGMA busy_timeout = 30000')
                src_conn.execute('PRAGMA wal_checkpoint(PASSIVE)')
                with sqlite3.connect(tmp_path, timeout=30) as dst_conn:
                    src_conn.backup(dst_conn)
                    dst_conn.commit()
            os.replace(tmp_path, backup_path)
            try:
                os.chmod(backup_path, 0o600)
            except OSError:
                pass
            protect = set(protected_names or [])
            protect.add(file_name)
            _prune_backups_unlocked(get_backup_retention_count(), protected_names=protect)
            return _backup_entry_from_path(backup_path, file_name)
        except Exception:
            try:
                if os.path.exists(tmp_path):
                    os.remove(tmp_path)
            except OSError:
                pass
            raise


def restore_sqlite_backup(file_name):
    safe_name = _validate_backup_file_name(file_name)
    if not safe_name:
        raise ValueError('备份文件名非法')

    ensure_db_ready()
    os.makedirs(get_backup_dir(), exist_ok=True)
    backup_path = os.path.join(get_backup_dir(), safe_name)
    if not os.path.exists(backup_path) or not os.path.isfile(backup_path):
        raise FileNotFoundError('备份文件不存在')

    with BACKUP_LOCK:
        if not os.path.exists(backup_path):
            raise FileNotFoundError('备份文件不存在')

        safety = create_sqlite_backup(kind='pre-restore', protected_names={safe_name})
        with sqlite3.connect(backup_path, timeout=30) as src_conn:
            src_conn.execute('PRAGMA busy_timeout = 30000')
            with sqlite3.connect(SQLITE_DB_FILE, timeout=30) as dst_conn:
                dst_conn.execute('PRAGMA busy_timeout = 30000')
                src_conn.backup(dst_conn)
                dst_conn.commit()

        _prune_backups_unlocked(
            get_backup_retention_count(),
            protected_names={safe_name, (safety or {}).get('file', '')},
        )
        return {
            'restored': _backup_entry_from_path(backup_path, safe_name),
            'safety_backup': safety,
        }


def maybe_create_startup_backup():
    min_interval = get_startup_backup_min_interval_seconds()
    backups = list_backups(limit=1)
    now = int(time.time())
    if backups:
        latest_ts = int(backups[0].get('mtime', 0))
        if latest_ts > 0 and now - latest_ts < min_interval:
            print(
                f'⏭️ 启动备份跳过（距离上次备份 {now - latest_ts}s，最小间隔 {min_interval}s）'
            )
            return None
    return create_sqlite_backup(kind='startup')


def _backup_scheduler_loop():
    while True:
        interval = max(60, int(get_backup_interval_seconds()))
        time.sleep(interval)
        try:
            item = create_sqlite_backup(kind='auto')
            if item:
                print(f'🧷 自动备份完成: {item.get("file")} ({item.get("size")} bytes)')
        except Exception as e:
            print(f'⚠️ 自动备份失败: {e}')


def start_backup_scheduler():
    global BACKUP_SCHEDULER_STARTED
    if BACKUP_SCHEDULER_STARTED:
        return
    BACKUP_SCHEDULER_STARTED = True
    thread = threading.Thread(target=_backup_scheduler_loop, daemon=True, name='backup-scheduler')
    thread.start()


# ============ 用户密码管理 ============

def load_users():
    """加载用户表并兼容迁移旧格式"""
    ensure_db_ready()
    with _db_connect() as conn:
        rows = conn.execute('SELECT username, password, role FROM users').fetchall()
    raw_users = {
        row['username']: {
            'password': row['password'],
            'role': row['role']
        }
        for row in rows
    }
    users, changed = normalize_users(raw_users)
    if changed:
        save_users(users)
    return users


def save_users(users):
    """保存用户密码表"""
    ensure_db_ready()
    users, _ = normalize_users(users)
    with _db_connect() as conn:
        conn.execute('DELETE FROM users')
        conn.executemany(
            'INSERT INTO users(username, password, role) VALUES (?, ?, ?)',
            [
                (username, record.get('password', ''), record.get('role', 'editor'))
                for username, record in users.items()
            ]
        )
        conn.commit()


def normalize_users(users):
    changed = False
    normalized = {}
    for username, record in users.items():
        role = 'editor'
        password = ''
        if isinstance(record, str):
            password = record
            changed = True
        elif isinstance(record, dict):
            password = str(record.get('password', '') or '')
            raw_role = str(record.get('role', 'editor') or 'editor').lower()
            if raw_role in VALID_ROLES:
                role = raw_role
            else:
                changed = True
                role = 'editor'
            # 清理无效字段，统一结构
            if set(record.keys()) != {'password', 'role'}:
                changed = True
            if record.get('password', '') != password or record.get('role', 'editor') != role:
                changed = True
        else:
            changed = True

        if username == 'default' and role != 'admin':
            role = 'admin'
            changed = True
        if role not in VALID_ROLES:
            role = 'editor'
            changed = True

        normalized[username] = {'password': password, 'role': role}

    return normalized, changed


def get_user_role(user, users=None):
    if not user:
        user = 'default'
    if users is None:
        users = load_users()
    record = users.get(user)
    if not record:
        return 'readonly'
    role = record.get('role', 'editor')
    if role not in VALID_ROLES:
        role = 'editor'
    if user == 'default':
        role = 'admin'
    return role


def verify_password(user, password):
    """验证用户密码（支持哈希和明文自动迁移）"""
    users = load_users()
    if user not in users:
        return False
    stored = users[user].get('password', '')
    if verify_hashed_password(stored, password):
        # 旧格式: 明文 → 自动迁移到哈希
        if ':' not in stored or len(stored) <= 40:
            users[user]['password'] = hash_password(password)
            save_users(users)
        return True
    return False


def register_user(user, password, role='editor'):
    """注册新用户（密码哈希存储）"""
    users = load_users()
    if user in users:
        return False  # 用户已存在
    safe_role = role if role in VALID_ROLES else 'editor'
    if user == 'default':
        safe_role = 'admin'
    users[user] = {'password': hash_password(password), 'role': safe_role}
    save_users(users)
    return True


def user_exists(user):
    """检查用户是否已注册"""
    ensure_db_ready()
    with _db_connect() as conn:
        row = conn.execute('SELECT 1 FROM users WHERE username = ? LIMIT 1', (user,)).fetchone()
    return row is not None


def delete_user(user):
    """删除用户及其数据"""
    users = load_users()
    if user in users:
        del users[user]
        save_users(users)
    invalidate_user_sessions(user)
    ensure_db_ready()
    with _db_connect() as conn:
        conn.execute('DELETE FROM systems WHERE username = ?', (normalize_system_user(user),))
        conn.commit()
    return True


# ============ 点赞管理 ============

def load_likes():
    """加载点赞数据"""
    ensure_db_ready()
    with _db_connect() as conn:
        row = conn.execute('SELECT data_json FROM likes WHERE id = 1').fetchone()
    if not row:
        return {'count': 0, 'users': []}
    try:
        data = json.loads(row['data_json'])
        if isinstance(data, dict):
            data.setdefault('count', 0)
            data.setdefault('users', [])
            return data
    except Exception:
        pass
    return {'count': 0, 'users': []}


def save_likes(likes):
    """保存点赞数据"""
    ensure_db_ready()
    with _db_connect() as conn:
        conn.execute(
            'INSERT OR REPLACE INTO likes(id, data_json) VALUES (1, ?)',
            (json.dumps(likes, ensure_ascii=False),)
        )
        conn.commit()


# ============ 留言管理 ============

def load_messages():
    """加载留言数据"""
    ensure_db_ready()
    with _db_connect() as conn:
        row = conn.execute('SELECT data_json FROM messages WHERE id = 1').fetchone()
    if not row:
        return []
    try:
        data = json.loads(row['data_json'])
        if isinstance(data, list):
            return data
    except Exception:
        pass
    return []


def save_messages(messages):
    """保存留言数据"""
    ensure_db_ready()
    with _db_connect() as conn:
        conn.execute(
            'INSERT OR REPLACE INTO messages(id, data_json) VALUES (1, ?)',
            (json.dumps(messages, ensure_ascii=False),)
        )
        conn.commit()


# ============ 系统数据管理 ============

def get_db_file(user=None):
    """根据用户名返回对应的 JSON 文件路径"""
    if user:
        safe_user = normalize_system_user(user)
        return os.path.join(DATA_DIR, f'systems-{safe_user}.json')
    return os.path.join(DATA_DIR, 'systems-default.json')


def load_systems(user=None):
    ensure_db_ready()
    db_user = normalize_system_user(user)
    with _db_connect() as conn:
        row = conn.execute('SELECT data_json FROM systems WHERE username = ?', (db_user,)).fetchone()
    if row:
        try:
            systems = json.loads(row['data_json'])
            if not isinstance(systems, list):
                systems = []
        except Exception:
            systems = []
        return [decrypt_system(s) if isinstance(s, dict) else s for s in systems]

    # 新用户：从 default 复制数据，但清空密码/OTP/Token/TOTP Secret
    if user and db_user != 'default':
        default_systems = load_systems(None)
        if default_systems:
            copied = []
            for s in default_systems:
                if not isinstance(s, dict):
                    continue
                item = dict(s)
                item['password'] = ''
                item['otp'] = ''
                item['token'] = ''
                item['otp_secret'] = ''
                copied.append(item)
            # 保存为新用户数据
            save_systems(copied, user)
            return copied
    return []


def save_systems(systems, user=None):
    ensure_db_ready()
    db_user = normalize_system_user(user)
    # 加密凭据后保存
    encrypted = [encrypt_system(s) if isinstance(s, dict) else s for s in systems]
    with _db_connect() as conn:
        conn.execute(
            'INSERT OR REPLACE INTO systems(username, data_json) VALUES (?, ?)',
            (db_user, json.dumps(encrypted, ensure_ascii=False))
        )
        conn.commit()


def list_users():
    """列出所有已有用户"""
    ensure_db_ready()
    with _db_connect() as conn:
        rows = conn.execute('SELECT username FROM systems ORDER BY username').fetchall()
    return [row['username'] for row in rows]


LOGIN_RULES_META_PREFIX = 'login_rules::'
LOGIN_RULE_FLOW_TYPES = {'auto', 'basic', 'iam', 'k8s', 'vaadin'}
LOGIN_RULE_SUBMIT_STRATEGIES = {'auto', 'click', 'enter', 'manual'}


def _split_rule_list_value(value):
    if isinstance(value, list):
        values = value
    else:
        values = re.split(r'[\n,;，；、]+', str(value or ''))
    result = []
    seen = set()
    for item in values:
        text = str(item or '').strip()
        if not text or text in seen:
            continue
        seen.add(text)
        result.append(text)
    return result


def _normalize_login_rule_id(value):
    raw = str(value or '').strip()
    if not raw:
        raw = 'rule-' + secrets.token_hex(4)
    raw = re.sub(r'[^a-zA-Z0-9._:-]+', '-', raw).strip('-')
    return raw or ('rule-' + secrets.token_hex(4))


def normalize_login_rule(rule):
    item = dict(rule or {})
    flow_type = str(item.get('flow_type') or item.get('flow') or 'auto').strip().lower()
    if flow_type not in LOGIN_RULE_FLOW_TYPES:
        flow_type = 'auto'
    submit_strategy = str(item.get('submit_strategy') or 'auto').strip().lower()
    if submit_strategy not in LOGIN_RULE_SUBMIT_STRATEGIES:
        submit_strategy = 'auto'
    otp_submit_strategy = str(item.get('otp_submit_strategy') or 'auto').strip().lower()
    if otp_submit_strategy not in LOGIN_RULE_SUBMIT_STRATEGIES:
        otp_submit_strategy = 'auto'
    try:
        priority = int(item.get('priority', 50))
    except Exception:
        priority = 50
    priority = max(0, min(1000, priority))
    return {
        'id': _normalize_login_rule_id(item.get('id')),
        'name': str(item.get('name') or '').strip() or '未命名规则',
        'enabled': parse_bool(item.get('enabled', True), True),
        'priority': priority,
        'domains': _split_rule_list_value(item.get('domains', [])),
        'path_keywords': _split_rule_list_value(item.get('path_keywords', [])),
        'url_keywords': _split_rule_list_value(item.get('url_keywords', [])),
        'flow_type': flow_type,
        'username_selector': str(item.get('username_selector') or '').strip(),
        'password_selector': str(item.get('password_selector') or '').strip(),
        'otp_selector': str(item.get('otp_selector') or '').strip(),
        'token_selector': str(item.get('token_selector') or '').strip(),
        'submit_selector': str(item.get('submit_selector') or '').strip(),
        'submit_text': str(item.get('submit_text') or '').strip(),
        'submit_strategy': submit_strategy,
        'otp_dialog_selector': str(item.get('otp_dialog_selector') or '').strip(),
        'otp_submit_selector': str(item.get('otp_submit_selector') or '').strip(),
        'otp_submit_text': str(item.get('otp_submit_text') or '').strip(),
        'otp_submit_strategy': otp_submit_strategy,
        'notes': str(item.get('notes') or '').strip(),
    }


def normalize_login_rules(rules):
    if not isinstance(rules, list):
        rules = []
    normalized = []
    seen = set()
    for rule in rules:
        if not isinstance(rule, dict):
            continue
        item = normalize_login_rule(rule)
        base_id = item['id']
        while item['id'] in seen:
            item['id'] = _normalize_login_rule_id(base_id + '-' + secrets.token_hex(2))
        seen.add(item['id'])
        normalized.append(item)
    normalized.sort(key=lambda item: (-int(item.get('priority', 0)), str(item.get('name', ''))))
    return normalized


def load_login_rules(user=None):
    ensure_db_ready()
    db_user = normalize_system_user(user)
    key = LOGIN_RULES_META_PREFIX + db_user
    with _db_connect() as conn:
        row = conn.execute('SELECT value FROM meta WHERE key = ?', (key,)).fetchone()
    if row:
        try:
            data = json.loads(row['value'])
        except Exception:
            data = []
        return normalize_login_rules(data)

    if user and db_user != 'default':
        default_rules = load_login_rules(None)
        if default_rules:
            save_login_rules(default_rules, user)
            return default_rules
    return []


def save_login_rules(rules, user=None):
    ensure_db_ready()
    db_user = normalize_system_user(user)
    key = LOGIN_RULES_META_PREFIX + db_user
    normalized = normalize_login_rules(rules)
    with _db_connect() as conn:
        conn.execute(
            'INSERT OR REPLACE INTO meta(key, value) VALUES (?, ?)',
            (key, json.dumps(normalized, ensure_ascii=False))
        )
        conn.commit()


# ============ 审计日志 ============

def write_audit_log(
    action,
    actor_user='',
    actor_role='',
    target_user='',
    resource_id=None,
    resource_name='',
    client_ip='',
    details=None,
):
    ensure_db_ready()
    payload = ''
    if details is not None:
        try:
            payload = json.dumps(details, ensure_ascii=False)
        except Exception:
            payload = json.dumps({'raw': str(details)}, ensure_ascii=False)
    with _db_connect() as conn:
        conn.execute(
            '''
            INSERT INTO audit_logs(
                timestamp, actor_user, actor_role, action,
                target_user, resource_id, resource_name, client_ip, details_json
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            ''',
            (
                time.strftime('%Y-%m-%d %H:%M:%S'),
                str(actor_user or ''),
                str(actor_role or ''),
                str(action or ''),
                str(target_user or ''),
                '' if resource_id is None else str(resource_id),
                str(resource_name or ''),
                str(client_ip or ''),
                payload,
            ),
        )
        conn.commit()


def query_audit_logs(page=1, page_size=20, user_filter='', action_filter='', actor_user=None):
    ensure_db_ready()
    page = max(1, int(page or 1))
    page_size = max(1, min(100, int(page_size or 20)))
    where = []
    params = []

    if actor_user:
        where.append('(actor_user = ? OR target_user = ?)')
        params.extend([actor_user, actor_user])

    if user_filter:
        where.append('(actor_user = ? OR target_user = ?)')
        params.extend([user_filter, user_filter])

    if action_filter:
        where.append('action = ?')
        params.append(action_filter)

    where_sql = (' WHERE ' + ' AND '.join(where)) if where else ''

    with _db_connect() as conn:
        total_row = conn.execute(
            f'SELECT COUNT(1) AS total FROM audit_logs{where_sql}',
            params
        ).fetchone()
        total = int(total_row['total'] if total_row else 0)
        offset = (page - 1) * page_size
        rows = conn.execute(
            f'''
            SELECT id, timestamp, actor_user, actor_role, action, target_user,
                   resource_id, resource_name, client_ip, details_json
            FROM audit_logs
            {where_sql}
            ORDER BY id DESC
            LIMIT ? OFFSET ?
            ''',
            params + [page_size, offset]
        ).fetchall()

    items = []
    for row in rows:
        details = None
        details_raw = row['details_json'] or ''
        if details_raw:
            try:
                details = json.loads(details_raw)
            except Exception:
                details = {'raw': details_raw}
        items.append({
            'id': row['id'],
            'timestamp': row['timestamp'],
            'actor_user': row['actor_user'],
            'actor_role': row['actor_role'],
            'action': row['action'],
            'target_user': row['target_user'],
            'resource_id': row['resource_id'],
            'resource_name': row['resource_name'],
            'client_ip': row['client_ip'],
            'details': details,
        })

    total_pages = (total + page_size - 1) // page_size if total else 0
    return {
        'items': items,
        'total': total,
        'page': page,
        'page_size': page_size,
        'total_pages': total_pages,
    }


# ============ 健康检查 ============

def _health_status_rank(status):
    if status is None:
        return 99
    if 200 <= status < 300:
        return 0
    if 300 <= status < 400:
        return 1
    if status in {401, 403, 405}:
        return 2
    if 400 <= status < 500:
        return 3
    if 500 <= status < 600:
        return 4
    return 5


def _classify_health_status(status):
    reason = HTTPStatus(status).phrase if status in HTTPStatus._value2member_map_ else ''
    reason_text = f'HTTP {status}' + (f' {reason}' if reason else '')
    if 200 <= status < 300:
        return ('ok', 'healthy', reason_text)
    if 300 <= status < 400:
        return ('redirect', 'reachable', reason_text + '（重定向）')
    if status in {401, 403}:
        return ('auth_required', 'reachable', reason_text + '（需要认证）')
    if status == 405:
        return ('method_not_allowed', 'reachable', reason_text + '（服务可达）')
    if 400 <= status < 500:
        return ('client_error', 'reachable', reason_text + '（服务可达）')
    if 500 <= status < 600:
        return ('server_error', 'reachable', reason_text + '（服务可达）')
    return ('http_response', 'reachable', reason_text + '（服务可达）')


def _probe_url_once(url, method='HEAD', timeout=4):
    start = time.time()
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    req = urllib.request.Request(url, method=method)
    req.add_header('User-Agent', 'MiaoDeng-HealthCheck/1.1')
    try:
        with urllib.request.urlopen(req, timeout=timeout, context=ctx) as resp:
            status = int(getattr(resp, 'status', 0) or resp.getcode() or 0)
            latency = int((time.time() - start) * 1000)
            return {
                'reachable': True,
                'status': status,
                'latency': latency,
                'method': method,
                'error': '',
            }
    except urllib.error.HTTPError as e:
        latency = int((time.time() - start) * 1000)
        return {
            'reachable': True,
            'status': int(e.code),
            'latency': latency,
            'method': method,
            'error': str(getattr(e, 'reason', '') or '')[:120],
        }
    except Exception as e:
        latency = int((time.time() - start) * 1000)
        return {
            'reachable': False,
            'status': None,
            'latency': latency,
            'method': method,
            'error': str(e)[:120],
        }


def _build_health_result(probe, attempts):
    status = probe.get('status')
    status_class, state, reason = _classify_health_status(status)
    return {
        'online': True,
        'reachable': True,
        'healthy': state == 'healthy',
        'status': status,
        'status_class': status_class,
        'state': state,
        'reason': reason,
        'method': probe.get('method'),
        'latency': probe.get('latency'),
        'retry_count': max(0, int(probe.get('attempt', 1)) - 1),
        'attempts': attempts,
        'error': '',
    }


def check_url_health(url):
    """检查 URL 可达性：支持 HEAD/GET 探测、网络失败重试、非 2xx 可达分类。"""
    methods = ('HEAD', 'GET')
    attempts = []
    max_rounds = 2
    for round_idx in range(max_rounds):
        reachable_probes = []
        timeout = 4 + round_idx
        for method in methods:
            probe = _probe_url_once(url, method=method, timeout=timeout)
            probe['attempt'] = round_idx + 1
            attempts.append(probe)
            if probe.get('reachable'):
                reachable_probes.append(probe)
                if probe.get('status') and 200 <= int(probe['status']) < 300:
                    return _build_health_result(probe, attempts)
                # 若 HEAD 已探测到可达但方法受限，继续 GET 再判断
                if method == 'GET':
                    break

        if reachable_probes:
            best = sorted(
                reachable_probes,
                key=lambda p: (_health_status_rank(p.get('status')), p.get('latency', 999999))
            )[0]
            return _build_health_result(best, attempts)

        if round_idx < max_rounds - 1:
            time.sleep(0.15)

    last_error = ''
    for item in reversed(attempts):
        if item.get('error'):
            last_error = item['error']
            break
    if not last_error:
        last_error = '连接失败'

    return {
        'online': False,
        'reachable': False,
        'healthy': False,
        'status': None,
        'status_class': 'network_error',
        'state': 'offline',
        'reason': '网络不可达',
        'method': attempts[-1]['method'] if attempts else 'HEAD',
        'latency': attempts[-1]['latency'] if attempts else None,
        'retry_count': max_rounds - 1,
        'attempts': attempts,
        'error': last_error,
    }


# ============ 版本中心 ============

def _read_json_dict_file(path):
    if not os.path.exists(path):
        return {}
    try:
        with open(path, 'r', encoding='utf-8') as f:
            data = json.load(f)
            return data if isinstance(data, dict) else {}
    except Exception:
        return {}


def _iter_extension_source_files():
    """列出用于打包插件的源码文件（排除临时/隐藏目录）。"""
    if not os.path.isdir(EXTENSION_DIR):
        return []
    rel_files = []
    excluded_dirs = {'.omx', '.omc', '__pycache__'}
    for root, dirs, files in os.walk(EXTENSION_DIR):
        dirs[:] = sorted(d for d in dirs if not d.startswith('.') and d not in excluded_dirs)
        for name in sorted(files):
            if name.startswith('.') or name == '.DS_Store':
                continue
            abs_path = os.path.join(root, name)
            if not os.path.isfile(abs_path):
                continue
            rel_path = os.path.relpath(abs_path, EXTENSION_DIR).replace(os.sep, '/')
            rel_files.append(rel_path)
    return rel_files


def _zip_manifest_version(zip_path, manifest_entry):
    if not os.path.exists(zip_path):
        return ''
    try:
        with zipfile.ZipFile(zip_path, 'r') as zf:
            with zf.open(manifest_entry) as mf:
                data = json.loads(mf.read().decode('utf-8'))
        if isinstance(data, dict):
            return str(data.get('version') or '')
    except Exception:
        return ''
    return ''


def _latest_mtime(paths):
    latest = 0
    for path in paths:
        try:
            latest = max(latest, os.path.getmtime(path))
        except OSError:
            continue
    return latest


def _archive_needs_refresh(zip_path, source_paths, expected_version, manifest_entry):
    if not os.path.exists(zip_path):
        return True
    try:
        zip_mtime = os.path.getmtime(zip_path)
    except OSError:
        return True
    if zip_mtime < _latest_mtime(source_paths):
        return True
    if expected_version:
        packed_version = _zip_manifest_version(zip_path, manifest_entry)
        if packed_version != expected_version:
            return True
    return False


def _write_zip(zip_path, entries):
    tmp_path = f'{zip_path}.tmp'
    os.makedirs(os.path.dirname(zip_path), exist_ok=True)
    try:
        with zipfile.ZipFile(tmp_path, 'w', compression=zipfile.ZIP_DEFLATED) as zf:
            for src_path, arc_path in entries:
                zf.write(src_path, arc_path)
        os.replace(tmp_path, zip_path)
    finally:
        if os.path.exists(tmp_path):
            try:
                os.remove(tmp_path)
            except OSError:
                pass


def _build_auto_archive(zip_path):
    rel_files = _iter_extension_source_files()
    if not rel_files:
        raise FileNotFoundError(f'未找到插件目录: {EXTENSION_DIR}')
    entries = []
    for rel_path in rel_files:
        src_path = os.path.join(EXTENSION_DIR, rel_path)
        entries.append((src_path, f'chrome-extension/{rel_path}'))
    _write_zip(zip_path, entries)


def _build_store_archive(zip_path):
    rel_files = _iter_extension_source_files()
    if not rel_files:
        raise FileNotFoundError(f'未找到插件目录: {EXTENSION_DIR}')
    entries = []
    for rel_path in rel_files:
        if rel_path == 'manifest.json':
            continue
        src_path = os.path.join(EXTENSION_DIR, rel_path)
        arc_path = 'manifest.json' if rel_path == 'manifest-store.json' else rel_path
        entries.append((src_path, arc_path))
    _write_zip(zip_path, entries)


def ensure_extension_archive(path):
    """按需生成插件安装包，确保下载链接始终可用且版本同步。"""
    target_path = EXTENSION_ARCHIVE_TARGETS.get(path)
    if not target_path:
        return
    manifest = _read_json_dict_file(os.path.join(EXTENSION_DIR, 'manifest.json'))
    store_manifest = _read_json_dict_file(os.path.join(EXTENSION_DIR, 'manifest-store.json'))
    latest_version = str(manifest.get('version') or '')
    store_version = str(store_manifest.get('version') or latest_version)
    rel_files = _iter_extension_source_files()
    source_paths = [os.path.join(EXTENSION_DIR, rel) for rel in rel_files]
    with EXTENSION_ARCHIVE_LOCK:
        if path in ('/auto-login-extension.zip', '/miaodeng-latest.zip'):
            if _archive_needs_refresh(
                target_path,
                source_paths,
                latest_version,
                'chrome-extension/manifest.json'
            ):
                _build_auto_archive(target_path)
            return
        if path == '/auto-login-extension-store.zip':
            if _archive_needs_refresh(
                target_path,
                source_paths,
                store_version,
                'manifest.json'
            ):
                _build_store_archive(target_path)


def _extract_latest_release_from_changelog():
    path = os.path.join(DIR, 'CHANGELOG.md')
    if not os.path.exists(path):
        return {
            'raw': '',
            'version': 'unknown',
            'date': '',
            'title': '',
        }
    try:
        with open(path, 'r', encoding='utf-8') as f:
            for raw_line in f:
                line = (raw_line or '').strip()
                if not line.startswith('## '):
                    continue
                raw = line[3:].strip()
                version = raw
                date = ''
                title = ''
                # 例：2026-02-18 · v3.22
                if '·' in raw:
                    left, right = raw.split('·', 1)
                    date = left.strip()
                    version = right.strip() or raw
                m = re.search(r'(v\d+(?:\.\d+){0,3})', raw, re.IGNORECASE)
                if m:
                    version = m.group(1)
                return {
                    'raw': raw,
                    'version': version,
                    'date': date,
                    'title': title,
                }
    except Exception:
        pass
    return {
        'raw': '',
        'version': 'unknown',
        'date': '',
        'title': '',
    }


def get_version_center_payload():
    latest_release = _extract_latest_release_from_changelog()
    ext_manifest = _read_json_dict_file(os.path.join(DIR, 'chrome-extension', 'manifest.json'))
    ext_store_manifest = _read_json_dict_file(os.path.join(DIR, 'chrome-extension', 'manifest-store.json'))
    now = int(time.time())
    return {
        'ok': True,
        'server': {
            'time': now,
            'started_at': SERVER_START_TS,
            'uptime_seconds': max(0, now - SERVER_START_TS),
        },
        'portal': {
            'version': latest_release.get('version') or 'unknown',
            'release': latest_release.get('raw') or '',
            'release_date': latest_release.get('date') or '',
            'changelog_url': '/CHANGELOG.md',
        },
        'plugin': {
            'latest_version': str(ext_manifest.get('version') or ''),
            'store_version': str(ext_store_manifest.get('version') or ''),
            'manifest_url': '/chrome-extension/manifest.json',
            'store_manifest_url': '/chrome-extension/manifest-store.json',
        },
    }


# ============ HTTP Handler ============

class SSOHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIR, **kwargs)

    def end_headers(self):
        # 避免浏览器命中旧版脚本缓存导致页面行为与服务端不一致
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()

    def _get_user(self):
        """从 URL 参数中获取 user"""
        query = parse_qs(urlparse(self.path).query)
        user_list = query.get('user', [])
        return user_list[0] if user_list else None

    def _client_ip(self):
        fwd = (self.headers.get('X-Forwarded-For', '') or '').strip()
        if fwd:
            return fwd.split(',')[0].strip()
        return (self.client_address[0] if self.client_address else '') or ''

    def _audit(self, action, actor=None, target_user='', resource_id=None, resource_name='', details=None):
        actor = actor or {}
        write_audit_log(
            action=action,
            actor_user=actor.get('user', ''),
            actor_role=actor.get('role', ''),
            target_user=target_user,
            resource_id=resource_id,
            resource_name=resource_name,
            client_ip=self._client_ip(),
            details=details,
        )

    def _normalized_static_path(self, path):
        raw = unquote(path or '/')
        normalized = '/' + posixpath.normpath(raw).lstrip('/')
        if raw.endswith('/') and normalized != '/':
            normalized = normalized + '/'
        return normalized

    def _is_allowed_static_path(self, path):
        normalized = self._normalized_static_path(path)
        if normalized in ('/', '/index.html'):
            return True

        blocked_prefixes = (
            '/data',
            '/.git',
            '/.omx',
            '/.omc',
            '/__pycache__',
            '/tests',
            '/deploy',
        )
        for prefix in blocked_prefixes:
            if normalized == prefix or normalized.startswith(prefix + '/'):
                return False
        if normalized.startswith('/.') or '/.' in normalized:
            return False

        if normalized in STATIC_ALLOWED_FILES:
            return True
        return any(normalized.startswith(prefix) for prefix in STATIC_ALLOWED_PREFIXES)

    def _check_read_auth(self, user):
        """读凭据鉴权：支持 token 和旧版 X-Auth-Password。"""
        target_user = normalize_system_user(user)

        token = _extract_auth_token(self.headers)
        if token:
            session = get_valid_session(token)
            if session and (session.get('user') == target_user or session.get('role') == 'admin'):
                return session
            return None

        pwd = self.headers.get('X-Auth-Password', '')
        if verify_password(target_user, pwd):
            role = get_user_role(target_user)
            return {'user': target_user, 'role': role, 'token': None}
        return None

    def _check_auth(self, user, allowed_roles=None):
        """写操作鉴权：优先 token，兼容旧 X-Auth-Password"""
        if not user:
            user = 'default'
        if allowed_roles is None:
            allowed_roles = {'editor', 'admin'}

        token = _extract_auth_token(self.headers)
        if token:
            session = get_valid_session(token)
            if not session:
                self._json_response({'error': '会话已失效，请重新登录'}, 401)
                return None
            if session['role'] not in allowed_roles:
                self._json_response({'error': '当前角色无写权限'}, 403)
                return None
            if session['user'] != user and session['role'] != 'admin':
                self._json_response({'error': '无权操作其他用户数据'}, 403)
                return None
            return session

        pwd = self.headers.get('X-Auth-Password', '')
        if verify_password(user, pwd):
            role = get_user_role(user)
            if role not in allowed_roles:
                self._json_response({'error': '当前角色无写权限'}, 403)
                return None
            return {'user': user, 'role': role, 'token': None}
        self._json_response({'error': '密码错误'}, 403)
        return None

    def do_GET(self):
        path = urlparse(self.path).path
        user = self._get_user()

        if path == '/api/session':
            token = _extract_auth_token(self.headers)
            session = get_valid_session(token)
            if not session:
                self._json_response({'error': '会话无效或已过期'}, 401)
                return
            payload = build_session_payload(session, include_token=False)
            payload['ok'] = True
            self._json_response(payload)
        elif path == '/api/systems':
            systems = load_systems(user)
            if self._check_read_auth(user):
                self._json_response(systems)
            else:
                self._json_response(
                    redact_system_credentials(systems),
                    extra_headers={'X-SSO-Credentials-Redacted': '1'}
                )
        elif path == '/api/systems/export':
            # 导出系统列表（不含凭据）
            query = parse_qs(urlparse(self.path).query)
            include_cred = query.get('include_cred', ['0'])[0] == '1'
            systems = load_systems(user)
            if include_cred:
                if not self._check_read_auth(user):
                    self._json_response({'error': '需要登录后导出凭据'}, 401)
                    return
                export_data = systems
            else:
                # 去除敏感字段
                export_data = []
                for s in systems:
                    es = dict(s)
                    es.pop('password', None)
                    es.pop('otp', None)
                    es.pop('token', None)
                    es.pop('otp_secret', None)
                    export_data.append(es)
            self._json_response({
                'user': user or 'default',
                'exported_at': time.strftime('%Y-%m-%d %H:%M:%S'),
                'systems': export_data
            })
        elif path == '/api/login-rules':
            session = self._check_read_auth(user)
            if not session:
                self._json_response({'error': '需要登录后查看登录规则中心'}, 401)
                return
            self._json_response({
                'ok': True,
                'user': normalize_system_user(user),
                'items': load_login_rules(user),
            })
        elif path == '/api/users':
            self._json_response(list_users())
        elif path == '/api/user/check':
            # 检查用户是否已注册
            if user:
                registered = user_exists(user)
                self._json_response({
                    'user': user,
                    'registered': registered,
                    'role': get_user_role(user) if registered else None
                })
            else:
                registered = user_exists('default')
                self._json_response({
                    'user': 'default',
                    'registered': registered,
                    'role': get_user_role('default') if registered else None
                })
        elif path == '/api/audit-logs':
            session = self._check_auth('default', allowed_roles={'admin'})
            if not session:
                return
            query = parse_qs(urlparse(self.path).query)
            try:
                page = int(query.get('page', ['1'])[0] or '1')
            except ValueError:
                page = 1
            try:
                page_size = int(query.get('page_size', ['20'])[0] or '20')
            except ValueError:
                page_size = 20
            user_filter = (query.get('user', [''])[0] or '').strip()
            action_filter = (query.get('action', [''])[0] or '').strip()
            data = query_audit_logs(
                page=page,
                page_size=page_size,
                user_filter=user_filter,
                action_filter=action_filter,
            )
            data['ok'] = True
            self._json_response(data)
        elif path == '/api/backups':
            session = self._check_auth('default', allowed_roles={'admin'})
            if not session:
                return
            self._json_response({
                'ok': True,
                'items': list_backups(),
                'retention': get_backup_retention_count(),
            })
        elif path == '/api/version-center':
            self._json_response(get_version_center_payload())
        elif path == '/api/likes':
            # 获取点赞数据
            self._json_response(load_likes())
        elif path == '/api/messages':
            # 获取留言列表
            self._json_response(load_messages())
        elif path == '/':
            self.send_response(302)
            self.send_header('Location', '/sso-portal.html')
            self.end_headers()
        else:
            if path in EXTENSION_ARCHIVE_TARGETS:
                try:
                    ensure_extension_archive(path)
                except Exception as e:
                    print(f'❌ 生成插件安装包失败 {path}: {e}')
                    self.send_error(500, 'Plugin archive generation failed')
                    return
            if not self._is_allowed_static_path(path):
                self.send_error(404, 'Not Found')
                return
            super().do_GET()

    def do_HEAD(self):
        path = urlparse(self.path).path
        if path.startswith('/api/'):
            self.send_response(405)
            self._cors_headers()
            self.end_headers()
            return
        if path == '/':
            self.send_response(302)
            self.send_header('Location', '/sso-portal.html')
            self.end_headers()
            return
        if not self._is_allowed_static_path(path):
            self.send_error(404, 'Not Found')
            return
        super().do_HEAD()

    def do_POST(self):
        path = urlparse(self.path).path
        user = self._get_user()

        if path == '/api/auth':
            # 验证用户密码
            body = self._read_body()
            auth_user = body.get('user', user or 'default')
            auth_pwd = body.get('password', '')
            remember = parse_bool(body.get('remember', body.get('remember_me', False)), False)
            if verify_password(auth_user, auth_pwd):
                role = get_user_role(auth_user)
                session = create_session(auth_user, role, remember=remember)
                payload = build_session_payload(session, include_token=True)
                payload['ok'] = True
                self._json_response(payload)
            else:
                self._json_response({'error': '密码错误'}, 403)

        elif path == '/api/register':
            # 注册新用户（设置密码）
            body = self._read_body()
            reg_user = body.get('user', '')
            reg_pwd = body.get('password', '')
            if not reg_user or not reg_pwd:
                self._json_response({'error': '用户名和密码不能为空'}, 400)
                return
            if user_exists(reg_user):
                self._json_response({'error': '用户已存在，请直接登录'}, 409)
                return
            register_user(reg_user, reg_pwd, role='editor')
            # 触发数据初始化（从 default 复制）
            load_systems(reg_user)
            self._audit(
                action='user.register',
                actor={'user': reg_user, 'role': get_user_role(reg_user)},
                target_user=reg_user,
                details={'source': 'self-service'},
            )
            self._json_response({'ok': True, 'user': reg_user}, 201)

        elif path == '/api/change-password':
            # 修改密码
            body = self._read_body()
            cp_user = body.get('user', '')
            new_pwd = body.get('new_password', '')
            if not cp_user or not new_pwd:
                self._json_response({'error': '参数不完整'}, 400)
                return
            token = _extract_auth_token(self.headers)
            if token:
                session = get_valid_session(token)
                if not session:
                    self._json_response({'error': '会话已失效，请重新登录'}, 401)
                    return
                if session['user'] != cp_user and session['role'] != 'admin':
                    self._json_response({'error': '无权修改其他用户密码'}, 403)
                    return
            else:
                old_pwd = body.get('old_password', '')
                if not old_pwd:
                    self._json_response({'error': '缺少原密码'}, 400)
                    return
                if not verify_password(cp_user, old_pwd):
                    self._json_response({'error': '原密码错误'}, 403)
                    return
            users = load_users()
            if cp_user not in users:
                self._json_response({'error': '用户不存在'}, 404)
                return
            users[cp_user]['password'] = hash_password(new_pwd)
            save_users(users)
            actor = session if token else {'user': cp_user, 'role': get_user_role(cp_user)}
            self._audit(
                action='user.change_password',
                actor=actor,
                target_user=cp_user,
                details={'self': actor.get('user') == cp_user},
            )
            self._json_response({'ok': True, 'message': '密码修改成功'})

        elif path == '/api/backups':
            session = self._check_auth('default', allowed_roles={'admin'})
            if not session:
                return
            try:
                item = create_sqlite_backup(kind='manual')
            except Exception as e:
                self._json_response({'error': f'创建备份失败: {e}'}, 500)
                return
            self._audit(
                action='backup.create',
                actor=session,
                target_user='default',
                resource_name=(item or {}).get('file', ''),
                details={'mode': 'manual', 'size': (item or {}).get('size', 0)},
            )
            self._json_response({'ok': True, 'item': item}, 201)

        elif path == '/api/backups/restore':
            session = self._check_auth('default', allowed_roles={'admin'})
            if not session:
                return
            body = self._read_body()
            file_name = body.get('file') or body.get('name') or ''
            if not file_name:
                self._json_response({'error': '缺少备份文件名 file'}, 400)
                return
            try:
                result = restore_sqlite_backup(file_name)
            except ValueError as e:
                self._json_response({'error': str(e)}, 400)
                return
            except FileNotFoundError as e:
                self._json_response({'error': str(e)}, 404)
                return
            except Exception as e:
                self._json_response({'error': f'恢复失败: {e}'}, 500)
                return

            self._audit(
                action='backup.restore',
                actor=session,
                target_user='default',
                resource_name=str(file_name),
                details={
                    'restored': (result.get('restored') or {}).get('file'),
                    'safety_backup': (result.get('safety_backup') or {}).get('file'),
                },
            )
            self._json_response({'ok': True, **result})

        elif path == '/api/systems':
            auth = self._check_auth(user)
            if not auth:
                return
            body = self._read_body()
            systems = load_systems(user)
            max_id = max((s['id'] for s in systems), default=0)
            body['id'] = max_id + 1
            # 确保有 pinned 和 notes 字段
            if 'pinned' not in body:
                body['pinned'] = False
            if 'notes' not in body:
                body['notes'] = ''
            systems.append(body)
            save_systems(systems, user)
            owner = user or auth.get('user') or 'default'
            self._audit(
                action='system.add',
                actor=auth,
                target_user=owner,
                resource_id=body.get('id'),
                resource_name=body.get('name', ''),
            )
            self._json_response(body, 201)

        elif path == '/api/systems/import':
            # 批量导入系统
            auth = self._check_auth(user)
            if not auth:
                return
            body = self._read_body()
            import_systems = body.get('systems', [])
            mode = body.get('mode', 'merge')  # merge | replace
            if not import_systems:
                self._json_response({'error': '无系统数据'}, 400)
                return

            if mode == 'replace':
                # 替换模式：重新分配 ID
                for i, s in enumerate(import_systems):
                    s['id'] = i + 1
                    if 'pinned' not in s:
                        s['pinned'] = False
                    if 'notes' not in s:
                        s['notes'] = ''
                save_systems(import_systems, user)
                self._audit(
                    action='system.import',
                    actor=auth,
                    target_user=user or auth.get('user') or 'default',
                    details={'mode': 'replace', 'count': len(import_systems)},
                )
                self._json_response({'ok': True, 'imported': len(import_systems), 'mode': 'replace'})
            else:
                # 合并模式：追加到现有列表
                systems = load_systems(user)
                max_id = max((s['id'] for s in systems), default=0)
                count = 0
                for s in import_systems:
                    max_id += 1
                    s['id'] = max_id
                    if 'pinned' not in s:
                        s['pinned'] = False
                    if 'notes' not in s:
                        s['notes'] = ''
                    systems.append(s)
                    count += 1
                save_systems(systems, user)
                self._audit(
                    action='system.import',
                    actor=auth,
                    target_user=user or auth.get('user') or 'default',
                    details={'mode': 'merge', 'count': count},
                )
                self._json_response({'ok': True, 'imported': count, 'mode': 'merge'})

        elif path == '/api/systems/reorder':
            # 重新排序系统
            auth = self._check_auth(user)
            if not auth:
                return
            body = self._read_body()
            order_list = body.get('order', [])  # [id1, id2, id3...]
            if not order_list:
                self._json_response({'error': '排序列表为空'}, 400)
                return
            systems = load_systems(user)
            # 按给定顺序重排
            id_map = {s['id']: s for s in systems}
            reordered = []
            for sid in order_list:
                if sid in id_map:
                    reordered.append(id_map.pop(sid))
            # 未在列表中的系统追加到末尾
            for s in systems:
                if s['id'] in id_map:
                    reordered.append(s)
            save_systems(reordered, user)
            self._audit(
                action='system.reorder',
                actor=auth,
                target_user=user or auth.get('user') or 'default',
                details={'order_size': len(order_list), 'total': len(reordered)},
            )
            self._json_response({'ok': True})

        elif path == '/api/systems/health':
            # 健康检查
            body = self._read_body()
            url = body.get('url', '')
            if not url:
                self._json_response({'error': '缺少 URL'}, 400)
                return
            result = check_url_health(url)
            self._json_response(result)

        elif path == '/api/likes':
            # 点赞
            body = self._read_body()
            like_user = body.get('user', 'anonymous')
            likes = load_likes()
            if like_user in likes['users']:
                # 取消点赞
                likes['users'].remove(like_user)
                likes['count'] = max(0, likes['count'] - 1)
                save_likes(likes)
                self._json_response({'ok': True, 'action': 'unliked', 'count': likes['count']})
            else:
                # 点赞
                likes['users'].append(like_user)
                likes['count'] = likes['count'] + 1
                save_likes(likes)
                self._json_response({'ok': True, 'action': 'liked', 'count': likes['count']})

        elif path == '/api/messages':
            # 发布留言
            body = self._read_body()
            msg_user = body.get('user', 'anonymous')
            msg_text = body.get('text', '').strip()
            if not msg_text:
                self._json_response({'error': '留言内容不能为空'}, 400)
                return
            if len(msg_text) > 500:
                self._json_response({'error': '留言不能超过500字'}, 400)
                return
            messages = load_messages()
            msg = {
                'id': int(time.time() * 1000),
                'user': msg_user,
                'text': msg_text,
                'time': time.strftime('%Y-%m-%d %H:%M:%S')
            }
            messages.insert(0, msg)  # 最新留言在前
            # 最多保留100条
            if len(messages) > 100:
                messages = messages[:100]
            save_messages(messages)
            self._json_response(msg, 201)

        else:
            self._json_response({'error': 'Not Found'}, 404)

    def do_PUT(self):
        path = urlparse(self.path).path
        user = self._get_user()

        if path == '/api/login-rules':
            auth = self._check_auth(user)
            if not auth:
                return
            body = self._read_body()
            rules = body.get('items', body.get('rules', []))
            normalized = normalize_login_rules(rules)
            save_login_rules(normalized, user)
            self._audit(
                action='login_rules.save',
                actor=auth,
                target_user=user or auth.get('user') or 'default',
                details={'count': len(normalized)},
            )
            self._json_response({
                'ok': True,
                'user': normalize_system_user(user),
                'items': normalized,
            })

        elif path.startswith('/api/systems/') and path.endswith('/pin'):
            # 置顶/取消置顶
            auth = self._check_auth(user)
            if not auth:
                return
            sid = int(path.split('/')[-2])
            systems = load_systems(user)
            for s in systems:
                if s['id'] == sid:
                    s['pinned'] = not s.get('pinned', False)
                    save_systems(systems, user)
                    self._audit(
                        action='system.pin',
                        actor=auth,
                        target_user=user or auth.get('user') or 'default',
                        resource_id=sid,
                        resource_name=s.get('name', ''),
                        details={'pinned': bool(s.get('pinned'))},
                    )
                    self._json_response({'ok': True, 'pinned': s['pinned']})
                    return
            self._json_response({'error': 'Not Found'}, 404)

        elif path.startswith('/api/systems/'):
            auth = self._check_auth(user)
            if not auth:
                return
            sid = int(path.split('/')[-1])
            body = self._read_body()
            systems = load_systems(user)
            for i, s in enumerate(systems):
                if s['id'] == sid:
                    body['id'] = sid
                    # 保留 pinned 和 notes 字段
                    if 'pinned' not in body:
                        body['pinned'] = s.get('pinned', False)
                    if 'notes' not in body:
                        body['notes'] = s.get('notes', '')
                    systems[i] = body
                    save_systems(systems, user)
                    self._audit(
                        action='system.edit',
                        actor=auth,
                        target_user=user or auth.get('user') or 'default',
                        resource_id=sid,
                        resource_name=body.get('name', ''),
                    )
                    self._json_response(body)
                    return
            self._json_response({'error': 'Not Found'}, 404)
        else:
            self._json_response({'error': 'Not Found'}, 404)

    def do_DELETE(self):
        path = urlparse(self.path).path
        user = self._get_user()

        if path.startswith('/api/users/'):
            # 删除用户（支持 admin token；兼容管理员密码）
            target_user = unquote(path.split('/')[-1])
            actor = None
            token = _extract_auth_token(self.headers)
            if token:
                session = get_valid_session(token)
                if not session:
                    self._json_response({'error': '会话已失效，请重新登录'}, 401)
                    return
                if session.get('role') != 'admin':
                    self._json_response({'error': '需要管理员权限'}, 403)
                    return
                actor = session
            else:
                admin_pwd = self.headers.get('X-Admin-Password', '')
                if not verify_hashed_password(ADMIN_PASSWORD_HASH, admin_pwd):
                    self._json_response({'error': '管理员密码错误'}, 403)
                    return
                actor = {'user': 'default', 'role': 'admin'}
            if target_user == 'default':
                self._json_response({'error': '不能删除 default 用户'}, 400)
                return
            if not user_exists(target_user):
                self._json_response({'error': '用户不存在'}, 404)
                return
            delete_user(target_user)
            self._audit(
                action='user.delete',
                actor=actor,
                target_user=target_user,
            )
            self._json_response({'ok': True, 'deleted': target_user})

        elif path.startswith('/api/systems/'):
            auth = self._check_auth(user)
            if not auth:
                return
            sid = int(path.split('/')[-1])
            systems = load_systems(user)
            deleted = None
            for item in systems:
                if item.get('id') == sid:
                    deleted = item
                    break
            systems = [s for s in systems if s['id'] != sid]
            save_systems(systems, user)
            self._audit(
                action='system.delete',
                actor=auth,
                target_user=user or auth.get('user') or 'default',
                resource_id=sid,
                resource_name=(deleted or {}).get('name', ''),
            )
            self._json_response({'ok': True})
        else:
            self._json_response({'error': 'Not Found'}, 404)

    def do_OPTIONS(self):
        self.send_response(200)
        self._cors_headers()
        self.end_headers()

    def _read_body(self):
        length = int(self.headers.get('Content-Length', 0))
        raw = self.rfile.read(length)
        return json.loads(raw.decode('utf-8'))

    def _json_response(self, data, code=200, extra_headers=None):
        body = json.dumps(data, ensure_ascii=False).encode('utf-8')
        self.send_response(code)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self._cors_headers()
        if extra_headers:
            for key, value in extra_headers.items():
                self.send_header(str(key), str(value))
        self.send_header('Content-Length', len(body))
        self.end_headers()
        self.wfile.write(body)

    def _cors_headers(self):
        origin = (self.headers.get('Origin', '') or '').strip()
        allow_origin = ''
        if origin:
            if origin.startswith('chrome-extension://'):
                allow_origin = origin
            elif origin in CORS_ALLOWED_ORIGINS:
                allow_origin = origin
            elif any(origin.startswith(prefix) for prefix in LOCAL_DEV_ORIGIN_PREFIXES):
                allow_origin = origin
        if allow_origin:
            self.send_header('Access-Control-Allow-Origin', allow_origin)
            self.send_header('Vary', 'Origin')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Auth-Token, X-Auth-Password, X-Admin-Password')
        if allow_origin:
            self.send_header('Access-Control-Allow-Private-Network', 'true')

    def log_message(self, format, *args):
        if '/api/' in str(args[0]):
            super().log_message(format, *args)


if __name__ == '__main__':
    os.chdir(DIR)
    # 确保 data 目录存在
    os.makedirs(DATA_DIR, exist_ok=True)
    ensure_db_ready()

    # 安全配置初始化（环境变量优先，本地持久化兜底）
    ENCRYPT_KEY = init_encrypt_key()
    ADMIN_PASSWORD_HASH = init_admin_password_hash()

    # 确保 default 用户有密码
    if not user_exists('default'):
        default_pwd = os.environ.get('DEFAULT_USER_PASSWORD', '').strip()
        if default_pwd:
            register_user('default', default_pwd)
            print('🔑 已初始化 default 用户密码（来源: 环境变量 DEFAULT_USER_PASSWORD）')
        else:
            default_pwd = generate_random_secret(16)
            register_user('default', default_pwd)
            print('⚠️ 未设置 DEFAULT_USER_PASSWORD，已自动生成 default 初始密码（仅本次显示一次）：')
            print(f'   default / {default_pwd}')
            print('   建议首次登录后立即修改密码。')

    try:
        startup_backup = maybe_create_startup_backup()
        if startup_backup:
            print(f'🧷 启动备份完成: {startup_backup.get("file")} ({startup_backup.get("size")} bytes)')
    except Exception as e:
        print(f'⚠️ 启动备份失败: {e}')

    start_backup_scheduler()
    print(f'🕒 自动备份间隔: {get_backup_interval_seconds()}s')
    print(f'🧹 备份保留数量: {get_backup_retention_count()}')

    try:
        httpd = DualStackHTTPServer(('::', PORT), SSOHandler)
        print(f'🚀 秒登 MiaoDeng Server running (IPv4 + IPv6)')
    except OSError:
        httpd = IPv4ThreadingHTTPServer(('0.0.0.0', PORT), SSOHandler)
        print(f'🚀 秒登 MiaoDeng Server running (IPv4 only)')
    print(f'🌐 访问地址: http://localhost:{PORT}')
    print(f'🌐 访问地址: http://127.0.0.1:{PORT}')
    print(f'📁 Serving files from: {DIR}')
    print(f'👥 用户数据目录: {DATA_DIR}')
    print(f'🗄️ SQLite 数据库: {SQLITE_DB_FILE}')
    print(f'🔐 密码哈希: SHA256 + Salt')
    print(f'🔒 凭据加密: XOR + Base64')
    print(f'🕒 Session TTL: {SESSION_TTL_SECONDS}s')
    print(f'🕒 Remember Session TTL: {REMEMBER_SESSION_TTL_SECONDS}s')
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print('\n🛑 Server stopped')
