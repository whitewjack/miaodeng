// 秒登 MiaoDeng - Popup Script

var allSystems = [];
var serverBase = 'http://localhost:6680';
var ssoUser = '';
var autoSubmitEnabled = true;
var noSubmitDomains = '';
var popupThemeMode = 'classic';
var popupDensityMode = 'standard';
var currentPluginVersion = (chrome.runtime.getManifest().version || '0.0.0');
var authToken = '';
var LAST_LOGIN_FLOW_KEY = 'sso_last_login_flow';
var PORTAL_WORKSPACE_SYNC_KEY_PREFIX = 'sso_portal_workspace_v1::';
var LAST_LOGIN_RULE_SAMPLE_KEY = 'sso_last_login_rule_sample_v1';
var LAUNCH_HINT_URL_PARAM_ID = '_md_sid';
var LAUNCH_HINT_URL_PARAM_TS = '_md_ts';
var workspaceSync = { favorites: [], recents: [] };

function normalizeServerUrl(url) {
  return String(url || '').trim().replace(/\/+$/, '');
}

function getAuthTokenStorageKey(server, user) {
  var normalizedServer = normalizeServerUrl(server || 'http://localhost:6680');
  var normalizedUser = (user || '').trim() || 'default';
  return 'sso_token::' + normalizedServer + '::' + normalizedUser;
}

function getWorkspaceStorageKey(server, user) {
  var normalizedServer = normalizeServerUrl(server || 'http://localhost:6680');
  var normalizedUser = (user || '').trim() || 'default';
  return PORTAL_WORKSPACE_SYNC_KEY_PREFIX + normalizedServer + '::' + normalizedUser;
}

function loadAuthToken(done) {
  var key = getAuthTokenStorageKey(serverBase, ssoUser);
  chrome.storage.local.get([key], function(result) {
    authToken = result[key] || '';
    if (typeof done === 'function') done(authToken);
  });
}

function saveAuthToken(token, done) {
  authToken = token || '';
  var key = getAuthTokenStorageKey(serverBase, ssoUser);
  var payload = {};
  payload[key] = authToken;
  chrome.storage.local.set(payload, function() {
    if (typeof done === 'function') done();
  });
}

function loadWorkspaceSync(done) {
  var key = getWorkspaceStorageKey(serverBase, ssoUser);
  chrome.storage.local.get([key], function(result) {
    var payload = result && result[key] ? result[key] : {};
    workspaceSync = {
      favorites: Array.isArray(payload.favorites) ? payload.favorites : [],
      recents: Array.isArray(payload.recents) ? payload.recents : []
    };
    if (typeof done === 'function') done(workspaceSync);
  });
}

function buildAuthHeaders() {
  var headers = {};
  if (authToken) {
    headers['X-Auth-Token'] = authToken;
    headers['Authorization'] = 'Bearer ' + authToken;
  }
  return headers;
}

function formatLatestLoginFlowText(info) {
  if (!info || !info.flow) return '最近登录链路：暂无记录';
  var flowText = '';
  if (info.flow === 'standard_iam') {
    flowText = '标准（IAM）';
  } else if (info.flow === 'standard_basic') {
    flowText = '标准（Basic）';
  } else if (info.flow === 'vaadin') {
    flowText = 'Vaadin';
  } else if (info.flow === 'k8s_token') {
    flowText = 'K8s Token';
  } else if (String(info.flow || '').indexOf('rule:') === 0) {
    flowText = '规则中心：' + String(info.flow || '').slice(5);
  } else {
    flowText = String(info.flow);
  }
  if (info.fallbackUsed && (info.flow === 'standard_iam' || info.flow === 'standard_basic')) {
    flowText = '标准 -> 兼容（Vaadin）';
  }
  return '最近登录链路：' + flowText;
}

