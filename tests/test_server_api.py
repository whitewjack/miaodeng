import importlib.util
import json
import os
import tempfile
import threading
import time
import unittest
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path


def load_server_module():
    root = Path(__file__).resolve().parents[1]
    spec = importlib.util.spec_from_file_location(
        "sso_server_module",
        str(root / "server.py"),
    )
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class ServerApiTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory()
        root = Path(cls.tmp.name)
        (root / "sso-portal.html").write_text("<!doctype html><html><body>ok</body></html>", encoding="utf-8")
        (root / "CHANGELOG.md").write_text(
            "# 秒登 MiaoDeng 更新日志\n\n## 2026-03-15 · v3.64\n",
            encoding="utf-8",
        )
        data_dir = root / "data"
        data_dir.mkdir(parents=True, exist_ok=True)

        cls.srv = load_server_module()
        # 重定向运行路径到临时目录，避免污染真实数据
        cls.srv.DIR = str(root)
        cls.srv.DATA_DIR = str(data_dir)
        cls.srv.USERS_FILE = str(data_dir / "users.json")
        cls.srv.LIKES_FILE = str(data_dir / "likes.json")
        cls.srv.MESSAGES_FILE = str(data_dir / "messages.json")
        cls.srv.SQLITE_DB_FILE = str(data_dir / "sso.db")
        cls.srv.ENCRYPT_KEY_FILE = str(data_dir / ".encrypt-key")
        cls.srv.ADMIN_PASSWORD_FILE = str(data_dir / ".admin-password")
        cls.srv.DB_INITIALIZED = False

        cls.srv.ENCRYPT_KEY = "test-encrypt-key"
        cls.srv.ADMIN_PASSWORD_HASH = cls.srv.hash_password("admin-test-password")
        cls.srv.ensure_db_ready()
        if not cls.srv.user_exists("default"):
            cls.srv.register_user("default", "default-pass")

        cls.httpd = cls.srv.HTTPServer(("127.0.0.1", 0), cls.srv.SSOHandler)
        cls.port = cls.httpd.server_address[1]
        cls.base = f"http://127.0.0.1:{cls.port}"
        cls.thread = threading.Thread(target=cls.httpd.serve_forever, daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.httpd.shutdown()
        cls.httpd.server_close()
        cls.tmp.cleanup()

    def api(self, path, method="GET", data=None, headers=None):
        req_headers = dict(headers or {})
        body = None
        if data is not None:
            body = json.dumps(data).encode("utf-8")
            req_headers.setdefault("Content-Type", "application/json")
        req = urllib.request.Request(self.base + path, data=body, method=method, headers=req_headers)
        try:
            with urllib.request.urlopen(req, timeout=4) as resp:
                txt = resp.read().decode("utf-8")
                return resp.status, json.loads(txt) if txt else {}
        except urllib.error.HTTPError as e:
            txt = e.read().decode("utf-8")
            try:
                payload = json.loads(txt) if txt else {}
            except Exception:
                payload = {"raw": txt}
            return e.code, payload

    def test_register_auth_and_session(self):
        user = f"u_{int(time.time())}"
        pwd = "Pwd!123456"
        status, payload = self.api("/api/register", "POST", {"user": user, "password": pwd})
        self.assertEqual(status, 201)
        self.assertTrue(payload.get("ok"))

        status, payload = self.api("/api/auth", "POST", {"user": user, "password": pwd, "remember": True})
        self.assertEqual(status, 200)
        self.assertTrue(payload.get("ok"))
        self.assertTrue(payload.get("token"))
        self.assertEqual(payload.get("remember"), True)
        token = payload["token"]

        status, session = self.api("/api/session", headers={"X-Auth-Token": token})
        self.assertEqual(status, 200)
        self.assertTrue(session.get("ok"))
        self.assertEqual(session.get("user"), user)
        self.assertEqual(session.get("remember"), True)

    def test_systems_write_and_read(self):
        user = f"u_{int(time.time())}_sys"
        pwd = "SysPwd!123"
        self.api("/api/register", "POST", {"user": user, "password": pwd})
        status, auth = self.api("/api/auth", "POST", {"user": user, "password": pwd})
        self.assertEqual(status, 200)
        token = auth["token"]
        headers = {"X-Auth-Token": token, "Authorization": f"Bearer {token}"}

        status, created = self.api(
            f"/api/systems?user={user}",
            "POST",
            {
                "name": "API-TEST",
                "url": "https://example.com/login",
                "env": "test",
                "type": "basic",
                "username": "tester",
                "password": "secret",
            },
            headers=headers,
        )
        self.assertEqual(status, 201)
        self.assertTrue(created.get("id"))

        status, systems = self.api(f"/api/systems?user={user}")
        self.assertEqual(status, 200)
        self.assertTrue(any(s.get("name") == "API-TEST" for s in systems))

    def test_systems_read_without_auth_is_redacted(self):
        user = f"u_{int(time.time())}_redact"
        pwd = "RedactPwd!123"
        self.api("/api/register", "POST", {"user": user, "password": pwd})
        status, auth = self.api("/api/auth", "POST", {"user": user, "password": pwd})
        self.assertEqual(status, 200)
        token = auth["token"]
        headers = {"X-Auth-Token": token, "Authorization": f"Bearer {token}"}

        status, _ = self.api(
            f"/api/systems?user={user}",
            "POST",
            {
                "name": "RED-AUTH",
                "url": "https://example.com/secure",
                "env": "test",
                "type": "iam",
                "username": "alice",
                "password": "super-secret",
                "otp": "123456",
                "otp_secret": "JBSWY3DPEHPK3PXP",
                "token": "secret-token",
            },
            headers=headers,
        )
        self.assertEqual(status, 201)

        status, public_list = self.api(f"/api/systems?user={user}")
        self.assertEqual(status, 200)
        target = next((item for item in public_list if item.get("name") == "RED-AUTH"), {})
        self.assertEqual(target.get("password", ""), "")
        self.assertEqual(target.get("otp", ""), "")
        self.assertEqual(target.get("otp_secret", ""), "")
        self.assertEqual(target.get("token", ""), "")

        status, private_list = self.api(f"/api/systems?user={user}", headers=headers)
        self.assertEqual(status, 200)
        private_target = next((item for item in private_list if item.get("name") == "RED-AUTH"), {})
        self.assertEqual(private_target.get("password"), "super-secret")
        self.assertEqual(private_target.get("otp_secret"), "JBSWY3DPEHPK3PXP")

    def test_export_credentials_requires_auth(self):
        user = f"u_{int(time.time())}_exp"
        pwd = "ExportPwd!123"
        self.api("/api/register", "POST", {"user": user, "password": pwd})
        status, auth = self.api("/api/auth", "POST", {"user": user, "password": pwd})
        self.assertEqual(status, 200)
        token = auth["token"]
        headers = {"X-Auth-Token": token, "Authorization": f"Bearer {token}"}

        status, _ = self.api(
            f"/api/systems?user={user}",
            "POST",
            {
                "name": "EXP-AUTH",
                "url": "https://example.com/export",
                "env": "test",
                "type": "basic",
                "username": "exporter",
                "password": "export-secret",
            },
            headers=headers,
        )
        self.assertEqual(status, 201)

        status, denied = self.api(f"/api/systems/export?user={user}&include_cred=1")
        self.assertEqual(status, 401)
        self.assertIn("登录", denied.get("error", ""))

        status, allowed = self.api(f"/api/systems/export?user={user}&include_cred=1", headers=headers)
        self.assertEqual(status, 200)
        systems = allowed.get("systems", [])
        target = next((item for item in systems if item.get("name") == "EXP-AUTH"), {})
        self.assertEqual(target.get("password"), "export-secret")

    def test_data_files_not_publicly_served(self):
        status, _ = self.api("/data/sso.db")
        self.assertEqual(status, 404)
        status, _ = self.api("/data/.admin-password")
        self.assertEqual(status, 404)
        status, _ = self.api("/data/.encrypt-key")
        self.assertEqual(status, 404)

    def test_change_password_with_token(self):
        user = f"u_{int(time.time())}_pwd"
        old_pwd = "OldPwd!123"
        new_pwd = "NewPwd!456"
        self.api("/api/register", "POST", {"user": user, "password": old_pwd})
        status, auth = self.api("/api/auth", "POST", {"user": user, "password": old_pwd})
        self.assertEqual(status, 200)
        token = auth["token"]
        headers = {"X-Auth-Token": token, "Authorization": f"Bearer {token}"}

        status, payload = self.api(
            "/api/change-password",
            "POST",
            {"user": user, "new_password": new_pwd},
            headers=headers,
        )
        self.assertEqual(status, 200)
        self.assertTrue(payload.get("ok"))

        status, _ = self.api("/api/auth", "POST", {"user": user, "password": old_pwd})
        self.assertEqual(status, 403)
        status, payload = self.api("/api/auth", "POST", {"user": user, "password": new_pwd})
        self.assertEqual(status, 200)
        self.assertTrue(payload.get("ok"))

    def test_health_non_2xx_is_reachable(self):
        class ForbiddenHandler(BaseHTTPRequestHandler):
            def do_HEAD(self):
                self.send_response(403)
                self.end_headers()

            def do_GET(self):
                self.send_response(403)
                self.end_headers()

            def log_message(self, fmt, *args):
                return

        checker = HTTPServer(("127.0.0.1", 0), ForbiddenHandler)
        checker_port = checker.server_address[1]
        checker_thread = threading.Thread(target=checker.serve_forever, daemon=True)
        checker_thread.start()
        try:
            status, payload = self.api(
                "/api/systems/health",
                "POST",
                {"url": f"http://127.0.0.1:{checker_port}/health"},
            )
            self.assertEqual(status, 200)
            self.assertTrue(payload.get("online"))
            self.assertEqual(payload.get("status"), 403)
            self.assertEqual(payload.get("state"), "reachable")
            self.assertFalse(payload.get("healthy"))
            self.assertIn("HTTP 403", payload.get("reason", ""))
        finally:
            checker.shutdown()
            checker.server_close()

    def test_audit_logs_admin_only_and_basic_query(self):
        user = f"u_{int(time.time())}_audit"
        pwd = "AuditPwd!123"

        status, _ = self.api("/api/register", "POST", {"user": user, "password": pwd})
        self.assertEqual(status, 201)

        status, auth_user = self.api("/api/auth", "POST", {"user": user, "password": pwd})
        self.assertEqual(status, 200)
        user_token = auth_user["token"]
        user_headers = {"X-Auth-Token": user_token, "Authorization": f"Bearer {user_token}"}

        status, _ = self.api(
            f"/api/systems?user={user}",
            "POST",
            {
                "name": "AUDIT-SYS",
                "url": "https://example.com/audit",
                "env": "test",
                "type": "basic",
                "username": "auditor",
                "password": "secret",
            },
            headers=user_headers,
        )
        self.assertEqual(status, 201)

        status, denied = self.api("/api/audit-logs?page=1&page_size=10", headers=user_headers)
        self.assertEqual(status, 403)
        self.assertIn("权限", denied.get("error", ""))

        status, auth_admin = self.api("/api/auth", "POST", {"user": "default", "password": "default-pass"})
        self.assertEqual(status, 200)
        admin_token = auth_admin["token"]
        admin_headers = {"X-Auth-Token": admin_token, "Authorization": f"Bearer {admin_token}"}

        status, logs = self.api("/api/audit-logs?page=1&page_size=50", headers=admin_headers)
        self.assertEqual(status, 200)
        self.assertTrue(logs.get("ok"))
        self.assertGreaterEqual(logs.get("total", 0), 2)
        actions = {item.get("action") for item in logs.get("items", [])}
        self.assertIn("user.register", actions)
        self.assertIn("system.add", actions)
        first = logs.get("items", [])[0]
        self.assertIn("timestamp", first)
        self.assertIn("actor_user", first)
        self.assertIn("client_ip", first)

    def test_backups_admin_flow_and_restore(self):
        user = f"u_{int(time.time())}_bak"
        pwd = "BakPwd!123"
        status, _ = self.api("/api/register", "POST", {"user": user, "password": pwd})
        self.assertEqual(status, 201)

        status, auth_user = self.api("/api/auth", "POST", {"user": user, "password": pwd})
        self.assertEqual(status, 200)
        user_token = auth_user["token"]
        user_headers = {"X-Auth-Token": user_token, "Authorization": f"Bearer {user_token}"}

        status, created = self.api(
            f"/api/systems?user={user}",
            "POST",
            {
                "name": "BACKUP-BEFORE",
                "url": "https://example.com/backup",
                "env": "test",
                "type": "basic",
                "username": "backup-user",
                "password": "secret",
            },
            headers=user_headers,
        )
        self.assertEqual(status, 201)
        sid = created["id"]

        status, denied = self.api("/api/backups", headers=user_headers)
        self.assertEqual(status, 403)
        self.assertIn("权限", denied.get("error", ""))

        status, auth_admin = self.api("/api/auth", "POST", {"user": "default", "password": "default-pass"})
        self.assertEqual(status, 200)
        admin_token = auth_admin["token"]
        admin_headers = {"X-Auth-Token": admin_token, "Authorization": f"Bearer {admin_token}"}

        status, created_backup = self.api("/api/backups", "POST", headers=admin_headers)
        self.assertEqual(status, 201)
        self.assertTrue(created_backup.get("ok"))
        backup_file = (created_backup.get("item") or {}).get("file")
        self.assertTrue(backup_file)

        status, backup_list = self.api("/api/backups", headers=admin_headers)
        self.assertEqual(status, 200)
        self.assertTrue(backup_list.get("ok"))
        self.assertTrue(any(item.get("file") == backup_file for item in backup_list.get("items", [])))

        status, denied_restore = self.api(
            "/api/backups/restore",
            "POST",
            {"file": backup_file},
            headers=user_headers,
        )
        self.assertEqual(status, 403)

        status, _ = self.api(
            f"/api/systems/{sid}?user={user}",
            "PUT",
            {
                "name": "BACKUP-AFTER",
                "url": "https://example.com/backup",
                "env": "test",
                "type": "basic",
                "username": "backup-user",
                "password": "secret",
                "pinned": False,
                "notes": "",
            },
            headers=user_headers,
        )
        self.assertEqual(status, 200)

        status, restored = self.api(
            "/api/backups/restore",
            "POST",
            {"file": backup_file},
            headers=admin_headers,
        )
        self.assertEqual(status, 200)
        self.assertTrue(restored.get("ok"))
        self.assertEqual((restored.get("restored") or {}).get("file"), backup_file)

        status, invalid_restore = self.api(
            "/api/backups/restore",
            "POST",
            {"file": "../hack.db"},
            headers=admin_headers,
        )
        self.assertEqual(status, 400)

        status, systems = self.api(f"/api/systems?user={user}")
        self.assertEqual(status, 200)
        names = {item.get("name") for item in systems}
        self.assertIn("BACKUP-BEFORE", names)
        self.assertNotIn("BACKUP-AFTER", names)

    def test_version_center_endpoint(self):
        status, payload = self.api("/api/version-center")
        self.assertEqual(status, 200)
        self.assertTrue(payload.get("ok"))
        self.assertIn("server", payload)
        self.assertIn("portal", payload)
        self.assertIn("plugin", payload)
        self.assertIn("uptime_seconds", payload.get("server", {}))
        self.assertIn("version", payload.get("portal", {}))
        self.assertIn("latest_version", payload.get("plugin", {}))
        self.assertIn("edge_version", payload.get("plugin", {}))
        self.assertEqual(payload.get("plugin", {}).get("edge_archive_url"), "/auto-login-extension-edge.zip")

    def test_open_source_stats_prefers_local_release_when_github_api_fails(self):
        self.srv.OPEN_SOURCE_STATS_CACHE.clear()
        original_fetch_json = self.srv._fetch_remote_json
        original_fetch_text = self.srv._fetch_remote_text

        def fake_fetch_json(url, timeout=6):
            raise urllib.error.HTTPError(url, 403, "rate limit exceeded", hdrs=None, fp=None)

        def fake_fetch_text(url, timeout=8):
            if "github/stars" in url:
                return "<svg><text>stars</text><text>1</text></svg>"
            if "github/forks" in url:
                return "<svg><text>forks</text><text>0</text></svg>"
            if "github/issues" in url:
                return "<svg><title>issues: 0</title></svg>"
            if "github/v/release" in url:
                return "<svg><title>release: v3.55</title></svg>"
            raise AssertionError(f"unexpected url: {url}")

        self.srv._fetch_remote_json = fake_fetch_json
        self.srv._fetch_remote_text = fake_fetch_text
        try:
            payload = self.srv.get_open_source_stats_payload()
        finally:
            self.srv._fetch_remote_json = original_fetch_json
            self.srv._fetch_remote_text = original_fetch_text
            self.srv.OPEN_SOURCE_STATS_CACHE.clear()

        self.assertTrue(payload.get("ok"))
        self.assertEqual(payload.get("release", {}).get("tag"), "v3.64")
        self.assertTrue(payload.get("release", {}).get("url", "").endswith("/tag/v3.64"))

    def test_open_source_stats_uses_local_release_when_latest_release_api_unavailable(self):
        self.srv.OPEN_SOURCE_STATS_CACHE.clear()
        original_fetch_json = self.srv._fetch_remote_json

        def fake_fetch_json(url, timeout=6):
            if url.endswith("/repos/whitewjack/miaodeng"):
                return {
                    "full_name": "whitewjack/miaodeng",
                    "html_url": "https://github.com/whitewjack/miaodeng",
                    "stargazers_count": 1,
                    "forks_count": 0,
                    "open_issues_count": 0,
                }
            raise urllib.error.HTTPError(url, 403, "rate limit exceeded", hdrs=None, fp=None)

        self.srv._fetch_remote_json = fake_fetch_json
        try:
            payload = self.srv.get_open_source_stats_payload()
        finally:
            self.srv._fetch_remote_json = original_fetch_json
            self.srv.OPEN_SOURCE_STATS_CACHE.clear()

        self.assertTrue(payload.get("ok"))
        self.assertEqual(payload.get("release", {}).get("tag"), "v3.64")
        self.assertTrue(payload.get("release", {}).get("url", "").endswith("/tag/v3.64"))

    def test_login_rules_center_requires_auth_and_persists(self):
        user = f"u_{int(time.time())}_rules"
        pwd = "RulesPwd!123"
        status, _ = self.api("/api/register", "POST", {"user": user, "password": pwd})
        self.assertEqual(status, 201)

        status, denied = self.api(f"/api/login-rules?user={user}")
        self.assertEqual(status, 401)
        self.assertIn("登录", denied.get("error", ""))

        status, auth = self.api("/api/auth", "POST", {"user": user, "password": pwd})
        self.assertEqual(status, 200)
        token = auth["token"]
        headers = {"X-Auth-Token": token, "Authorization": f"Bearer {token}"}

        payload = {
            "items": [
                {
                    "id": "rule-basic-demo",
                    "name": "通用 React 登录页",
                    "priority": 120,
                    "domains": ["demo.example.com"],
                    "path_keywords": ["login", "/signin"],
                    "flow_type": "basic",
                    "username_selector": "input[name='username']\ninput[type='email']",
                    "password_selector": "input[type='password']",
                    "submit_selector": "button[type='submit']",
                    "submit_text": "登录,Login",
                    "submit_delay_ms": 900,
                    "notes": "用于开源模板测试",
                }
            ]
        }
        status, saved = self.api(f"/api/login-rules?user={user}", "PUT", payload, headers=headers)
        self.assertEqual(status, 200)
        self.assertTrue(saved.get("ok"))
        self.assertEqual(len(saved.get("items", [])), 1)
        self.assertEqual(saved["items"][0]["flow_type"], "basic")
        self.assertEqual(saved["items"][0]["domains"], ["demo.example.com"])
        self.assertEqual(saved["items"][0]["submit_delay_ms"], 900)

        status, loaded = self.api(f"/api/login-rules?user={user}", headers=headers)
        self.assertEqual(status, 200)
        self.assertTrue(loaded.get("ok"))
        self.assertEqual(loaded.get("items", [])[0].get("submit_selector"), "button[type='submit']")
        self.assertEqual(loaded.get("items", [])[0].get("submit_delay_ms"), 900)


if __name__ == "__main__":
    unittest.main()
