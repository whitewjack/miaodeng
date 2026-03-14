// 秒登 MiaoDeng - Options Script

var serverBase = 'http://localhost:6680';
var ssoUser = '';
var autoSubmitEnabled = true;
var noSubmitDomains = '';
var popupThemeMode = 'classic';
var popupDensityMode = 'standard';
var currentPluginVersion = (chrome.runtime.getManifest().version || '0.0.0');

function normalizeServerUrl(url) {
  var value = String(url || '').trim();
  if (!value) value = 'http://localhost:6680';
  return value.replace(/\/+$/, '');
}

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

function setStatus(id, text, type) {
  var el = document.getElementById(id);
  if (!el) return;
  el.className = 'status' + (type ? (' ' + type) : '');
  el.textContent = text || '';
}

function getGuideUrl() {
  return serverBase + '/sso-portal.html' + (ssoUser ? ('?user=' + encodeURIComponent(ssoUser)) : '');
}

function applyAppearanceMode() {
  document.body.classList.toggle('options-theme-light', popupThemeMode === 'light');
  document.body.classList.toggle('options-theme-classic', popupThemeMode === 'classic');
  document.body.classList.toggle('options-density-compact', popupDensityMode === 'compact');
}

function fillForm() {
  document.getElementById('serverUrl').value = serverBase;
  document.getElementById('ssoUser').value = ssoUser;
  document.getElementById('autoSubmitEnabled').checked = autoSubmitEnabled;
  document.getElementById('noSubmitDomains').value = noSubmitDomains;
  document.getElementById('themeMode').value = popupThemeMode;
  document.getElementById('densityMode').value = popupDensityMode;
  document.getElementById('pluginVersionText').textContent = 'v' + currentPluginVersion;
  applyAppearanceMode();
}

function collectForm() {
  serverBase = normalizeServerUrl(document.getElementById('serverUrl').value);
  ssoUser = (document.getElementById('ssoUser').value || '').trim();
  autoSubmitEnabled = !!document.getElementById('autoSubmitEnabled').checked;
  noSubmitDomains = (document.getElementById('noSubmitDomains').value || '').trim();
  popupThemeMode = document.getElementById('themeMode').value || 'classic';
  popupDensityMode = document.getElementById('densityMode').value || 'standard';
  document.getElementById('serverUrl').value = serverBase;
  applyAppearanceMode();
}

function loadSettings() {
  chrome.storage.local.get(
    ['sso_server', 'sso_user', 'sso_auto_submit', 'sso_no_submit_domains', 'sso_popup_theme', 'sso_popup_density'],
    function(result) {
      serverBase = normalizeServerUrl(result.sso_server || 'http://localhost:6680');
      ssoUser = result.sso_user || '';
      autoSubmitEnabled = result.sso_auto_submit !== false;
      noSubmitDomains = result.sso_no_submit_domains || '';
      popupThemeMode = result.sso_popup_theme || 'classic';
      popupDensityMode = result.sso_popup_density || 'standard';
      fillForm();
      checkExtensionUpdate(false);
    }
  );
}

function saveSettings(silent) {
  collectForm();
  chrome.storage.local.set({
    sso_server: serverBase,
    sso_user: ssoUser,
    sso_auto_submit: autoSubmitEnabled,
    sso_no_submit_domains: noSubmitDomains,
    sso_popup_theme: popupThemeMode,
    sso_popup_density: popupDensityMode
  }, function() {
    if (!silent) {
      setStatus('saveStatus', '✅ 设置已保存', 'ok');
    }
  });
}

function clearUser() {
  document.getElementById('ssoUser').value = '';
  saveSettings(false);
}

function openPortal() {
  collectForm();
  chrome.tabs.create({ url: getGuideUrl() });
}

function openUpdateGuide() {
  chrome.tabs.create({ url: getGuideUrl() });
}

function testConnection() {
  collectForm();
  var url = serverBase + '/api/user/check' + (ssoUser ? ('?user=' + encodeURIComponent(ssoUser)) : '');
  setStatus('connStatus', '连接测试中...', '');
  return fetch(url, { cache: 'no-store' })
    .then(function(res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    })
    .then(function(data) {
      var userLabel = (data && data.user) ? ('用户：' + data.user) : '服务可用';
      var extra = '';
      if (data && typeof data.registered !== 'undefined') {
        extra = data.registered ? '（已注册）' : '（未注册）';
      }
      setStatus('connStatus', '✅ 连接成功 · ' + userLabel + extra, 'ok');
    })
    .catch(function(err) {
      setStatus('connStatus', '❌ 连接失败：' + (err && err.message ? err.message : '网络异常'), 'error');
    });
}

function checkExtensionUpdate(manual) {
  collectForm();
  setStatus('updateStatus', manual ? '检查更新中...' : '版本检测中...', '');
  var url = serverBase + '/chrome-extension/manifest.json?_=' + Date.now();
  return fetch(url, { cache: 'no-store' })
    .then(function(res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    })
    .then(function(remote) {
      var latest = (remote && remote.version) ? String(remote.version).trim() : '';
      if (!latest) {
        setStatus('updateStatus', '未检测到远端版本信息', 'error');
        return;
      }
      if (compareVersion(latest, currentPluginVersion) > 0) {
        setStatus('updateStatus', '发现新版本 v' + latest + '（当前 v' + currentPluginVersion + '）', 'warn');
      } else {
        setStatus('updateStatus', '已是最新版本 v' + currentPluginVersion, 'ok');
      }
    })
    .catch(function(err) {
      setStatus('updateStatus', '检查失败：' + (err && err.message ? err.message : '网络异常'), 'error');
    });
}

document.getElementById('saveAllBtn').addEventListener('click', function() { saveSettings(false); });
document.getElementById('testConnBtn').addEventListener('click', testConnection);
document.getElementById('openPortalBtn').addEventListener('click', openPortal);
document.getElementById('clearUserBtn').addEventListener('click', clearUser);
document.getElementById('checkUpdateBtn').addEventListener('click', function() { checkExtensionUpdate(true); });
document.getElementById('openUpdateGuideBtn').addEventListener('click', openUpdateGuide);
document.getElementById('themeMode').addEventListener('change', function() { saveSettings(true); });
document.getElementById('densityMode').addEventListener('change', function() { saveSettings(true); });
document.getElementById('autoSubmitEnabled').addEventListener('change', function() { saveSettings(true); });
document.getElementById('serverUrl').addEventListener('blur', function() { saveSettings(true); });
document.getElementById('ssoUser').addEventListener('blur', function() { saveSettings(true); });
document.getElementById('noSubmitDomains').addEventListener('blur', function() { saveSettings(true); });

loadSettings();