function renderLatestLoginFlow(info) {
  var el = document.getElementById('latestLoginFlowText');
  if (!el) return;
  el.textContent = formatLatestLoginFlowText(info);
  if (!info) {
    el.title = '';
    return;
  }
  var titleParts = [];
  if (info.systemName) titleParts.push('系统：' + info.systemName);
  if (info.site) titleParts.push('站点：' + info.site);
  if (info.timestamp) titleParts.push('时间：' + new Date(info.timestamp).toLocaleString());
  el.title = titleParts.join(' | ');
}

function appendLaunchHintToUrl(rawUrl, systemId) {
  var source = String(rawUrl || '').trim();
  var sid = String(systemId || '').trim();
  if (!source || !sid) return source;
  try {
    var u = new URL(source, serverBase || 'http://localhost:6680');
    var ts = String(Date.now());
    if (u.hash) {
      var hashRaw = u.hash.startsWith('#') ? u.hash.slice(1) : u.hash;
      var parts = hashRaw.split('?');
      var hashPath = parts[0] || '';
      var hashQuery = parts[1] || '';
      var hp = new URLSearchParams(hashQuery);
      hp.set(LAUNCH_HINT_URL_PARAM_ID, sid);
      hp.set(LAUNCH_HINT_URL_PARAM_TS, ts);
      var nextHashQuery = hp.toString();
      u.hash = hashPath + (nextHashQuery ? ('?' + nextHashQuery) : '');
    } else {
      u.searchParams.set(LAUNCH_HINT_URL_PARAM_ID, sid);
      u.searchParams.set(LAUNCH_HINT_URL_PARAM_TS, ts);
    }
    return u.toString();
  } catch (e) {
    return source;
  }
}

function loadLatestLoginFlow(done) {
  chrome.storage.local.get([LAST_LOGIN_FLOW_KEY], function(result) {
    renderLatestLoginFlow(result[LAST_LOGIN_FLOW_KEY] || null);
    if (typeof done === 'function') done();
  });
}

// ====== 初始化 ======

async function init() {
  var versionText = document.getElementById('pluginVersionText');
  if (versionText) {
    versionText.textContent = '插件版本：v' + currentPluginVersion;
  }

  // 加载服务器地址
  chrome.storage.local.get(['sso_server', 'sso_user', 'sso_auto_submit', 'sso_no_submit_domains', 'sso_popup_theme', 'sso_popup_density'], function(result) {
    serverBase = normalizeServerUrl(result.sso_server || 'http://localhost:6680');
    ssoUser = result.sso_user || '';
    autoSubmitEnabled = result.sso_auto_submit !== false;
    noSubmitDomains = result.sso_no_submit_domains || '';
    popupThemeMode = result.sso_popup_theme || 'classic';
    popupDensityMode = result.sso_popup_density || 'standard';

    document.getElementById('serverUrl').value = serverBase;
    document.getElementById('popupUserInput').value = ssoUser;
    document.getElementById('autoSubmitEnabled').checked = autoSubmitEnabled;
    document.getElementById('noSubmitDomains').value = noSubmitDomains;
    document.getElementById('themeMode').value = popupThemeMode;
    document.getElementById('densityMode').value = popupDensityMode;
    document.getElementById('portalLink').href = serverBase + '/sso-portal.html' + (ssoUser ? '?user=' + encodeURIComponent(ssoUser) : '');
    document.getElementById('openRuleCenterBtn').href = getRuleCenterUrl(false);

    applyAppearanceMode();
    updateUserUI();
    loadLatestLoginFlow();
    loadAuthToken(function() {
      loadWorkspaceSync(function() {
        loadSystems(false);
        checkExtensionUpdate(false);
      });
    });
  });
}

// ====== 服务器配置 ======

function saveServer() {
  var url = document.getElementById('serverUrl').value.trim();
  var user = (document.getElementById('popupUserInput').value || '').trim();
  if (!url) url = serverBase || 'http://localhost:6680';
  url = normalizeServerUrl(url);
  serverBase = url;
  ssoUser = user;
  document.getElementById('serverUrl').value = url;
  document.getElementById('popupUserInput').value = user;
  autoSubmitEnabled = document.getElementById('autoSubmitEnabled').checked;
  noSubmitDomains = (document.getElementById('noSubmitDomains').value || '').trim();
  popupThemeMode = document.getElementById('themeMode').value || 'classic';
  popupDensityMode = document.getElementById('densityMode').value || 'standard';
  applyAppearanceMode();
  chrome.storage.local.set({
    sso_server: url,
    sso_user: user,
    sso_auto_submit: autoSubmitEnabled,
    sso_no_submit_domains: noSubmitDomains,
    sso_popup_theme: popupThemeMode,
    sso_popup_density: popupDensityMode
  });
  updateUserUI();
  document.getElementById('portalLink').href = url + '/sso-portal.html' + (ssoUser ? '?user=' + encodeURIComponent(ssoUser) : '');
  document.getElementById('openRuleCenterBtn').href = getRuleCenterUrl(false);
  loadAuthToken(function() {
    loadWorkspaceSync(function() {
      loadSystems(false);
      checkExtensionUpdate(false);
    });
  });
}

function applyAppearanceMode() {
  document.body.classList.toggle('popup-theme-light', popupThemeMode === 'light');
  document.body.classList.toggle('popup-theme-classic', popupThemeMode === 'classic');
  document.body.classList.toggle('popup-density-compact', popupDensityMode === 'compact');
}

// ====== 插件版本检测 ======

function compareVersion(a, b) {
  var sa = String(a || '0').split('.');
  var sb = String(b || '0').split('.');
  var len = Math.max(sa.length, sb.length);
  for (var i = 0; i < len; i++) {
    var va = parseInt(sa[i] || '0', 10);
    var vb = parseInt(sb[i] || '0', 10);
    if (va > vb) return 1;
    if (va < vb) return -1;
  }
  return 0;
}

function setUpdateStatus(text, type) {
  var el = document.getElementById('updateStatus');
  if (!el) return;
  el.className = 'update-status ' + (type || '');
  el.textContent = text || '';
}

function getGuideUrl() {
  return serverBase + '/sso-portal.html' + (ssoUser ? '?user=' + encodeURIComponent(ssoUser) : '');
}

function getRuleCenterUrl(withSampleIntent) {
  return getGuideUrl() + (withSampleIntent ? '#login-rules-sample' : '#login-rules');
}

function setSamplerStatus(text, type) {
  var el = document.getElementById('samplerStatusText');
  if (!el) return;
  el.className = 'action-status' + (type ? (' ' + type) : '');
  el.textContent = text || '';
}

function openUpdateGuide() {
  chrome.tabs.create({ url: getGuideUrl() });
}

function openOptionsPage() {
  if (chrome.runtime && chrome.runtime.openOptionsPage) {
    chrome.runtime.openOptionsPage();
  }
}

function checkExtensionUpdate(manual) {
  setUpdateStatus(manual ? '检查更新中...' : '版本检测中...', '');
  var url = serverBase.replace(/\/+$/, '') + '/chrome-extension/manifest.json?_=' + Date.now();

  return fetch(url, { cache: 'no-store' })
    .then(function(res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    })
    .then(function(remote) {
      var latest = (remote && remote.version) ? String(remote.version).trim() : '';
      if (!latest) {
        setUpdateStatus('未检测到远端版本信息', 'error');
        return;
      }
      if (compareVersion(latest, currentPluginVersion) > 0) {
        setUpdateStatus('发现新版本 v' + latest + '（当前 v' + currentPluginVersion + '）', 'warn');
      } else {
        setUpdateStatus('已是最新版本 v' + currentPluginVersion, 'ok');
      }
    })
    .catch(function(err) {
      if (manual) {
        setUpdateStatus('检查失败：' + (err && err.message ? err.message : '网络异常'), 'error');
      } else {
        setUpdateStatus('无法连接更新源，稍后可手动检查', 'error');
      }
    });
}

// ====== 用户管理 ======

function updateUserUI() {
  var avatar = document.getElementById('popupAvatar');
  var name = document.getElementById('popupUserName');
  if (ssoUser) {
    avatar.textContent = ssoUser.charAt(0).toUpperCase();
    avatar.style.background = getUserGradient(ssoUser);
    name.textContent = ssoUser;
  } else {
    avatar.textContent = '👤';
    avatar.style.background = 'rgba(255,255,255,0.15)';
    name.textContent = '未设置用户';
  }
}

function changeUser() {
  var panel = document.getElementById('settingsPanel');
  var input = document.getElementById('popupUserInput');
  if (panel && !panel.classList.contains('show')) panel.classList.add('show');
  if (input) {
    input.focus();
    input.select();
  }
}

// ====== 头像颜色 ======

var GRADIENTS = [
  ['#FF6B6B','#EE5A24'],['#667eea','#764ba2'],['#11998e','#38ef7d'],
  ['#FC5C7D','#6A82FB'],['#f953c6','#b91d73'],['#4facfe','#00f2fe'],
  ['#43e97b','#38f9d7'],['#fa709a','#fee140'],['#a18cd1','#fbc2eb'],
  ['#fccb90','#d57eeb'],['#e0c3fc','#8ec5fc'],['#f093fb','#f5576c'],
];

function getUserGradient(name) {
  if (!name) return 'rgba(255,255,255,0.15)';
  var hash = 0;
  for (var i = 0; i < name.length; i++) hash = ((hash << 5) - hash) + name.charCodeAt(i);
  hash = Math.abs(hash);
  var g = GRADIENTS[hash % GRADIENTS.length];
  return 'linear-gradient(135deg, ' + g[0] + ', ' + g[1] + ')';
}

// ====== 图标主题 ======

var ICON_THEMES = {
  '☸️': ['#3d5a99','#2a4070'], '💼': ['#8b6a3e','#6b5030'], '🏢': ['#3d6e8f','#2d5570'],
  '⚙️': ['#6b4d7a','#503a60'], '🔐': ['#8b4a4a','#6b3535'], '💳': ['#3d7a5a','#2d6048'],
  '📊': ['#3d7a6a','#2d6050'], '🌐': ['#505a7a','#3d4565'],
};

function getIconGradient(icon) {
  var t = ICON_THEMES[icon] || ICON_THEMES['🌐'];
  return 'linear-gradient(135deg, ' + t[0] + ', ' + t[1] + ')';
}

function getSmartIcon(name, fallback) {
  if (fallback && fallback !== '🌐') return fallback;
  var n = (name || '').toLowerCase();
  if (n.includes('k8s') || n.includes('kubernetes')) return '☸️';
  if (n.includes('boss') || n.includes('erp')) return '💼';
  if (n.includes('saas') && n.includes('租户')) return '🏢';
  if (n.includes('saas') && n.includes('平台')) return '⚙️';
  if (n.includes('iam') || n.includes('认证') || n.includes('auth')) return '🔐';
  if (n.includes('支付') || n.includes('pay')) return '💳';
  if (n.includes('数据') || n.includes('data') || n.includes('kibana')) return '📊';
  return fallback || '🌐';
}

// ====== 设置面板 ======

function toggleSettings() {
  document.getElementById('settingsPanel').classList.toggle('show');
}

// ====== 加载系统列表 ======

function loginForCredentialAccess(pwd) {
  if (!ssoUser) {
    setServerStatus('请先设置用户', 'error');
    return Promise.reject(new Error('missing user'));
  }
  pwd = (pwd || '').trim();
  if (!pwd) {
    setServerStatus('未输入密码', 'error');
    return Promise.reject(new Error('empty password'));
  }
  var authUrl = serverBase + '/api/auth';
  return fetch(authUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ user: ssoUser, password: pwd, remember: false }),
    cache: 'no-store'
  })
    .then(function(res) {
      return res.json().then(function(data) {
        return { ok: res.ok, status: res.status, data: data || {} };
      });
    })
    .then(function(result) {
      if (!result.ok || !result.data.token) {
        throw new Error((result.data && result.data.error) ? result.data.error : '登录失败');
      }
      return new Promise(function(resolve) {
        saveAuthToken(result.data.token, function() { resolve(result.data.token); });
      });
    });
}

function renderNeedLoginPrompt() {
  var list = document.getElementById('systemList');
  list.innerHTML = ''
    + '<div class="auth-panel">'
    + '  <div class="auth-panel-title">🔐 登录后读取自动登录凭据</div>'
    + '  <div class="auth-panel-sub">当前插件已拿到系统清单，但读取账号密码仍需要你为「' + escapeHtml(ssoUser || '当前用户') + '」完成一次登录。</div>'
    + '  <div class="auth-input-row">'
    + '    <input id="popupAuthPassword" type="password" placeholder="输入登录密码">'
    + '    <button id="loginForCredBtn">立即登录</button>'
    + '  </div>'
    + '  <div class="auth-panel-status" id="popupAuthStatus">登录成功后会自动刷新系统列表。</div>'
    + '</div>';
  var btn = document.getElementById('loginForCredBtn');
  var input = document.getElementById('popupAuthPassword');
  if (btn) btn.addEventListener('click', requestCredentialLogin);
  if (input) {
    input.focus();
    input.addEventListener('keydown', function(e) {
      if (e.key === 'Enter') requestCredentialLogin();
    });
  }
}

function requestCredentialLogin() {
  var input = document.getElementById('popupAuthPassword');
  var statusEl = document.getElementById('popupAuthStatus');
  var pwd = input ? input.value : '';
  setServerStatus('登录中...', '');
  if (statusEl) statusEl.textContent = '正在登录并同步凭据...';
  return loginForCredentialAccess(pwd)
    .then(function() {
      if (statusEl) statusEl.textContent = '登录成功，正在刷新系统列表...';
      return loadSystems(true);
    })
    .catch(function(err) {
      if (statusEl) statusEl.textContent = (err && err.message) ? ('登录失败：' + err.message) : '登录失败，请重试';
      setServerStatus('登录失败', 'error');
    });
}

function loadSystems(retriedAfterLogin) {
  loadLatestLoginFlow();

  var apiUrl = serverBase + '/api/systems';
  if (ssoUser) apiUrl += '?user=' + encodeURIComponent(ssoUser);

  var list = document.getElementById('systemList');
  list.innerHTML = '<div class="empty">加载中...</div>';
  setServerStatus('连接中...', '');

  fetch(apiUrl, { headers: buildAuthHeaders(), cache: 'no-store' })
    .then(function(res) {
      var redacted = (res.headers && res.headers.get && res.headers.get('X-SSO-Credentials-Redacted') === '1');
      return res.json().then(function(data) {
        return { ok: res.ok, status: res.status, data: data, redacted: redacted };
      });
    })
    .then(function(result) {
      if (!result.ok) {
        if (result.status === 401 && !retriedAfterLogin) {
          setServerStatus('未登录', 'error');
          renderNeedLoginPrompt();
          return;
        }
        throw new Error((result.data && result.data.error) ? result.data.error : ('HTTP ' + result.status));
      }
      if (result.redacted && !retriedAfterLogin) {
        setServerStatus('未登录', 'error');
        renderNeedLoginPrompt();
        return;
      }
      if (!Array.isArray(result.data)) {
        throw new Error('invalid systems payload');
      }
      allSystems = result.data;
      setServerStatus('已连接', 'ok');
      renderQuickLaunch();
      renderList(allSystems);
    })
    .catch(function() {
      setServerStatus('连接失败或未登录', 'error');
      renderQuickLaunch();
      list.innerHTML = '<div class="error">⚠️ 无法连接服务器<br><span style="font-size:10px;color:#8c8c8c;">请检查服务器地址和是否已启动</span></div>';
    });
}

// ====== 渲染列表 ======

function getSystemStorageKey(system) {
  if (!system) return '';
  if (system.id !== undefined && system.id !== null && String(system.id).trim()) {
    return 'id:' + String(system.id).trim();
  }
  return 'url:' + String(system.url || '').trim().toLowerCase();
}

function resolveWorkspaceSystems(keys) {
  var keyMap = {};
  (allSystems || []).forEach(function(item) {
    keyMap[getSystemStorageKey(item)] = item;
  });
  var output = [];
  (keys || []).forEach(function(key) {
    if (keyMap[key] && output.indexOf(keyMap[key]) < 0) {
      output.push(keyMap[key]);
    }
  });
  return output;
}

function renderQuickLaunch() {
  var panel = document.getElementById('quickLaunchPanel');
  if (!panel) return;
  var favorites = resolveWorkspaceSystems(workspaceSync.favorites).slice(0, 4);
  var recents = resolveWorkspaceSystems(workspaceSync.recents)
    .filter(function(item) { return favorites.indexOf(item) < 0; })
    .slice(0, 4);

  if (!favorites.length && !recents.length) {
    panel.classList.remove('show');
    panel.innerHTML = '';
    return;
  }

  function renderBlock(title, items) {
    if (!items || !items.length) return '';
    return '<div class="quick-launch-block">'
      + '<div class="quick-launch-title">' + escapeHtml(title) + '</div>'
      + '<div class="quick-launch-chips">'
      + items.map(function(item) {
        return '<button class="quick-chip" data-url="' + escapeAttr(item.url || '') + '" data-system-id="' + escapeAttr(String(item.id == null ? '' : item.id)) + '" title="' + escapeAttr(item.name || '') + '">' + escapeHtml(item.name || '') + '</button>';
      }).join('')
      + '</div>'
      + '</div>';
  }

  panel.classList.add('show');
  panel.innerHTML = renderBlock('⭐ 常用系统', favorites) + renderBlock('🕘 最近访问', recents);
}

function renderList(systems) {
  var list = document.getElementById('systemList');
  var countEl = document.getElementById('systemCountText');
  if (countEl) countEl.textContent = (systems && systems.length ? systems.length : 0) + ' 个系统';
  if (!systems || systems.length === 0) {
    list.innerHTML = '<div class="empty">暂无系统</div>';
    return;
  }

  var envLabels = { test: 'TEST', uat: 'UAT', dev: 'DEV', prod: 'PROD', k8s: 'K8S', other: '其他' };
  var html = '';
  systems.forEach(function(s) {
    var icon = getSmartIcon(s.name, s.icon);
    var envClass = 'env-' + (s.env || 'other');
    var envLabel = envLabels[s.env] || '其他';
    var username = (s.username || '').trim();
    var userClass = username ? '' : ' muted';
    var userText = username ? ('👤 ' + escapeHtml(username)) : '👤 未配置账号';
    html += '<div class="system-item" data-url="' + escapeAttr(s.url) + '" data-system-id="' + escapeAttr(String(s.id == null ? '' : s.id)) + '">'
      + '<div class="sys-icon" style="background:' + getIconGradient(icon) + ';">' + icon + '</div>'
      + '<div class="sys-info">'
      + '<div class="sys-name">' + escapeHtml(s.name) + '</div>'
      + '<div class="sys-user' + userClass + '">' + userText + '</div>'
      + '<div class="sys-url">' + escapeHtml(s.url) + '</div>'
      + '</div>'
      + '<span class="sys-env ' + envClass + '">' + envLabel + '</span>'
      + '<span class="sys-arrow">→</span>'
      + '</div>';
  });
  list.innerHTML = html;
}

function setServerStatus(text, type) {
  var el = document.getElementById('serverStatusText');
  if (!el) return;
  el.textContent = text || '';
  el.classList.remove('status-ok', 'status-error');
  if (type === 'ok') el.classList.add('status-ok');
  if (type === 'error') el.classList.add('status-error');
}

// ====== 搜索 ======

function filterList() {
  var keyword = document.getElementById('popupSearch').value.trim().toLowerCase();
  if (!keyword) {
    renderList(allSystems);
    return;
  }
  var filtered = allSystems.filter(function(s) {
    return (s.name || '').toLowerCase().includes(keyword)
      || (s.username || '').toLowerCase().includes(keyword)
      || (s.url || '').toLowerCase().includes(keyword);
  });
  renderList(filtered);
}

// ====== 打开系统 ======

// 事件委托：点击系统列表项跳转
document.getElementById('systemList').addEventListener('click', function(e) {
  var item = e.target.closest('.system-item');
  if (item && item.dataset.url) {
    var targetUrl = appendLaunchHintToUrl(item.dataset.url, item.dataset.systemId || '');
    chrome.tabs.create({ url: targetUrl });
  }
});

document.getElementById('quickLaunchPanel').addEventListener('click', function(e) {
  var item = e.target.closest('.quick-chip');
  if (item && item.dataset.url) {
    var targetUrl = appendLaunchHintToUrl(item.dataset.url, item.dataset.systemId || '');
    chrome.tabs.create({ url: targetUrl });
  }
});

function sampleCurrentPageForRule() {
  setSamplerStatus('正在采样当前页面结构...', '');
  chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
    var tab = tabs && tabs[0] ? tabs[0] : null;
    if (!tab || !tab.id || !tab.url) {
      setSamplerStatus('未找到当前页面，请先打开一个真实登录页。', 'error');
      return;
    }
    if (!/^https?:/i.test(tab.url)) {
      setSamplerStatus('当前页面不支持采样，请切到真实的 http/https 登录页。', 'error');
      return;
    }
    chrome.tabs.sendMessage(tab.id, { type: 'sampleLoginPageStructure' }, function(response) {
      if (chrome.runtime && chrome.runtime.lastError) {
        setSamplerStatus('采样失败：请刷新当前登录页后再试一次。', 'error');
        return;
      }
      if (!response || !response.ok || !response.sample) {
        setSamplerStatus('采样失败：' + ((response && response.error) ? response.error : '页面暂不可识别'), 'error');
        return;
      }
      var payload = {};
      payload[LAST_LOGIN_RULE_SAMPLE_KEY] = {
        portal_server: serverBase,
        portal_user: ssoUser,
        captured_at: Date.now(),
        sample: response.sample
      };
      chrome.storage.local.set(payload, function() {
        setSamplerStatus('采样完成：已保存，可立即打开规则中心自动带入。', 'ok');
        chrome.tabs.create({ url: getRuleCenterUrl(true) });
      });
    });
  });
}

// ====== 工具 ======

function escapeHtml(str) {
  var div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}

function escapeAttr(str) {
  return (str || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ====== 启动 ======
document.getElementById('gearBtn').addEventListener('click', toggleSettings);
document.getElementById('saveServerBtn').addEventListener('click', saveServer);
document.getElementById('changeUserBtn').addEventListener('click', changeUser);
document.getElementById('clearPopupUserBtn').addEventListener('click', function() {
  document.getElementById('popupUserInput').value = '';
  saveServer();
});
document.getElementById('popupSearch').addEventListener('input', filterList);
document.getElementById('autoSubmitEnabled').addEventListener('change', saveServer);
document.getElementById('noSubmitDomains').addEventListener('blur', saveServer);
document.getElementById('themeMode').addEventListener('change', saveServer);
document.getElementById('densityMode').addEventListener('change', saveServer);
document.getElementById('checkUpdateBtn').addEventListener('click', function() { checkExtensionUpdate(true); });
document.getElementById('openUpdateGuideBtn').addEventListener('click', openUpdateGuide);
document.getElementById('openOptionsBtn').addEventListener('click', openOptionsPage);
document.getElementById('sampleCurrentPageBtn').addEventListener('click', sampleCurrentPageForRule);
init();
