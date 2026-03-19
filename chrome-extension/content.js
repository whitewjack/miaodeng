(function () {
  'use strict';

  // ============ Portal API 配置 ============
  // 服务器地址可在插件 Popup 中配置，默认 localhost:6680
  var API_SERVER = 'http://localhost:6680';
  var AUTO_SUBMIT_ENABLED = true; // 默认自动提交开启
  var NO_SUBMIT_DOMAINS = [];
  var AUTH_TOKEN = '';
  var LAST_LOGIN_FLOW_KEY = 'sso_last_login_flow';
  var SYSTEM_FLOW_PREFS_KEY = 'sso_system_flow_prefs_v1';
  var PORTAL_SYSTEM_FLOW_PREFS_CACHE_KEY = 'sso_system_flow_prefs_cache_v1';
  var PORTAL_WORKSPACE_SYNC_KEY_PREFIX = 'sso_portal_workspace_v1::';
  var LAST_LOGIN_RULE_SAMPLE_KEY = 'sso_last_login_rule_sample_v1';
  var PORTAL_LOGIN_RULE_SAMPLE_CACHE_KEY = 'sso_login_rule_sample_cache_v1';
  var LAUNCH_HINT_WINDOW_NAME_PREFIX = 'sso_launch_hint_v1:';
  var LAUNCH_HINT_MAX_AGE_MS = 3 * 60 * 1000;
  var LAUNCH_HINT_URL_PARAM_ID = '_md_sid';
  var LAUNCH_HINT_URL_PARAM_TS = '_md_ts';
  // ==========================================

  const hostname = location.hostname;
  const pathLower = (location.pathname || '').toLowerCase();

  function isExtensionContextReady() {
    try {
      return typeof chrome !== 'undefined'
        && !!chrome.runtime
        && !!chrome.runtime.id
        && !!chrome.storage
        && !!chrome.storage.local;
    } catch (e) {
      return false;
    }
  }

  function safeChromeStorageSet(payload) {
    if (!isExtensionContextReady()) return false;
    try {
      chrome.storage.local.set(payload, function() {
        try {
          if (chrome.runtime && chrome.runtime.lastError) {
            console.warn('[AutoLogin] storage.set ignored:', chrome.runtime.lastError.message);
          }
        } catch (e) {
          // 忽略 context invalidated 等运行期失效
        }
      });
      return true;
    } catch (e) {
      var msg = (e && e.message) ? e.message : String(e || '');
      if (msg && msg.indexOf('Extension context invalidated') >= 0) {
        return false;
      }
      console.warn('[AutoLogin] storage.set failed:', msg);
      return false;
    }
  }

  function saveLastLoginFlow(flow, fallbackUsed, systemName) {
    var payload = {};
    payload[LAST_LOGIN_FLOW_KEY] = {
      flow: flow || '',
      fallbackUsed: !!fallbackUsed,
      site: hostname || '',
      systemName: systemName || '',
      timestamp: Date.now()
    };
    safeChromeStorageSet(payload);
  }

  function normalizeServerUrl(url) {
    return String(url || '').trim().replace(/\/+$/, '');
  }

  function getPortalWorkspaceStorageKey(server, user) {
    var normalizedServer = normalizeServerUrl(server || API_SERVER || '');
    var normalizedUser = (user || '').trim() || 'default';
    if (!normalizedServer) return '';
    return PORTAL_WORKSPACE_SYNC_KEY_PREFIX + normalizedServer + '::' + normalizedUser;
  }

  function buildSystemFlowPreferenceKey(system, user, server) {
    var normalizedUser = (user || '').trim() || 'default';
    var normalizedServer = normalizeServerUrl(server || API_SERVER || location.origin || '');
    var rawSystemId = '';
    if (system && system.id !== undefined && system.id !== null && String(system.id).trim()) {
      rawSystemId = 'id:' + String(system.id).trim();
    } else if (system && system.url) {
      rawSystemId = 'url:' + String(system.url).trim().toLowerCase();
    } else if (system && system.name) {
      rawSystemId = 'name:' + String(system.name).trim().toLowerCase();
    }
    if (!normalizedServer || !rawSystemId) return '';
    return normalizedServer + '::' + normalizedUser + '::' + rawSystemId;
  }

  function loadSystemFlowPreference(system, user, server) {
    return new Promise(function(resolve) {
      if (!isExtensionContextReady()) { resolve(''); return; }
      var prefKey = buildSystemFlowPreferenceKey(system, user, server);
      if (!prefKey) { resolve(''); return; }
      try {
        chrome.storage.local.get([SYSTEM_FLOW_PREFS_KEY], function(result) {
          try {
            if (chrome.runtime && chrome.runtime.lastError) {
              resolve('');
              return;
            }
          } catch (e) {}
          var map = result ? result[SYSTEM_FLOW_PREFS_KEY] : null;
          if (!map || typeof map !== 'object' || Array.isArray(map)) { resolve(''); return; }
          var entry = map[prefKey];
          if (!entry || typeof entry !== 'object') { resolve(''); return; }
          var flow = String(entry.flow || '').trim();
          resolve(flow);
        });
      } catch (e) {
        resolve('');
      }
    });
  }

  function saveSystemFlowPreference(system, user, server, flow) {
    if (!isExtensionContextReady()) return;
    var prefKey = buildSystemFlowPreferenceKey(system, user, server);
    var normalizedFlow = String(flow || '').trim();
    if (!prefKey || !normalizedFlow) return;
    try {
      chrome.storage.local.get([SYSTEM_FLOW_PREFS_KEY], function(result) {
        var map = result ? result[SYSTEM_FLOW_PREFS_KEY] : null;
        if (!map || typeof map !== 'object' || Array.isArray(map)) {
          map = {};
        }
        map[prefKey] = {
          flow: normalizedFlow,
          updatedAt: Date.now(),
          systemName: (system && system.name) ? String(system.name) : '',
          site: hostname || ''
        };
        var payload = {};
        payload[SYSTEM_FLOW_PREFS_KEY] = map;
        safeChromeStorageSet(payload);
      });
    } catch (e) {
      // ignore storage failures
    }
  }

  function isPortalPage() {
    return pathLower.endsWith('/sso-portal.html') || pathLower === '/sso-portal.html';
  }

  function dedupeStringList(list) {
    var seen = {};
    var output = [];
    for (var i = 0; i < (list || []).length; i++) {
      var item = String(list[i] || '').trim();
      if (!item || seen[item]) continue;
      seen[item] = true;
      output.push(item);
    }
    return output;
  }

  function escapeCssAttributeValue(value) {
    return String(value || '')
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"')
      .replace(/\r?\n/g, ' ')
      .trim();
  }

  function escapeCssIdentifier(value) {
    var raw = String(value || '').trim();
    if (!raw) return raw;
    if (window.CSS && typeof window.CSS.escape === 'function') return window.CSS.escape(raw);
    return raw.replace(/([ !"#$%&'()*+,./:;<=>?@[\\\]^`{|}~])/g, '\\$1');
  }

  function isElementVisible(el) {
    if (!el || el.disabled) return false;
    try {
      var style = window.getComputedStyle(el);
      if (!style) return false;
      if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity || '1') === 0) return false;
      var rect = el.getBoundingClientRect();
      return rect && rect.width > 0 && rect.height > 0;
    } catch (e) {
      return false;
    }
  }

  function getControlInnerInput(el) {
    if (!el) return null;
    if (el.tagName === 'VAADIN-TEXT-FIELD' || el.tagName === 'VAADIN-PASSWORD-FIELD' || el.tagName === 'VAADIN-EMAIL-FIELD') {
      try {
        if (el.shadowRoot && el.shadowRoot.querySelector) {
          var inner = el.shadowRoot.querySelector('input');
          if (inner) return inner;
        }
      } catch (e) {}
      if (el.querySelector) {
        var nested = el.querySelector('input');
        if (nested) return nested;
      }
    }
    return el;
  }

  function getElementLabelText(el) {
    if (!el) return '';
    var input = getControlInnerInput(el) || el;
    var pieces = [];
    if (input.labels && input.labels.length) {
      for (var i = 0; i < input.labels.length; i++) {
        pieces.push((input.labels[i].textContent || '').trim());
      }
    }
    var closestLabel = input.closest ? input.closest('label') : null;
    if (closestLabel) {
      pieces.push((closestLabel.textContent || '').trim());
    }
    var parent = input.parentElement;
    if (parent) {
      pieces.push((parent.textContent || '').trim());
    }
    return dedupeStringList(pieces).join(' ');
  }

  function getElementHintText(el) {
    if (!el) return '';
    var input = getControlInnerInput(el) || el;
    var pieces = [
      input.getAttribute ? (input.getAttribute('name') || '') : '',
      input.getAttribute ? (input.getAttribute('id') || '') : '',
      input.getAttribute ? (input.getAttribute('placeholder') || '') : '',
      input.getAttribute ? (input.getAttribute('aria-label') || '') : '',
      input.getAttribute ? (input.getAttribute('title') || '') : '',
      getElementLabelText(el)
    ];
    return dedupeStringList(pieces).join(' ').toLowerCase();
  }

  function buildElementSelectorCandidates(el) {
    if (!el) return [];
    var input = getControlInnerInput(el) || el;
    var selectorRoot = (el.tagName || '').toLowerCase();
    var inputTag = (input.tagName || '').toLowerCase();
    var tag = selectorRoot || inputTag || '*';
    var selectors = [];
    var id = input.getAttribute ? (input.getAttribute('id') || '') : '';
    var name = input.getAttribute ? (input.getAttribute('name') || '') : '';
    var placeholder = input.getAttribute ? (input.getAttribute('placeholder') || '') : '';
    var type = input.getAttribute ? (input.getAttribute('type') || '') : '';
    var role = input.getAttribute ? (input.getAttribute('role') || '') : '';
    var classes = String((input.className || el.className || '')).split(/\s+/).filter(function(cls) {
      return cls && cls.length <= 40 && !/\d{4,}/.test(cls);
    });

    if (el.tagName === 'VAADIN-TEXT-FIELD') selectors.push('vaadin-text-field');
    if (el.tagName === 'VAADIN-PASSWORD-FIELD') selectors.push('vaadin-password-field');
    if (el.tagName === 'VAADIN-EMAIL-FIELD') selectors.push('vaadin-email-field');
    if (id) selectors.push('#' + escapeCssIdentifier(id));
    if (name) selectors.push(tag + '[name="' + escapeCssAttributeValue(name) + '"]');
    if (type && tag) selectors.push(tag + '[type="' + escapeCssAttributeValue(type) + '"]');
    if (placeholder && tag) selectors.push(tag + '[placeholder*="' + escapeCssAttributeValue(placeholder.slice(0, 12)) + '"]');
    if (role && tag) selectors.push(tag + '[role="' + escapeCssAttributeValue(role) + '"]');
    if (classes.length && tag) selectors.push(tag + '.' + classes.slice(0, 2).map(escapeCssIdentifier).join('.'));
    if (tag === 'button') selectors.push('button');
    if (tag === 'textarea') selectors.push('textarea');
    if (tag === 'input') selectors.push('input');
    return dedupeStringList(selectors).slice(0, 5);
  }

  function collectKeywordHintsFromUrl(rawUrl) {
    var pathKeywords = [];
    var urlKeywords = [];
    try {
      var u = new URL(rawUrl);
      var parts = ((u.pathname || '') + '/' + ((u.hash || '').replace(/^#/, '')))
        .split(/[\/#?&=._-]+/)
        .map(function(item) { return String(item || '').trim().toLowerCase(); })
        .filter(function(item) {
          return item && item.length >= 3 && ['login', 'signin', 'auth', 'portal', 'index', 'home'].indexOf(item) < 0;
        });
      pathKeywords = dedupeStringList(parts).slice(0, 4);
      u.searchParams.forEach(function(value, key) {
        var normalizedKey = String(key || '').trim().toLowerCase();
        var normalizedValue = String(value || '').trim().toLowerCase();
        if (!normalizedKey || ['redirect', 'redirect_uri', 'returnurl', 'return_url', '_t', 'ts'].indexOf(normalizedKey) >= 0) return;
        if (normalizedValue && normalizedValue.length <= 36) {
          urlKeywords.push(normalizedKey + '=' + normalizedValue);
        } else {
          urlKeywords.push(normalizedKey);
        }
      });
    } catch (e) {
      // ignore parse failure
    }
    return {
      path_keywords: dedupeStringList(pathKeywords).slice(0, 4),
      url_keywords: dedupeStringList(urlKeywords).slice(0, 3)
    };
  }

  function pageLooksLikeVaadinForSampling() {
    return !!document.querySelector('vaadin-text-field, vaadin-password-field, vaadin-button, .v-button, .v-window, .jmix-dialog, [class*="v-textfield"], [class*="v-passwordfield"], [class*="jmix"]');
  }

  function findVisibleElement(selectors) {
    for (var i = 0; i < selectors.length; i++) {
      try {
        var nodes = document.querySelectorAll(selectors[i]);
        for (var j = 0; j < nodes.length; j++) {
          if (isElementVisible(nodes[j])) return nodes[j];
        }
      } catch (e) {
        // ignore selector errors
      }
    }
    return null;
  }

  function sampleCurrentPageForLoginRule() {
    var controls = Array.prototype.slice.call(document.querySelectorAll('input, textarea, vaadin-text-field, vaadin-password-field, vaadin-email-field'));
    var visibleControls = controls.filter(isElementVisible);
    var buttons = Array.prototype.slice.call(document.querySelectorAll('button, input[type="submit"], [role="button"], vaadin-button, .v-button')).filter(isElementVisible);
    var pageText = ((document.title || '') + ' ' + (document.body ? (document.body.innerText || '') : '')).toLowerCase();

    var usernameEl = null;
    var passwordEl = null;
    var tokenEl = null;
    var otpEl = null;
    var otpDialogEl = findVisibleElement(['.ant-modal', '.el-dialog', '[role="dialog"]', '.modal.show .modal-content', '.v-window', '.jmix-dialog', '.popover-content']);
    var submitEl = null;
    var otpSubmitEl = null;
    var submitTexts = [];
    var otpSubmitTexts = [];

    for (var i = 0; i < visibleControls.length; i++) {
      var control = visibleControls[i];
      var input = getControlInnerInput(control) || control;
      var hint = getElementHintText(control);
      var type = String((input.getAttribute && input.getAttribute('type')) || '').toLowerCase();
      if (!passwordEl && (control.tagName === 'VAADIN-PASSWORD-FIELD' || type === 'password' || hint.indexOf('password') >= 0 || hint.indexOf('密码') >= 0)) {
        passwordEl = control;
        continue;
      }
      if (!tokenEl && (hint.indexOf('token') >= 0 || hint.indexOf('bearer') >= 0 || hint.indexOf('令牌') >= 0)) {
        tokenEl = control;
        continue;
      }
      if (!otpEl && (hint.indexOf('otp') >= 0 || hint.indexOf('code') >= 0 || hint.indexOf('验证码') >= 0 || hint.indexOf('动态口令') >= 0 || hint.indexOf('认证码') >= 0)) {
        otpEl = control;
        continue;
      }
      if (!usernameEl && (hint.indexOf('username') >= 0 || hint.indexOf('account') >= 0 || hint.indexOf('email') >= 0 || hint.indexOf('账号') >= 0 || hint.indexOf('用户') >= 0 || hint.indexOf('邮箱') >= 0 || control.tagName === 'VAADIN-TEXT-FIELD' || control.tagName === 'VAADIN-EMAIL-FIELD')) {
        usernameEl = control;
      }
    }

    for (var j = 0; j < buttons.length; j++) {
      var btn = buttons[j];
      var btnText = String(btn.textContent || btn.value || btn.innerText || '').replace(/\s+/g, ' ').trim();
      if (!btnText) continue;
      if (!submitEl && /登录|login|sign in|submit|log in/i.test(btnText)) {
        submitEl = btn;
        submitTexts.push(btnText);
      }
      if (!otpSubmitEl && /确认|确定|ok|confirm|submit/i.test(btnText)) {
        otpSubmitEl = btn;
        otpSubmitTexts.push(btnText);
      }
    }

    var flowType = 'basic';
    var flowEvidence = [];
    if (tokenEl || /k8s|kubernetes|dashboard|token/.test(pageText)) {
      flowType = 'k8s';
      flowEvidence.push('token');
    } else if (pageLooksLikeVaadinForSampling()) {
      flowType = 'vaadin';
      flowEvidence.push('vaadin');
    } else if (otpEl || otpDialogEl || /otp|mfa|身份认证|动态口令|验证码|双因素/.test(pageText)) {
      flowType = 'iam';
      flowEvidence.push('otp');
    } else if (/iam|sso|cas|oauth|oidc|idp/.test(pageText + ' ' + location.href.toLowerCase())) {
      flowType = 'iam';
      flowEvidence.push('sso');
    }

    var keywordHints = collectKeywordHintsFromUrl(location.href);
    var sample = {
      version: 1,
      page_url: location.href,
      hostname: location.hostname,
      page_title: document.title || '',
      captured_at: Date.now(),
      detected_flow_type: flowType,
      summary: {
        visible_control_count: visibleControls.length,
        visible_button_count: buttons.length,
        flow_evidence: flowEvidence
      },
      rule_draft: {
        flow_type: flowType,
        enabled: true,
        priority: flowType === 'k8s' ? 130 : (flowType === 'iam' ? 120 : 100),
        domains: [location.hostname],
        path_keywords: keywordHints.path_keywords,
        url_keywords: keywordHints.url_keywords,
        username_selector: buildElementSelectorCandidates(usernameEl).join('\n'),
        password_selector: buildElementSelectorCandidates(passwordEl).join('\n'),
        otp_selector: buildElementSelectorCandidates(otpEl).join('\n'),
        token_selector: buildElementSelectorCandidates(tokenEl).join('\n'),
        submit_selector: buildElementSelectorCandidates(submitEl).join('\n'),
        submit_text: dedupeStringList(submitTexts).slice(0, 4).join(','),
        submit_strategy: 'auto',
        submit_delay_ms: flowType === 'k8s' ? 700 : 0,
        otp_dialog_selector: buildElementSelectorCandidates(otpDialogEl).join('\n'),
        otp_submit_selector: buildElementSelectorCandidates(otpSubmitEl).join('\n'),
        otp_submit_text: dedupeStringList(otpSubmitTexts).slice(0, 4).join(','),
        otp_submit_strategy: 'auto',
        notes: '浏览器实时采样：' + location.href
      }
    };

    return sample;
  }

  if (isExtensionContextReady() && chrome.runtime && chrome.runtime.onMessage) {
    try {
      chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
        if (!request || request.type !== 'sampleLoginPageStructure') return;
        try {
          var sample = sampleCurrentPageForLoginRule();
          sendResponse({ ok: true, sample: sample });
        } catch (e) {
          sendResponse({ ok: false, error: (e && e.message) ? e.message : 'sample failed' });
        }
      });
    } catch (e) {
      // ignore listener failures
    }
  }

  // 宽松的登录页检测：hash 或 pathname 包含 login/signin
  function isLoginPage() {
    var hash = location.hash.toLowerCase();
    var path = location.pathname.toLowerCase();
    return hash.includes('login') || hash.includes('signin')
      || path.includes('/login') || path.includes('/signin')
      || path.endsWith('/login') || path.endsWith('/signin');
  }

  function resolvePortalThemeMode() {
    var body = document.body;
    if (!body) return 'classic';
    if (body.classList.contains('ui-antd-light')) return 'light';
    if (body.classList.contains('ui-antd-dark')) return 'dark';
    var dataTheme = body.getAttribute('data-theme');
    if (dataTheme === 'light') return 'light';
    return 'classic';
  }

  function resolvePortalDensityMode() {
    var body = document.body;
    if (!body) return 'standard';
    if (body.classList.contains('enterprise-density') || body.classList.contains('compact-mode')) {
      return 'compact';
    }
    return 'standard';
  }

  function initPortalAppearanceSync() {
    if (!isExtensionContextReady()) return;
    var body = document.body;
    if (!body) return;

    var lastSig = '';
    var lastAuthSig = '';
    var lastFlowSig = '';
    var lastWorkspaceSig = '';
    var timer = null;
    var authTimer = null;
    var flowTimer = null;
    var workspaceTimer = null;
    var stopped = false;

    function syncNow() {
      if (stopped) return;
      var theme = resolvePortalThemeMode();
      var density = resolvePortalDensityMode();
      var sig = theme + '|' + density;
      if (sig === lastSig) return;
      var ok = safeChromeStorageSet({
        sso_popup_theme: theme,
        sso_popup_density: density
      });
      if (!ok) {
        stopped = true;
        if (observer) observer.disconnect();
        return;
      }
      lastSig = sig;
      console.log('[AutoLogin] synced portal UI -> plugin: theme=' + theme + ', density=' + density);
    }

    function syncPortalAuthToExtension() {
      if (stopped) return;
      var user = '';
      try {
        var params = new URLSearchParams(location.search || '');
        user = (params.get('user') || '').trim();
      } catch (e) {
        user = '';
      }
      if (!user) return;

      var portalTokenKey = 'sso_token_' + user;
      var token = '';
      try {
        token = (window.localStorage.getItem(portalTokenKey) || window.sessionStorage.getItem(portalTokenKey) || '').trim();
      } catch (e) {
        token = '';
      }

      var server = String(location.origin || '').replace(/\/+$/, '');
      if (!server) return;
      var authSig = user + '|' + server + '|' + token;
      if (authSig === lastAuthSig) return;
      lastAuthSig = authSig;

      var payload = {
        sso_server: server,
        sso_user: user
      };
      payload['sso_token::' + server + '::' + user] = token;
      var ok = safeChromeStorageSet(payload);
      if (!ok) {
        stopped = true;
        if (observer) observer.disconnect();
        return;
      }
      if (token) {
        console.log('[AutoLogin] synced portal auth -> plugin (user=' + user + ')');
      } else {
        console.log('[AutoLogin] cleared plugin auth token from portal state (user=' + user + ')');
      }
    }

    function scheduleSync() {
      if (timer) clearTimeout(timer);
      timer = setTimeout(syncNow, 80);
    }

    function scheduleAuthSync() {
      if (authTimer) clearTimeout(authTimer);
      authTimer = setTimeout(syncPortalAuthToExtension, 80);
    }

    function syncSystemFlowPrefsToPortal() {
      if (stopped || !isExtensionContextReady()) return;
      var user = '';
      try {
        var params = new URLSearchParams(location.search || '');
        user = (params.get('user') || '').trim();
      } catch (e) {
        user = '';
      }
      if (!user) return;

      var server = normalizeServerUrl(location.origin || '');
      if (!server) return;
      var userMarker = '::' + user + '::';
      try {
        chrome.storage.local.get([SYSTEM_FLOW_PREFS_KEY], function(result) {
          var allMap = result ? result[SYSTEM_FLOW_PREFS_KEY] : null;
          var filteredMap = {};
          if (allMap && typeof allMap === 'object' && !Array.isArray(allMap)) {
            Object.keys(allMap).forEach(function(k) {
              var markerIndex = k.indexOf(userMarker);
              if (markerIndex < 0) return;
              var rawSystemId = k.slice(markerIndex + userMarker.length);
              if (!rawSystemId) return;
              var entry = allMap[k];
              var prev = filteredMap[rawSystemId];
              if (!prev || Number(entry && entry.updatedAt || 0) >= Number(prev && prev.updatedAt || 0)) {
                filteredMap[rawSystemId] = entry;
              }
            });
          }
          var payloadObj = {
            user: user,
            server: server,
            updatedAt: Date.now(),
            flows: filteredMap
          };
          var serialized = JSON.stringify(payloadObj);
          if (serialized === lastFlowSig) return;
          lastFlowSig = serialized;
          try {
            window.localStorage.setItem(PORTAL_SYSTEM_FLOW_PREFS_CACHE_KEY, serialized);
          } catch (e) {
            // ignore localStorage failures
          }
        });
      } catch (e) {
        // ignore storage failures
      }
    }

    function scheduleFlowSync() {
      if (flowTimer) clearTimeout(flowTimer);
      flowTimer = setTimeout(syncSystemFlowPrefsToPortal, 100);
    }

    function syncPortalWorkspaceToExtension() {
      if (stopped) return;
      var user = '';
      try {
        var params = new URLSearchParams(location.search || '');
        user = (params.get('user') || '').trim();
      } catch (e) {
        user = '';
      }
      if (!user) return;

      var server = normalizeServerUrl(location.origin || '');
      var storageKey = getPortalWorkspaceStorageKey(server, user);
      if (!storageKey) return;

      var favorites = [];
      var recents = [];
      try {
        favorites = JSON.parse(window.localStorage.getItem('sso_favorites_v1_' + user) || '[]');
        recents = JSON.parse(window.localStorage.getItem('sso_recent_visits_v1_' + user) || '[]');
      } catch (e) {
        favorites = [];
        recents = [];
      }
      if (!Array.isArray(favorites)) favorites = [];
      if (!Array.isArray(recents)) recents = [];

      var payloadObj = {
        user: user,
        server: server,
        updatedAt: Date.now(),
        favorites: favorites.slice(0, 12),
        recents: recents.slice(0, 12)
      };
      var serialized = JSON.stringify(payloadObj);
      if (serialized === lastWorkspaceSig) return;
      lastWorkspaceSig = serialized;
      var payload = {};
      payload[storageKey] = payloadObj;
      safeChromeStorageSet(payload);
    }

    function scheduleWorkspaceSync() {
      if (workspaceTimer) clearTimeout(workspaceTimer);
      workspaceTimer = setTimeout(syncPortalWorkspaceToExtension, 100);
    }

    function syncRuntimeVersionToPortal() {
      if (!isExtensionContextReady()) return;
      try {
        var manifest = chrome.runtime.getManifest ? chrome.runtime.getManifest() : null;
        var version = manifest && manifest.version ? String(manifest.version).trim() : '';
        if (!version) return;
        window.localStorage.setItem('sso_plugin_runtime_info_v1', JSON.stringify({
          version: version,
          extension_id: chrome.runtime.id || '',
          synced_at: Date.now()
        }));
      } catch (e) {
        // 忽略上下文失效或本地存储异常
      }
    }

    function syncLatestLoginRuleSampleToPortal() {
      if (!isExtensionContextReady()) return;
      try {
        chrome.storage.local.get([LAST_LOGIN_RULE_SAMPLE_KEY], function(result) {
          var payload = result ? result[LAST_LOGIN_RULE_SAMPLE_KEY] : null;
          if (!payload || typeof payload !== 'object') return;
          try {
            window.localStorage.setItem(PORTAL_LOGIN_RULE_SAMPLE_CACHE_KEY, JSON.stringify(payload));
          } catch (e) {
            // ignore localStorage failures
          }
        });
      } catch (e) {
        // ignore storage failures
      }
    }

    syncRuntimeVersionToPortal();
    syncNow();
    syncPortalAuthToExtension();
    syncSystemFlowPrefsToPortal();
    syncPortalWorkspaceToExtension();
    syncLatestLoginRuleSampleToPortal();
    setInterval(syncPortalAuthToExtension, 1200);
    setInterval(syncSystemFlowPrefsToPortal, 1200);
    setInterval(syncPortalWorkspaceToExtension, 1500);
    setInterval(syncLatestLoginRuleSampleToPortal, 1500);

    var observer = new MutationObserver(function(mutations) {
      if (stopped) return;
      for (var i = 0; i < mutations.length; i++) {
        if (mutations[i].type === 'attributes') {
          scheduleSync();
          return;
        }
      }
    });
    observer.observe(body, { attributes: true, attributeFilter: ['class', 'data-theme'] });

    window.addEventListener('storage', function(e) {
      if (!e || !e.key) return;
      if (e.key === 'sso_ui_theme_mode_v1' || e.key === 'sso_theme' || e.key === 'sso_density_mode_v1' || e.key === 'sso_compact_mode_v1') {
        scheduleSync();
        return;
      }
      if (e.key.indexOf('sso_token_') === 0 || e.key.indexOf('sso_role_') === 0 || e.key.indexOf('sso_token_exp_') === 0) {
        scheduleAuthSync();
        return;
      }
      if (e.key === PORTAL_SYSTEM_FLOW_PREFS_CACHE_KEY) {
        scheduleFlowSync();
        return;
      }
      if (e.key.indexOf('sso_favorites_v1_') === 0 || e.key.indexOf('sso_recent_visits_v1_') === 0) {
        scheduleWorkspaceSync();
      }
    });
    window.addEventListener('focus', function() {
      syncRuntimeVersionToPortal();
      syncPortalAuthToExtension();
      syncSystemFlowPrefsToPortal();
      syncPortalWorkspaceToExtension();
      syncLatestLoginRuleSampleToPortal();
    });
  }

  if (isPortalPage()) {
    initPortalAppearanceSync();
  }

  if (!isLoginPage()) return;

  function normalizeDomainRule(text) {
    if (typeof AutoSubmitUtils !== 'undefined' && AutoSubmitUtils.normalizeDomainRule) {
      return AutoSubmitUtils.normalizeDomainRule(text);
    }
    if (!text) return '';
    var d = String(text).trim().toLowerCase();
    if (!d) return '';
    d = d.replace(/^https?:\/\//, '');
    d = d.split('/')[0] || '';
    d = d.replace(/^\*\./, '');
    d = d.replace(/:\d+$/, '');
    return d;
  }

  function parseDomainRules(raw) {
    if (typeof AutoSubmitUtils !== 'undefined' && AutoSubmitUtils.parseDomainRules) {
      return AutoSubmitUtils.parseDomainRules(raw);
    }
    if (!raw) return [];
    var input = raw;
    if (Array.isArray(raw)) {
      input = raw.join('\n');
    }
    return String(input)
      .split(/[\n,;]/)
      .map(normalizeDomainRule)
      .filter(function(v, i, arr) { return v && arr.indexOf(v) === i; });
  }

  function isHostInNoSubmitList(host, rules) {
    if (typeof AutoSubmitUtils !== 'undefined' && AutoSubmitUtils.isHostInNoSubmitList) {
      return AutoSubmitUtils.isHostInNoSubmitList(host, rules);
    }
    var h = normalizeDomainRule(host);
    if (!h || !rules || !rules.length) return false;
    for (var i = 0; i < rules.length; i++) {
      var d = rules[i];
      if (h === d || h.endsWith('.' + d)) return true;
    }
    return false;
  }

  function canAutoSubmit() {
    if (!AUTO_SUBMIT_ENABLED) return false;
    if (isHostInNoSubmitList(location.hostname, NO_SUBMIT_DOMAINS)) return false;
    return true;
  }

  function autoSubmitBlockReason() {
    if (!AUTO_SUBMIT_ENABLED) return '已在插件设置中关闭自动提交';
    if (isHostInNoSubmitList(location.hostname, NO_SUBMIT_DOMAINS)) return '当前域名命中禁用自动提交列表';
    return '';
  }

  function normalizeTotpSecret(raw) {
    return String(raw || '').trim().toUpperCase().replace(/[\s-]/g, '');
  }

  function extractTotpSecret(raw) {
    var text = String(raw || '').trim();
    if (!text) return '';
    if (/^otpauth:\/\//i.test(text)) {
      try {
        var parsed = new URL(text);
        var sec = parsed.searchParams.get('secret') || '';
        return normalizeTotpSecret(sec);
      } catch (e) {
        // ignore invalid otpauth URL
      }
    }
    var match = text.match(/secret=([A-Z2-7]+)/i);
    if (match && match[1]) {
      return normalizeTotpSecret(match[1]);
    }
    return normalizeTotpSecret(text);
  }

  function decodeBase32ToBytes(secret) {
    var alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    var clean = normalizeTotpSecret(secret);
    if (!clean) return null;
    var bits = 0;
    var value = 0;
    var bytes = [];
    for (var i = 0; i < clean.length; i++) {
      var idx = alphabet.indexOf(clean.charAt(i));
      if (idx < 0) return null;
      value = (value << 5) | idx;
      bits += 5;
      if (bits >= 8) {
        bytes.push((value >>> (bits - 8)) & 0xff);
        bits -= 8;
      }
    }
    return bytes.length ? new Uint8Array(bytes) : null;
  }

  async function generateTotpCode(secret, digits, periodSeconds) {
    var secretBytes = decodeBase32ToBytes(secret);
    if (!secretBytes || !secretBytes.length) return '';
    if (!window.crypto || !window.crypto.subtle) return '';
    var now = Math.floor(Date.now() / 1000);
    var period = periodSeconds || 30;
    var counter = Math.floor(now / period);
    var msg = new ArrayBuffer(8);
    var view = new DataView(msg);
    var high = Math.floor(counter / 0x100000000);
    var low = counter >>> 0;
    view.setUint32(0, high, false);
    view.setUint32(4, low, false);

    var key = await window.crypto.subtle.importKey(
      'raw',
      secretBytes,
      { name: 'HMAC', hash: { name: 'SHA-1' } },
      false,
      ['sign']
    );
    var signature = await window.crypto.subtle.sign('HMAC', key, msg);
    var hmac = new Uint8Array(signature);
    var offset = hmac[hmac.length - 1] & 0x0f;
    var binary = ((hmac[offset] & 0x7f) << 24)
      | ((hmac[offset + 1] & 0xff) << 16)
      | ((hmac[offset + 2] & 0xff) << 8)
      | (hmac[offset + 3] & 0xff);
    var otpDigits = digits || 6;
    var mod = Math.pow(10, otpDigits);
    return String(binary % mod).padStart(otpDigits, '0');
  }

  async function resolveOtpForSystem(system) {
    if (!system) return '';
    var mode = String(system.otp_mode || '').trim().toLowerCase();
    var hasSecret = !!String(system.otp_secret || '').trim();
    var useTotp = mode === 'totp' || (mode !== 'fixed' && hasSecret);
    if (!useTotp) return system.otp || '';

    var secret = extractTotpSecret(system.otp_secret || system.otp || '');
    if (!secret) {
      console.warn('[AutoLogin] TOTP mode enabled but secret is empty, fallback to configured otp');
      return system.otp || '';
    }
    try {
      var otp = await generateTotpCode(secret, 6, 30);
      if (otp) {
        console.log('[AutoLogin] generated TOTP code for "' + (system.name || '') + '"');
        return otp;
      }
    } catch (e) {
      console.warn('[AutoLogin] generate TOTP failed:', (e && e.message) ? e.message : String(e || ''));
    }
    return system.otp || '';
  }

  // ==================== 获取当前用户 ====================

  function getSSOUser() {
    return new Promise(function(resolve) {
      if (isExtensionContextReady()) {
        try {
          chrome.storage.local.get('sso_user', function(result) {
            if (result && result.sso_user) {
              resolve(result.sso_user);
            } else {
              // 首次使用，提示输入用户名
              var user = prompt('秒登 MiaoDeng 自动登录插件\n\n请输入你的用户名（用于加载你的专属凭据）：\n\n提示：与秒登页面 ?user=xxx 中的用户名一致');
              if (user && user.trim()) {
                user = user.trim();
                safeChromeStorageSet({ sso_user: user });
                resolve(user);
              } else {
                resolve('');
              }
            }
          });
        } catch (e) {
          resolve('');
        }
      } else {
        // 降级：从 localStorage 读取
        var user = localStorage.getItem('sso_autologin_user') || '';
        if (!user) {
          user = prompt('秒登 MiaoDeng 自动登录插件\n\n请输入你的用户名：');
          if (user && user.trim()) {
            user = user.trim();
            localStorage.setItem('sso_autologin_user', user);
          } else {
            user = '';
          }
        }
        resolve(user);
      }
    });
  }

  function getApiUrl(user) {
    var base = API_SERVER + '/api/systems';
    if (user) {
      return base + '?user=' + encodeURIComponent(user);
    }
    return base;
  }

  function getLoginRulesApiUrl(user) {
    var base = API_SERVER + '/api/login-rules';
    if (user) {
      return base + '?user=' + encodeURIComponent(user);
    }
    return base;
  }

  function fetchJsonViaExtension(url, authToken) {
    return new Promise(function(resolve, reject) {
      if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
        chrome.runtime.sendMessage({ type: 'fetchJson', url: url, authToken: authToken || '' }, function(response) {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }
          if (response && response.ok) {
            resolve(response.data);
          } else {
            reject(new Error(response ? response.error : 'no response'));
          }
        });
        return;
      }
      var headers = {};
      if (authToken) {
        headers['X-Auth-Token'] = authToken;
        headers['Authorization'] = 'Bearer ' + authToken;
      }
      fetch(url, { headers: headers, cache: 'no-store' })
        .then(function(res) {
          return res.json().then(function(data) {
            if (!res.ok) throw new Error((data && data.error) ? data.error : ('HTTP ' + res.status));
            return data;
          });
        })
        .then(resolve)
        .catch(reject);
    });
  }

  // ==================== 从 Portal 匹配凭据（评分制）====================

  // 解析 URL 各部分
  function parseFullUrl(urlStr) {
    try {
      var u = new URL(urlStr);
      var hash = u.hash || '';
      var hashWithoutSharp = hash.startsWith('#') ? hash.slice(1) : hash;
      var parts = hashWithoutSharp.split('?');
      var hashPath = parts[0] || '';
      var hashQueryStr = parts[1] || '';
      var hashParams = new URLSearchParams(hashQueryStr);
      return {
        protocol: u.protocol || '',
        hostname: u.hostname,
        port: u.port || '',
        pathname: u.pathname,
        searchParams: u.searchParams,
        hashPath: hashPath,
        hashParams: hashParams
      };
    } catch (e) {
      return null;
    }
  }

  function splitRuleListValue(value) {
    if (!value) return [];
    var input = value;
    if (Array.isArray(value)) {
      input = value.join('\n');
    }
    return String(input)
      .split(/[\n,;，；、]+/)
      .map(function(item) { return String(item || '').trim(); })
      .filter(function(item, index, arr) { return item && arr.indexOf(item) === index; });
  }

  function normalizeLoginRule(rule) {
    var item = rule && typeof rule === 'object' ? rule : {};
    var flowType = String(item.flow_type || 'auto').trim().toLowerCase();
    if (['auto', 'basic', 'iam', 'k8s', 'vaadin'].indexOf(flowType) < 0) flowType = 'auto';
    var submitStrategy = String(item.submit_strategy || 'auto').trim().toLowerCase();
    if (['auto', 'click', 'enter', 'manual'].indexOf(submitStrategy) < 0) submitStrategy = 'auto';
    var otpSubmitStrategy = String(item.otp_submit_strategy || 'auto').trim().toLowerCase();
    if (['auto', 'click', 'enter', 'manual'].indexOf(otpSubmitStrategy) < 0) otpSubmitStrategy = 'auto';
    var submitDelayMs = parseInt(item.submit_delay_ms, 10);
    if (!isFinite(submitDelayMs)) submitDelayMs = flowType === 'k8s' ? 700 : 0;
    submitDelayMs = Math.max(0, Math.min(5000, submitDelayMs));
    var priority = parseInt(item.priority || '0', 10);
    if (!isFinite(priority)) priority = 0;
    return {
      id: String(item.id || '').trim(),
      name: String(item.name || '').trim(),
      enabled: item.enabled !== false,
      priority: priority,
      domains: splitRuleListValue(item.domains || []),
      path_keywords: splitRuleListValue(item.path_keywords || []),
      url_keywords: splitRuleListValue(item.url_keywords || []),
      flow_type: flowType,
      username_selector: String(item.username_selector || '').trim(),
      password_selector: String(item.password_selector || '').trim(),
      otp_selector: String(item.otp_selector || '').trim(),
      token_selector: String(item.token_selector || '').trim(),
      submit_selector: String(item.submit_selector || '').trim(),
      submit_text: String(item.submit_text || '').trim(),
      submit_strategy: submitStrategy,
      submit_delay_ms: submitDelayMs,
      otp_dialog_selector: String(item.otp_dialog_selector || '').trim(),
      otp_submit_selector: String(item.otp_submit_selector || '').trim(),
      otp_submit_text: String(item.otp_submit_text || '').trim(),
      otp_submit_strategy: otpSubmitStrategy,
      notes: String(item.notes || '').trim()
    };
  }

  function hostMatchesRule(host, domains) {
    var currentHost = String(host || '').trim().toLowerCase();
    if (!currentHost || !domains || !domains.length) return false;
    for (var i = 0; i < domains.length; i++) {
      var domain = String(domains[i] || '').trim().toLowerCase().replace(/^\*\./, '');
      if (!domain) continue;
      if (currentHost === domain || currentHost.endsWith('.' + domain)) return true;
    }
    return false;
  }

  function includesAnyKeyword(text, keywords) {
    var source = String(text || '').toLowerCase();
    if (!source || !keywords || !keywords.length) return false;
    for (var i = 0; i < keywords.length; i++) {
      var keyword = String(keywords[i] || '').trim().toLowerCase();
      if (keyword && source.indexOf(keyword) >= 0) return true;
    }
    return false;
  }

  function findMatchingLoginRule(rules, currentUrl, matchedSystem) {
    if (!rules || !rules.length || !currentUrl) return null;
    if (matchedSystem && matchedSystem.login_rule_id) {
      for (var x = 0; x < rules.length; x++) {
        var boundRule = normalizeLoginRule(rules[x]);
        if (boundRule.enabled && String(boundRule.id || '') === String(matchedSystem.login_rule_id || '')) {
          console.log('[AutoLogin] matched bound login rule by system binding:', boundRule.name || boundRule.id || '(unnamed)');
          return boundRule;
        }
      }
    }
    var best = null;
    for (var i = 0; i < rules.length; i++) {
      var rule = normalizeLoginRule(rules[i]);
      if (!rule.enabled) continue;
      if (!hostMatchesRule(currentUrl.hostname, rule.domains)) continue;

      var score = (rule.priority || 0) + 100;
      if (rule.path_keywords.length) {
        if (includesAnyKeyword(currentUrl.pathname + ' ' + currentUrl.hashPath, rule.path_keywords)) {
          score += 40;
        } else {
          score -= 20;
        }
      }
      if (rule.url_keywords.length) {
        if (includesAnyKeyword(location.href, rule.url_keywords)) {
          score += 40;
        } else {
          score -= 25;
        }
      }
      if (matchedSystem && matchedSystem.type && rule.flow_type !== 'auto' && matchedSystem.type === rule.flow_type) {
        score += 12;
      }
      if (!best || score > best.score) {
        best = { rule: rule, score: score };
      }
    }
    return best && best.score > 0 ? best.rule : null;
  }

  function splitSelectorList(raw) {
    if (!raw) return [];
    return String(raw)
      .split(/\n+/)
      .map(function(item) { return item.trim(); })
      .filter(Boolean);
  }

  function resolveInputCandidate(el) {
    if (!el) return null;
    if (el.shadowRoot) {
      var inner = el.shadowRoot.querySelector('input, textarea');
      if (inner) return inner;
    }
    if ((el.tagName === 'VAADIN-TEXT-FIELD' || el.tagName === 'VAADIN-PASSWORD-FIELD' || el.tagName === 'VAADIN-EMAIL-FIELD') && el.querySelector) {
      var nested = el.querySelector('input');
      if (nested) return nested;
    }
    return el;
  }

  function queryByRuleSelectors(root, rawSelectors) {
    var selectors = splitSelectorList(rawSelectors);
    for (var i = 0; i < selectors.length; i++) {
      try {
        var found = root.querySelector(selectors[i]);
        if (found) return resolveInputCandidate(found);
      } catch (e) {
        console.warn('[AutoLogin] invalid selector ignored:', selectors[i]);
      }
    }
    return null;
  }

  function clickElement(el) {
    if (!el) return false;
    try {
      el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
      el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
      el.click();
      return true;
    } catch (e) {
      try {
        el.click();
        return true;
      } catch (err) {
        return false;
      }
    }
  }

  function splitButtonKeywords(text) {
    return String(text || '')
      .split(/[\n,;，；、]+/)
      .map(function(item) { return item.trim(); })
      .filter(Boolean);
  }

  function clickRuleButton(root, selectorText, keywordText) {
    var bySelector = queryByRuleSelectors(root, selectorText);
    if (bySelector && clickElement(bySelector)) return true;

    var keywords = splitButtonKeywords(keywordText);
    if (keywords.length) {
      var allBtns = root.querySelectorAll('button, .ant-btn, .el-button, [role="button"], input[type="submit"], [type="submit"], .btn, vaadin-button');
      for (var i = 0; i < allBtns.length; i++) {
        var text = (allBtns[i].textContent || allBtns[i].innerText || allBtns[i].value || '').replace(/\s+/g, ' ').trim().toLowerCase();
        for (var j = 0; j < keywords.length; j++) {
          if (text.indexOf(String(keywords[j]).toLowerCase()) >= 0) {
            if (clickElement(allBtns[i])) return true;
          }
        }
      }
    }
    return false;
  }

  function waitForRuleElement(root, selectorText, fallbackFinder, maxAttempts, intervalMs) {
    var attempts = 0;
    return new Promise(function(resolve) {
      function check() {
        attempts++;
        var bySelector = queryByRuleSelectors(root, selectorText);
        if (bySelector) {
          resolve(bySelector);
          return;
        }
        if (typeof fallbackFinder === 'function') {
          var fallback = fallbackFinder();
          if (fallback) {
            resolve(resolveInputCandidate(fallback));
            return;
          }
        }
        if (attempts >= maxAttempts) {
          resolve(null);
          return;
        }
        setTimeout(check, intervalMs);
      }
      check();
    });
  }

  async function runConfiguredCredentialRule(rule, config, needsOtp) {
    var userInput = await waitForRuleElement(document, rule.username_selector, findAccountInput, 30, 200);
    var passwordInput = await waitForRuleElement(document, rule.password_selector, findPasswordInput, 30, 200);
    if (!userInput || !passwordInput) {
      console.log('[AutoLogin] configured rule missing account/password input:', rule.name || rule.id || '(unnamed)');
      return false;
    }

    typeValue(userInput, config.username || '');
    await new Promise(function(resolve) { setTimeout(resolve, 120); });
    typeValue(passwordInput, config.password || '');
    await new Promise(function(resolve) { setTimeout(resolve, 180); });
    if (rule.submit_delay_ms > 0) {
      await new Promise(function(resolve) { setTimeout(resolve, rule.submit_delay_ms); });
    }

    if (rule.submit_strategy !== 'manual') {
      var submitted = false;
      if (rule.submit_strategy === 'enter') {
        submitted = pressEnter(passwordInput);
      } else {
        submitted = clickRuleButton(document, rule.submit_selector, rule.submit_text);
        if (!submitted && rule.submit_strategy === 'auto') {
          submitted = clickBtnByText('登录', 'Login', 'Sign in', 'Submit', '提交', '确定', 'Log in');
          if (!submitted) submitted = pressEnter(passwordInput);
        }
      }
      console.log('[AutoLogin] configured submit result:', submitted);
    }

    if (!needsOtp || !config.otp) return true;

    var dialogRoot = await waitForRuleElement(
      document,
      rule.otp_dialog_selector,
      function() {
        return document.querySelector('.ant-modal:not([style*="display: none"])')
          || document.querySelector('.el-dialog:not([style*="display: none"])')
          || document.querySelector('.modal.show .modal-content')
          || document.querySelector('[role="dialog"]:not([style*="display: none"])');
      },
      40,
      250
    );
    if (!dialogRoot) {
      console.log('[AutoLogin] configured rule OTP dialog not found');
      return true;
    }

    var otpInput = await waitForRuleElement(dialogRoot, rule.otp_selector, function() { return null; }, 20, 180);
    if (!otpInput) {
      otpInput = queryByRuleSelectors(document, rule.otp_selector);
    }
    if (!otpInput) {
      console.log('[AutoLogin] configured rule OTP input not found');
      return true;
    }
    typeValue(otpInput, config.otp || '');
    await new Promise(function(resolve) { setTimeout(resolve, 180); });

    if (rule.otp_submit_strategy !== 'manual') {
      var otpSubmitted = false;
      if (rule.otp_submit_strategy === 'enter') {
        otpSubmitted = pressEnter(otpInput);
      } else {
        otpSubmitted = clickRuleButton(dialogRoot, rule.otp_submit_selector, rule.otp_submit_text);
        if (!otpSubmitted && rule.otp_submit_strategy === 'auto') {
          otpSubmitted = clickBtnByText('确认', '确定', 'OK', 'Confirm', 'Submit');
          if (!otpSubmitted) otpSubmitted = pressEnter(otpInput);
        }
      }
      console.log('[AutoLogin] configured OTP submit result:', otpSubmitted);
    }

    return true;
  }

  async function runConfiguredTokenRule(rule, token) {
    var tokenInput = await waitForRuleElement(
      document,
      rule.token_selector,
      function() {
        return document.querySelector('input[placeholder*="token" i]')
          || document.querySelector('input[name*="token" i]')
          || document.querySelector('textarea[placeholder*="token" i]');
      },
      30,
      200
    );
    if (!tokenInput) {
      console.log('[AutoLogin] configured rule token input not found');
      return false;
    }
    typeValue(tokenInput, token || '');
    await new Promise(function(resolve) { setTimeout(resolve, 180); });
    if (rule.submit_delay_ms > 0) {
      await new Promise(function(resolve) { setTimeout(resolve, rule.submit_delay_ms); });
    }

    if (rule.submit_strategy !== 'manual') {
      var submitted = false;
      if (rule.submit_strategy === 'enter') {
        submitted = pressEnter(tokenInput);
      } else {
        submitted = clickRuleButton(document, rule.submit_selector, rule.submit_text);
        if (!submitted && rule.submit_strategy === 'auto') {
          submitted = clickBtnByText('Sign in', 'Sign In', '登录', 'Login', 'Submit');
          if (!submitted) submitted = pressEnter(tokenInput);
        }
      }
      console.log('[AutoLogin] configured token submit result:', submitted);
    }
    return true;
  }

  async function runConfiguredLoginRule(rule, system, otpValue) {
    if (!rule || !system) return false;
    var flowType = rule.flow_type === 'auto' ? String(system.type || 'basic') : rule.flow_type;
    console.log('[AutoLogin] trying configured login rule:', rule.name || rule.id || '(unnamed)', 'flow=' + flowType);
    if (flowType === 'k8s') {
      var k8sToken = system.token || '';
      if ((!k8sToken || k8sToken.indexOf('http') === 0) && system.otp) {
        k8sToken = system.otp;
      }
      return runConfiguredTokenRule(rule, k8sToken);
    }
    return runConfiguredCredentialRule(rule, {
      username: system.username || '',
      password: system.password || '',
      otp: otpValue || ''
    }, flowType === 'iam');
  }

  function decodeLaunchHintText(encoded) {
    if (!encoded) return '';
    try {
      return decodeURIComponent(escape(atob(encoded)));
    } catch (e) {
      try {
        return atob(encoded);
      } catch (err) {
        return '';
      }
    }
  }

  function consumeLaunchHintFromWindowName() {
    var rawName = '';
    try {
      rawName = String(window.name || '');
    } catch (e) {
      rawName = '';
    }
    if (!rawName || rawName.indexOf(LAUNCH_HINT_WINDOW_NAME_PREFIX) !== 0) return null;

    var encoded = rawName.slice(LAUNCH_HINT_WINDOW_NAME_PREFIX.length);
    try {
      window.name = '';
    } catch (e) {
      // ignore clear failure
    }
    if (!encoded) return null;

    var rawText = decodeLaunchHintText(encoded);
    if (!rawText) return null;

    try {
      var parsed = JSON.parse(rawText);
      if (!parsed || typeof parsed !== 'object') return null;
      if (String(parsed.source || '') !== 'sso-portal') return null;

      var ts = Number(parsed.ts || 0);
      if (ts && Math.abs(Date.now() - ts) > LAUNCH_HINT_MAX_AGE_MS) {
        console.log('[AutoLogin] launch hint expired, ignored');
        return null;
      }

      return {
        id: parsed.id !== undefined && parsed.id !== null ? String(parsed.id).trim() : '',
        name: String(parsed.name || '').trim(),
        username: String(parsed.username || '').trim(),
        url: String(parsed.url || '').trim(),
        source: 'window.name'
      };
    } catch (e) {
      return null;
    }
  }

  function parseLaunchHintFromParams(params) {
    if (!params) return null;
    var id = String(params.get(LAUNCH_HINT_URL_PARAM_ID) || '').trim();
    if (!id) return null;
    var ts = Number(params.get(LAUNCH_HINT_URL_PARAM_TS) || 0);
    if (ts && Math.abs(Date.now() - ts) > LAUNCH_HINT_MAX_AGE_MS) {
      console.log('[AutoLogin] launch hint from url expired, ignored');
      return null;
    }
    return {
      id: id,
      name: '',
      username: '',
      url: location.href,
      source: 'url'
    };
  }

  function stripLaunchHintFromUrl(urlObj) {
    var changed = false;
    if (urlObj.searchParams.has(LAUNCH_HINT_URL_PARAM_ID)) {
      urlObj.searchParams.delete(LAUNCH_HINT_URL_PARAM_ID);
      changed = true;
    }
    if (urlObj.searchParams.has(LAUNCH_HINT_URL_PARAM_TS)) {
      urlObj.searchParams.delete(LAUNCH_HINT_URL_PARAM_TS);
      changed = true;
    }

    if (urlObj.hash) {
      var hashRaw = urlObj.hash.startsWith('#') ? urlObj.hash.slice(1) : urlObj.hash;
      var parts = hashRaw.split('?');
      var hashPath = parts[0] || '';
      var hashQuery = parts[1] || '';
      if (hashQuery) {
        var hp = new URLSearchParams(hashQuery);
        var hashChanged = false;
        if (hp.has(LAUNCH_HINT_URL_PARAM_ID)) {
          hp.delete(LAUNCH_HINT_URL_PARAM_ID);
          hashChanged = true;
        }
        if (hp.has(LAUNCH_HINT_URL_PARAM_TS)) {
          hp.delete(LAUNCH_HINT_URL_PARAM_TS);
          hashChanged = true;
        }
        if (hashChanged) {
          var nextHashQuery = hp.toString();
          urlObj.hash = hashPath + (nextHashQuery ? ('?' + nextHashQuery) : '');
          changed = true;
        }
      }
    }
    return changed;
  }

  function consumeLaunchHintFromUrl() {
    var u = null;
    try {
      u = new URL(location.href);
    } catch (e) {
      return null;
    }

    var hint = parseLaunchHintFromParams(u.searchParams);
    if (!hint && u.hash) {
      var hashRaw = u.hash.startsWith('#') ? u.hash.slice(1) : u.hash;
      var parts = hashRaw.split('?');
      var hashQuery = parts[1] || '';
      if (hashQuery) {
        hint = parseLaunchHintFromParams(new URLSearchParams(hashQuery));
      }
    }

    if (!hint) return null;

    try {
      var forClean = new URL(location.href);
      if (stripLaunchHintFromUrl(forClean)) {
        history.replaceState(null, '', forClean.toString());
      }
    } catch (e) {
      // ignore cleanup failures
    }
    return hint;
  }

  function normalizeHintValue(value) {
    return String(value || '').trim().toLowerCase();
  }

  function findSystemByLaunchHint(systems, hint) {
    if (!hint || !systems || !systems.length) return null;

    var hintId = String(hint.id || '').trim();
    if (hintId) {
      for (var i = 0; i < systems.length; i++) {
        var candidate = systems[i];
        var candidateId = candidate && candidate.id !== undefined && candidate.id !== null
          ? String(candidate.id).trim()
          : '';
        if (candidateId && candidateId === hintId) {
          console.log('[AutoLogin] launch hint matched by id: "' + (candidate.name || '') + '"');
          return candidate;
        }
      }
    }

    var hintName = normalizeHintValue(hint.name);
    var hintUser = normalizeHintValue(hint.username);
    var hintUrl = hint.url ? parseFullUrl(hint.url) : null;
    var best = null;

    for (var j = 0; j < systems.length; j++) {
      var s = systems[j];
      var score = 0;

      if (hintName && normalizeHintValue(s.name) === hintName) score += 80;
      if (hintUser && normalizeHintValue(s.username) === hintUser) score += 70;

      if (hintUrl) {
        var sysUrl = parseFullUrl(s.url);
        if (sysUrl && hintUrl.hostname && sysUrl.hostname === hintUrl.hostname) score += 20;
        if (sysUrl && hintUrl.pathname && sysUrl.pathname === hintUrl.pathname) score += 10;
        if (sysUrl && hintUrl.hashPath && sysUrl.hashPath === hintUrl.hashPath) score += 10;
      }

      if (!best || score > best.score) {
        best = { system: s, score: score };
      }
    }

    if (best && best.score >= 80) {
      console.log('[AutoLogin] launch hint matched by metadata: "' + (best.system.name || '') + '" (score: ' + best.score + ')');
      return best.system;
    }
    return null;
  }

  function findMatchingSystem(systems) {
    var current = parseFullUrl(location.href);
    if (!current) return null;

    var candidates = [];

    for (var i = 0; i < systems.length; i++) {
      var s = systems[i];
      var sys = parseFullUrl(s.url);
      if (!sys) continue;

      // hostname 必须匹配（硬性条件）
      if (sys.hostname !== current.hostname) continue;

      var score = 10; // hostname 匹配基础分
      var specificity = 0;

      // 协议匹配（避免 http/https 同 hostname 误匹配）
      if (sys.protocol && current.protocol) {
        if (sys.protocol === current.protocol) {
          score += 6;
        } else {
          score -= 12;
        }
      }

      // 端口匹配
      if (sys.port && current.port) {
        if (sys.port === current.port) {
          score += 5;
        } else {
          score -= 10;
        }
      }

      // pathname 匹配
      if (sys.pathname === current.pathname) score += 3;

      // hash 路径匹配（如 #/login vs #/dashboard）
      if (sys.hashPath && current.hashPath) {
        if (sys.hashPath === current.hashPath) {
          score += 5;
        } else {
          score -= 2;
        }
      }

      // hash 查询参数匹配（关键区分项，如 ?system=saas-tenant）
      var sysKeys = [];
      sys.hashParams.forEach(function(val, key) { sysKeys.push(key); });
      var curKeys = [];
      current.hashParams.forEach(function(val, key) { curKeys.push(key); });

      if (sysKeys.length === 0 && curKeys.length === 0) {
        // 都没有参数 → 加分
        score += 8;
      } else if (sysKeys.length === 0 && curKeys.length > 0) {
        // 配置没参数但当前页有参数（常见于回跳参数）→ 轻微加分
        score += 1;
      } else {
        specificity += sysKeys.length;
        // 逐个对比参数
        for (var j = 0; j < sysKeys.length; j++) {
          var key = sysKeys[j];
          var sysVal = sys.hashParams.get(key);
          var curVal = current.hashParams.get(key);
          if (curVal === sysVal) {
            score += 10; // 每个参数精确匹配 +10
          } else {
            score -= 15; // 参数不匹配，重罚
          }
        }
      }

      // URL search 参数匹配（? 部分，非 hash）
      var sysSearchKeys = [];
      sys.searchParams.forEach(function(val, key) { sysSearchKeys.push(key); });
      specificity += sysSearchKeys.length;
      for (var k = 0; k < sysSearchKeys.length; k++) {
        var sKey = sysSearchKeys[k];
        if (current.searchParams.get(sKey) === sys.searchParams.get(sKey)) {
          score += 5;
        } else {
          score -= 10;
        }
      }

      candidates.push({ system: s, score: score, specificity: specificity, url: (s.url || '') });
    }

    // 按分数降序；同分时优先 URL 约束更多（specificity 高）
    candidates.sort(function(a, b) {
      if (b.score !== a.score) return b.score - a.score;
      if (b.specificity !== a.specificity) return b.specificity - a.specificity;
      return (String(b.url || '').length) - (String(a.url || '').length);
    });

    if (candidates.length > 0 && candidates[0].score > 0) {
      var best = candidates[0];
      console.log('[AutoLogin] best match: "' + best.system.name + '" (score: ' + best.score + ', spec: ' + best.specificity + ')');
      if (candidates.length > 1) {
        console.log('[AutoLogin] runner-up: "' + candidates[1].system.name + '" (score: ' + candidates[1].score + ', spec: ' + candidates[1].specificity + ')');
      }
      return best.system;
    }

    return null;
  }

  // ==================== 通用工具函数 ====================

  // execCommand 模拟真实输入（兼容 React/Vue/Angular）
  function typeValue(el, value) {
    el.focus();
    el.select();
    if (document.execCommand('insertText', false, value)) {
      console.log('[AutoLogin] execCommand OK: ' + value.substring(0, 10) + '...');
      return;
    }
    fallbackSetValue(el, value);
  }

  // 降级方案：直接设 value + 触发事件
  function fallbackSetValue(el, value) {
    var proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    var setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
    setter.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    console.log('[AutoLogin] fallback OK: ' + value.substring(0, 10) + '...');
  }

  // 通用按钮点击（支持多种 UI 框架，优先精确匹配）
  function clickBtnByText() {
    if (!canAutoSubmit()) {
      console.log('[AutoLogin] skip click submit: ' + autoSubmitBlockReason());
      return false;
    }
    var keywords = Array.prototype.slice.call(arguments);
    var allBtns = document.querySelectorAll(
      'button, .ant-btn, .el-button, [role="button"], input[type="submit"], ' +
      'span[class*="ant-btn"], .mat-button, .mat-raised-button, ' +
      '[mat-button], [mat-raised-button], .btn, .v-btn, [type="submit"]'
    );

    // 收集所有匹配的按钮，按文字长度排序（更短 = 更精确）
    var candidates = [];
    for (var i = 0; i < allBtns.length; i++) {
      var btn = allBtns[i];
      var text = (btn.textContent || btn.innerText || '').replace(/\s+/g, '').trim();
      for (var j = 0; j < keywords.length; j++) {
        var kwClean = keywords[j].replace(/\s+/g, '');
        if (text.includes(kwClean)) {
          candidates.push({ btn: btn, text: text, kwIndex: j, textLen: text.length });
          break;
        }
      }
    }

    // 按关键词优先级排序，同优先级按文字长度（短优先 = 精确匹配）
    candidates.sort(function(a, b) {
      if (a.kwIndex !== b.kwIndex) return a.kwIndex - b.kwIndex;
      return a.textLen - b.textLen;
    });

    if (candidates.length > 0) {
      var best = candidates[0];
      console.log('[AutoLogin] click: "' + best.btn.textContent.trim() + '" (matched from ' + candidates.length + ' candidates)');
      best.btn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
      best.btn.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
      best.btn.click();
      return true;
    }
    return false;
  }

  // 通用查找输入框
  function findAccountInput() {
    return document.querySelector('input[id$="account"]')
      || document.querySelector('input[name="account"]')
      || document.querySelector('input[name="username"]')
      || document.querySelector('input[name="email"]')
      || document.querySelector('input[id*="user" i]')
      || document.querySelector('input[id*="account" i]')
      || document.querySelector('input[id*="email" i]')
      || document.querySelector('input[placeholder*="\u8D26\u53F7"]')
      || document.querySelector('input[placeholder*="\u7528\u6237"]')
      || document.querySelector('input[placeholder*="\u90AE\u7BB1"]')
      || document.querySelector('input[placeholder*="user" i]')
      || document.querySelector('input[placeholder*="email" i]')
      || document.querySelector('input[placeholder*="account" i]');
  }

  function findPasswordInput() {
    return document.querySelector('input[type="password"]')
      || document.querySelector('input[id$="password"]')
      || document.querySelector('input[name="password"]')
      || document.querySelector('input[placeholder*="\u5BC6\u7801"]')
      || document.querySelector('input[placeholder*="password" i]');
  }

  function pressEnter(el) {
    if (!canAutoSubmit()) {
      console.log('[AutoLogin] skip Enter submit: ' + autoSubmitBlockReason());
      return false;
    }
    el.focus();
    el.dispatchEvent(new KeyboardEvent('keypress', {
      key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true
    }));
    el.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true
    }));
    el.dispatchEvent(new KeyboardEvent('keyup', {
      key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true
    }));
    return true;
  }

  function isVaadinLikePage() {
    if (document.querySelector('vaadin-text-field, vaadin-password-field, vaadin-button')) return true;
    if (document.querySelector('.v-button, .v-window, .jmix-dialog')) return true;
    if (document.querySelector('[class*="v-textfield"], [class*="v-passwordfield"], [class*="jmix"]')) return true;
    return false;
  }

  // ==================== 登录类型：IAM（账号+密码+OTP弹窗）====================
  function iamLogin(config) {
    console.log('[AutoLogin] [IAM] user: ' + config.username);
    var attempt = 0;

    function step1_fillCredentials() {
      attempt++;
      if (attempt > 60) { console.warn('[AutoLogin] timeout'); return; }

      var accountInput = findAccountInput();
      var passwordInput = findPasswordInput();

      if (!accountInput || !passwordInput) {
        console.log('[AutoLogin] attempt ' + attempt + ', waiting for inputs...');
        setTimeout(step1_fillCredentials, 150);
        return;
      }

      typeValue(accountInput, config.username);
      setTimeout(function() {
        typeValue(passwordInput, config.password);
        console.log('[AutoLogin] filled credentials');

        setTimeout(function() {
          var clicked = clickBtnByText('\u767B\u5F55', 'Saas', 'Login', 'Sign in', 'Submit');
          if (!clicked) pressEnter(passwordInput);
          if (!canAutoSubmit()) {
            console.log('[AutoLogin] IAM credentials filled, waiting for manual submit');
            return;
          }
          console.log('[AutoLogin] waiting for OTP modal...');
          step2_waitForOTPModal();
        }, 500);
      }, 200);
    }

    function step2_waitForOTPModal() {
      var modalAttempt = 0;

      function checkModal() {
        modalAttempt++;
        if (modalAttempt > 80) {
          console.warn('[AutoLogin] no OTP modal detected');
          return;
        }

        // 支持 Ant Design / Element UI / 通用 modal
        var modal = document.querySelector('.ant-modal-wrap:not([style*="display: none"]) .ant-modal')
          || document.querySelector('.ant-modal:not([style*="display: none"])')
          || document.querySelector('.el-dialog:not([style*="display: none"])')
          || document.querySelector('.modal.show .modal-content')
          || document.querySelector('[role="dialog"]:not([style*="display: none"])');

        if (!modal) {
          if (modalAttempt % 10 === 0) console.log('[AutoLogin] waiting for modal... (' + modalAttempt + ')');
          setTimeout(checkModal, 200);
          return;
        }

        console.log('[AutoLogin] OTP modal found');
        setTimeout(function() {
          var codeInput = modal.querySelector('input[id$="code"]')
            || modal.querySelector('input[name="code"]')
            || modal.querySelector('input[placeholder*="\u53E3\u4EE4"]')
            || modal.querySelector('input[placeholder*="\u52A8\u6001"]')
            || modal.querySelector('input[placeholder*="\u9A8C\u8BC1"]')
            || modal.querySelector('input[placeholder*="otp" i]')
            || modal.querySelector('input[maxlength="6"]')
            || modal.querySelector('input');

          if (!codeInput) { console.warn('[AutoLogin] no OTP input found'); return; }

          typeValue(codeInput, config.otp);

          setTimeout(function() {
            console.log('[AutoLogin] OTP filled');
            setTimeout(function() {
              var clicked = false;
              var modalRoot = modal.closest('.ant-modal-root') || modal.closest('.ant-modal-wrap')
                || modal.closest('.el-dialog__wrapper') || modal.closest('[role="dialog"]') || modal;
              var btns = modalRoot.querySelectorAll('button, .ant-btn, .el-button');
              for (var i = 0; i < btns.length; i++) {
                var text = (btns[i].textContent || '').replace(/\s+/g, '');
                if (text.includes('\u786E\u8BA4') || text.includes('\u786E\u5B9A') || text.includes('OK') || text.includes('Submit')) {
                  if (canAutoSubmit()) {
                    btns[i].dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
                    btns[i].dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
                    btns[i].click();
                    clicked = true;
                    console.log('[AutoLogin] click modal btn: "' + btns[i].textContent.trim() + '"');
                  } else {
                    console.log('[AutoLogin] skip OTP modal submit: ' + autoSubmitBlockReason());
                  }
                  break;
                }
              }
              if (!clicked) clicked = clickBtnByText('\u786E\u8BA4', '\u786E\u5B9A', 'OK', 'Confirm');
              if (!clicked) pressEnter(codeInput);
              console.log('[AutoLogin] IAM login done!');
            }, 300);
          }, 200);
        }, 500);
      }

      checkModal();
    }

    setTimeout(step1_fillCredentials, 500);
  }

  // ==================== 登录类型：basic（仅账号+密码）====================
  function basicLogin(config) {
    console.log('[AutoLogin] [Basic] user: ' + config.username);
    var attempt = 0;

    function tryLogin() {
      attempt++;
      if (attempt > 60) { console.warn('[AutoLogin] timeout'); return; }

      var accountInput = findAccountInput();
      var passwordInput = findPasswordInput();

      // 兜底：找所有可见 input
      if (!accountInput || !passwordInput) {
        var inputs = Array.from(document.querySelectorAll(
          'input[type="text"], input[type="email"], input[type="password"], input:not([type])'
        )).filter(function(el) { return el.offsetParent !== null && !el.disabled && !el.readOnly; });

        if (inputs.length < 2) {
          if (attempt % 5 === 0) console.log('[AutoLogin] attempt ' + attempt + ', waiting...');
          setTimeout(tryLogin, 200);
          return;
        }

        var userInput = inputs.find(function(el) { return el.type !== 'password'; }) || inputs[0];
        var passInput = inputs.find(function(el) { return el.type === 'password'; }) || inputs[1];

        typeValue(userInput, config.username);
        setTimeout(function() {
          typeValue(passInput, config.password);
          setTimeout(function() {
            var clicked = clickBtnByText('\u767B\u5F55', 'Login', 'Sign in', 'Submit', '\u63D0\u4EA4', '\u786E\u5B9A', 'Log in');
            if (!clicked) pressEnter(passInput);
            console.log('[AutoLogin] Basic login done!');
          }, 300);
        }, 200);
        return;
      }

      typeValue(accountInput, config.username);
      setTimeout(function() {
        typeValue(passwordInput, config.password);
        console.log('[AutoLogin] filled credentials');
        setTimeout(function() {
          var clicked = clickBtnByText('\u767B\u5F55', 'Login', 'Sign in', 'Submit', '\u63D0\u4EA4', '\u786E\u5B9A', 'Log in');
          if (!clicked) pressEnter(passwordInput);
          console.log('[AutoLogin] Basic login done!');
        }, 300);
      }, 200);
    }

    setTimeout(tryLogin, 500);
  }

  // ==================== 登录类型：K8s（Token）====================
  function k8sLogin(token) {
    console.log('[AutoLogin] [K8s] Token login');
    var k8sSubmitDelayMs = 700;
    var attempt = 0;

    function tryK8sLogin() {
      attempt++;
      if (attempt > 60) { console.warn('[AutoLogin] K8s timeout'); return; }

      var radios = document.querySelectorAll('mat-radio-button, input[type="radio"], [role="radio"]');
      for (var i = 0; i < radios.length; i++) {
        var text = (radios[i].textContent || radios[i].innerText || '').trim();
        if (text.includes('Token') || text.includes('token')) {
          radios[i].click();
          var inner = radios[i].querySelector('input[type="radio"], .mat-radio-input');
          if (inner) inner.click();
          console.log('[AutoLogin] selected Token mode');
          break;
        }
      }

      var tokenInput = document.querySelector('input[placeholder*="token" i]')
        || document.querySelector('input[name*="token" i]')
        || document.querySelector('input[type="password"]')
        || document.querySelector('.mat-input-element')
        || document.querySelector('input.kd-input')
        || document.querySelector('textarea[placeholder*="token" i]');

      if (!tokenInput) {
        if (attempt % 5 === 0) console.log('[AutoLogin] waiting for token input... (' + attempt + ')');
        setTimeout(tryK8sLogin, 200);
        return;
      }

      tokenInput.focus();
      tokenInput.dispatchEvent(new Event('focus', { bubbles: true }));
      tokenInput.select();
      document.execCommand('insertText', false, token);

      tokenInput.dispatchEvent(new InputEvent('input', {
        bubbles: true, cancelable: true, inputType: 'insertText', data: token
      }));
      tokenInput.dispatchEvent(new Event('change', { bubbles: true }));
      tokenInput.dispatchEvent(new Event('blur', { bubbles: true }));

      setTimeout(function() {
        tokenInput.focus();
        if ((tokenInput.value || '') !== (token || '')) {
          typeValue(tokenInput, token || '');
          console.log('[AutoLogin] token corrected before submit');
        }
        console.log('[AutoLogin] token length: ' + tokenInput.value.length);

        setTimeout(function() {
          pressEnter(tokenInput);
          setTimeout(function() {
            if (!isLoginPage()) {
              console.log('[AutoLogin] K8s login success!');
              return;
            }
            clickBtnByText('Sign in', 'Sign In', 'SIGN IN', '\u767B\u5F55', 'Login', 'Submit');
            console.log('[AutoLogin] K8s login done!');
          }, 500);
        }, k8sSubmitDelayMs);
      }, 100);
    }

    setTimeout(tryK8sLogin, 300);
  }

  // ==================== 登录类型：Vaadin/Jmix（Java 后端框架）====================
  function vaadinLogin(config) {
    console.log('[AutoLogin] [Vaadin] user: ' + config.username);
    var attempt = 0;

    function tryVaadinLogin() {
      attempt++;
      // Vaadin 加载慢，给更多重试次数
      if (attempt > 150) { console.warn('[AutoLogin] Vaadin timeout'); return; }

      // 打印页面上有哪些输入框（调试用）
      if (attempt % 5 === 0) {
        var allInputs = document.querySelectorAll('input');
        var allBtns = document.querySelectorAll('.v-button, vaadin-button, button, [role="button"]');
        console.log('[AutoLogin] Vaadin attempt ' + attempt
          + ' | inputs: ' + allInputs.length
          + ' | buttons: ' + allBtns.length
          + ' | classes: ' + Array.from(allInputs).map(function(el) { return el.className || el.type; }).join(', '));
      }

      // Vaadin 特有的输入框选择器（兼容 Vaadin 8/14/23/24+）
      var userInput = document.querySelector('input.v-textfield')
        || document.querySelector('.v-textfield input')
        || document.querySelector('input[class*="v-textfield"]')
        || document.querySelector('vaadin-text-field input')
        || document.querySelector('vaadin-text-field')
        || document.querySelector('[class*="loginField"] input')
        || document.querySelector('[class*="login"] input[type="text"]')
        || findAccountInput();

      // 如果是 vaadin-text-field 元素，获取其内部 input
      if (userInput && userInput.tagName === 'VAADIN-TEXT-FIELD') {
        var inner = userInput.shadowRoot ? userInput.shadowRoot.querySelector('input') : userInput.querySelector('input');
        if (inner) userInput = inner;
      }

      var passInput = document.querySelector('input.v-passwordfield')
        || document.querySelector('.v-passwordfield input')
        || document.querySelector('input[class*="v-passwordfield"]')
        || document.querySelector('vaadin-password-field input')
        || document.querySelector('vaadin-password-field')
        || document.querySelector('input[type="password"]')
        || findPasswordInput();

      // 如果是 vaadin-password-field 元素，获取其内部 input
      if (passInput && passInput.tagName === 'VAADIN-PASSWORD-FIELD') {
        var inner2 = passInput.shadowRoot ? passInput.shadowRoot.querySelector('input') : passInput.querySelector('input');
        if (inner2) passInput = inner2;
      }

      if (!userInput || !passInput) {
        setTimeout(tryVaadinLogin, 500);
        return;
      }

      console.log('[AutoLogin] Vaadin inputs found! user=<' + userInput.tagName + '> class="' + userInput.className + '", pass=<' + passInput.tagName + '> class="' + passInput.className + '"');

      // Vaadin 输入方式：focus → 清空 → 逐步触发
      userInput.focus();
      userInput.value = '';
      userInput.dispatchEvent(new Event('focus', { bubbles: true }));

      userInput.select();
      if (!document.execCommand('insertText', false, config.username)) {
        fallbackSetValue(userInput, config.username);
      }
      userInput.dispatchEvent(new Event('change', { bubbles: true }));
      userInput.dispatchEvent(new Event('blur', { bubbles: true }));

      setTimeout(function() {
        passInput.focus();
        passInput.value = '';
        passInput.dispatchEvent(new Event('focus', { bubbles: true }));

        passInput.select();
        if (!document.execCommand('insertText', false, config.password)) {
          fallbackSetValue(passInput, config.password);
        }
        passInput.dispatchEvent(new Event('change', { bubbles: true }));
        passInput.dispatchEvent(new Event('blur', { bubbles: true }));

        console.log('[AutoLogin] Vaadin credentials filled: user="' + userInput.value + '", pass length=' + passInput.value.length);

        setTimeout(function() {
          // 列出所有按钮供调试
          var allClickable = document.querySelectorAll('.v-button, [class*="v-button"], vaadin-button, button, [role="button"], [class*="btn"], input[type="submit"]');
          console.log('[AutoLogin] Vaadin found ' + allClickable.length + ' clickable elements:');
          for (var d = 0; d < allClickable.length; d++) {
            console.log('  [' + d + '] <' + allClickable[d].tagName + '> class="' + allClickable[d].className + '" text="' + (allClickable[d].textContent || '').trim().substring(0, 30) + '"');
          }

          var clicked = false;

          // 策略1：直接用通用按钮匹配（已优化为精确匹配优先）
          clicked = clickBtnByText('\u767B\u5F55', 'Login', 'Sign in', 'Submit', '\u63D0\u4EA4', 'Log in');

          // 策略2：Vaadin 现代 <vaadin-button>
          if (!clicked) {
            var modernBtns = document.querySelectorAll('vaadin-button');
            var vaadinCandidates = [];
            for (var j = 0; j < modernBtns.length; j++) {
              var text2 = (modernBtns[j].textContent || '').replace(/\s+/g, '').trim();
              if (text2.includes('\u767B\u5F55') || text2.includes('Login') || text2.includes('Submit')
                || text2.includes('Sign') || text2.includes('\u63D0\u4EA4')) {
                vaadinCandidates.push({ btn: modernBtns[j], textLen: text2.length });
              }
            }
            // 短文字优先
            vaadinCandidates.sort(function(a, b) { return a.textLen - b.textLen; });
            if (vaadinCandidates.length > 0) {
              if (canAutoSubmit()) {
                vaadinCandidates[0].btn.click();
                clicked = true;
                console.log('[AutoLogin] Vaadin clicked <vaadin-button>: "' + vaadinCandidates[0].btn.textContent.trim() + '"');
              } else {
                console.log('[AutoLogin] skip Vaadin submit: ' + autoSubmitBlockReason());
              }
            }
          }

          // 策略4：表单提交
          if (!clicked && canAutoSubmit()) {
            var form = passInput.closest('form');
            if (form) {
              try {
                form.requestSubmit ? form.requestSubmit() : form.submit();
                clicked = true;
                console.log('[AutoLogin] Vaadin: submitted via form');
              } catch(e) {
                console.log('[AutoLogin] Vaadin: form submit failed: ' + e);
              }
            }
          }

          // 策略5：回车键
          if (!clicked) {
            if (pressEnter(passInput)) {
              console.log('[AutoLogin] Vaadin: used Enter key as fallback');
            }
          }

          console.log('[AutoLogin] Vaadin login done!');

          if (!canAutoSubmit()) {
            console.log('[AutoLogin] Vaadin credentials filled, waiting for manual submit');
            return;
          }

          // OTP 处理：等待身份认证弹窗
          if (config.otp) {
            console.log('[AutoLogin] Vaadin: waiting for OTP modal...');
            vaadinWaitForOTP(config.otp);
          } else {
            // 无 OTP：延迟重试 - 如果还在登录页则再次尝试
            setTimeout(function() {
              if (isLoginPage()) {
                console.log('[AutoLogin] Vaadin: still on login page, retrying button click...');
                var retryClicked = clickBtnByText('\u767B\u5F55', 'Login', 'Sign in', 'Submit', '\u63D0\u4EA4', 'Log in');
                if (!retryClicked) pressEnter(passInput);
              }
            }, 1000);
          }
        }, 200);
      }, 100);
    }

    // Vaadin OTP 弹窗处理
    function vaadinWaitForOTP(otp) {
      var otpAttempt = 0;

      function checkOTPModal() {
        otpAttempt++;
        if (otpAttempt > 80) {
          console.warn('[AutoLogin] Vaadin: no OTP modal detected');
          return;
        }

        // 查找弹窗（支持多种 UI 框架）
        var modal = document.querySelector('.ant-modal-wrap:not([style*="display: none"]) .ant-modal')
          || document.querySelector('.ant-modal:not([style*="display: none"])')
          || document.querySelector('.el-dialog:not([style*="display: none"])')
          || document.querySelector('.modal.show .modal-content')
          || document.querySelector('[role="dialog"]:not([style*="display: none"])')
          || document.querySelector('.v-window')
          || document.querySelector('.jmix-dialog')
          || document.querySelector('.popover-content');

        // 也检查页面上是否有"身份认证"或"动态口令"相关文字的新表单
        if (!modal) {
          var allDialogs = document.querySelectorAll('.ant-modal, .el-dialog, [role="dialog"], .v-window, .jmix-dialog, .modal-dialog, [class*="dialog"], [class*="Dialog"]');
          for (var d = 0; d < allDialogs.length; d++) {
            var dlgText = (allDialogs[d].textContent || '').trim();
            if (dlgText.includes('\u8EAB\u4EFD\u8BA4\u8BC1') || dlgText.includes('\u52A8\u6001\u53E3\u4EE4')) {
              modal = allDialogs[d];
              break;
            }
          }
        }

        if (!modal) {
          if (otpAttempt % 10 === 0) console.log('[AutoLogin] Vaadin: waiting for OTP modal... (' + otpAttempt + ')');
          setTimeout(checkOTPModal, 250);
          return;
        }

        console.log('[AutoLogin] Vaadin: OTP modal found! tag=<' + modal.tagName + '> class="' + modal.className + '"');

        setTimeout(function() {
          // 查找 OTP 输入框
          var otpInput = modal.querySelector('input[placeholder*="\u53E3\u4EE4"]')
            || modal.querySelector('input[placeholder*="\u52A8\u6001"]')
            || modal.querySelector('input[placeholder*="\u9A8C\u8BC1"]')
            || modal.querySelector('input[placeholder*="otp" i]')
            || modal.querySelector('input[placeholder*="code" i]')
            || modal.querySelector('input[maxlength="6"]')
            || modal.querySelector('input[type="text"]')
            || modal.querySelector('input[type="number"]')
            || modal.querySelector('input[type="tel"]')
            || modal.querySelector('input:not([type="hidden"])');

          if (!otpInput) {
            // 兜底：找页面上所有新出现的可见 input
            var allInputs = document.querySelectorAll('input');
            for (var i = 0; i < allInputs.length; i++) {
              if (allInputs[i].offsetParent !== null && allInputs[i].type !== 'hidden' && allInputs[i].type !== 'password') {
                var ph = (allInputs[i].placeholder || '').toLowerCase();
                if (ph.includes('\u53E3\u4EE4') || ph.includes('\u52A8\u6001') || ph.includes('\u9A8C\u8BC1') || ph.includes('otp') || ph.includes('code')) {
                  otpInput = allInputs[i];
                  break;
                }
              }
            }
          }

          if (!otpInput) {
            console.warn('[AutoLogin] Vaadin: no OTP input found in modal');
            return;
          }

          console.log('[AutoLogin] Vaadin: filling OTP...');
          typeValue(otpInput, otp);

          setTimeout(function() {
            console.log('[AutoLogin] Vaadin: OTP filled, clicking confirm...');

            var clicked = false;

            // 在弹窗范围内找确认按钮
            var modalRoot = modal.closest('.ant-modal-root') || modal.closest('.ant-modal-wrap')
              || modal.closest('.el-dialog__wrapper') || modal.closest('[role="dialog"]')
              || modal.closest('.v-window') || modal;
            var btns = modalRoot.querySelectorAll('button, .ant-btn, .el-button, .v-button, vaadin-button');
            for (var j = 0; j < btns.length; j++) {
              var text = (btns[j].textContent || '').replace(/\s+/g, '');
              if (text.includes('\u786E\u8BA4') || text.includes('\u786E\u5B9A') || text.includes('OK') || text.includes('Confirm') || text.includes('Submit')) {
                if (canAutoSubmit()) {
                  btns[j].dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
                  btns[j].dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
                  btns[j].click();
                  clicked = true;
                  console.log('[AutoLogin] Vaadin: clicked OTP confirm: "' + btns[j].textContent.trim() + '"');
                } else {
                  console.log('[AutoLogin] skip Vaadin OTP confirm: ' + autoSubmitBlockReason());
                }
                break;
              }
            }

            if (!clicked) {
              clicked = clickBtnByText('\u786E\u8BA4', '\u786E\u5B9A', 'OK', 'Confirm', 'Submit');
            }

            if (!clicked) {
              pressEnter(otpInput);
              console.log('[AutoLogin] Vaadin: OTP confirm via Enter key');
            }

            console.log('[AutoLogin] Vaadin OTP login complete!');
          }, 200);
        }, 300);
      }

      setTimeout(checkOTPModal, 800);
    }

    // Vaadin 加载需要更多时间（1秒后开始尝试）
    setTimeout(tryVaadinLogin, 1000);
  }

  function runStandardLoginWithCompatibilityFallback(mode, config, flowContext) {
    var flowName = mode === 'iam' ? 'standard_iam' : 'standard_basic';
    saveLastLoginFlow(flowName, false, config && config.systemName);
    if (flowContext) {
      saveSystemFlowPreference(flowContext.system, flowContext.user, flowContext.server, flowName);
    }

    if (mode === 'iam') {
      iamLogin(config);
    } else {
      basicLogin(config);
    }

    // 标准流程失败后，自动尝试一次兼容流程（仅对 Vaadin/Jmix 页面生效）
    var fallbackDelay = mode === 'iam' ? 4200 : 3200;
    setTimeout(function() {
      if (!canAutoSubmit()) return;
      if (!isLoginPage()) return;
      if (!isVaadinLikePage()) return;
      if (!config || !config.username || !config.password) return;
      console.log('[AutoLogin] standard login fallback -> compatibility mode');
      saveLastLoginFlow(flowName, true, config && config.systemName);
      if (flowContext) {
        saveSystemFlowPreference(flowContext.system, flowContext.user, flowContext.server, 'vaadin');
      }
      vaadinLogin({
        username: config.username || '',
        password: config.password || '',
        otp: config.otp || ''
      });
    }, fallbackDelay);
  }

  function runPreferredVaadinWithStandardFallback(mode, config, flowContext) {
    saveLastLoginFlow('vaadin', false, config && config.systemName);
    if (flowContext) {
      saveSystemFlowPreference(flowContext.system, flowContext.user, flowContext.server, 'vaadin');
    }
    vaadinLogin({
      username: config.username || '',
      password: config.password || '',
      otp: config.otp || ''
    });

    var fallbackDelay = mode === 'iam' ? 4200 : 3200;
    setTimeout(function() {
      if (!canAutoSubmit()) return;
      if (!isLoginPage()) return;
      if (!config || !config.username || !config.password) return;
      console.log('[AutoLogin] preferred compatibility flow fallback -> standard mode');
      runStandardLoginWithCompatibilityFallback(mode, config, flowContext);
    }, fallbackDelay);
  }

  // ==================== 主入口：根据 type 分发登录流程 ====================
  async function init() {
    // 先加载服务器配置
    try {
      var settings = await new Promise(function(resolve) {
        if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
          chrome.runtime.sendMessage({ type: 'getSettings' }, function(res) {
            if (chrome.runtime.lastError || !res) { resolve(null); return; }
            resolve(res);
          });
        } else { resolve(null); }
      });
      if (settings && settings.server) {
        API_SERVER = settings.server;
      }
      if (settings) {
        AUTH_TOKEN = settings.token || '';
        AUTO_SUBMIT_ENABLED = settings.autoSubmit !== false;
        NO_SUBMIT_DOMAINS = parseDomainRules(settings.noSubmitDomains || '');
      }
    } catch (e) { /* 使用默认值 */ }

    // 获取当前用户
    var ssoUser = await getSSOUser();
    var apiUrl = getApiUrl(ssoUser);
    var launchHint = consumeLaunchHintFromWindowName();
    if (!launchHint) {
      launchHint = consumeLaunchHintFromUrl();
    }

    console.log('[AutoLogin] user: ' + (ssoUser || '(default)') + ', API: ' + apiUrl);
    if (canAutoSubmit()) {
      console.log('[AutoLogin] auto-submit: enabled');
    } else {
      console.log('[AutoLogin] auto-submit: disabled (' + autoSubmitBlockReason() + ')');
    }
    if (launchHint) {
      console.log('[AutoLogin] launch hint detected (' + (launchHint.source || 'unknown') + '): id=' + (launchHint.id || '(none)') + ', name="' + (launchHint.name || '') + '"');
    }

    var matchedSystem = null;
    var matchedRule = null;

    // 通过 background service worker 发起请求（绕过 Private Network Access 限制）
    try {
      var results = await Promise.all([
        fetchJsonViaExtension(apiUrl, AUTH_TOKEN),
        fetchJsonViaExtension(getLoginRulesApiUrl(ssoUser), AUTH_TOKEN).catch(function() {
          return { items: [] };
        })
      ]);
      var systems = results[0];
      var loginRulePayload = results[1];
      var availableRules = Array.isArray(loginRulePayload && loginRulePayload.items)
        ? loginRulePayload.items.map(normalizeLoginRule)
        : [];

      if (launchHint) {
        matchedSystem = findSystemByLaunchHint(systems, launchHint);
        if (!matchedSystem) {
          console.log('[AutoLogin] launch hint unmatched, fallback to URL scoring');
        }
      }

      if (!matchedSystem) {
        matchedSystem = findMatchingSystem(systems);
      }
      if (matchedSystem) {
        console.log('[AutoLogin] matched: "' + matchedSystem.name + '" (type: ' + matchedSystem.type + ')');
        matchedRule = findMatchingLoginRule(availableRules, parseFullUrl(location.href), matchedSystem);
        if (matchedRule) {
          console.log('[AutoLogin] matched login rule: "' + (matchedRule.name || matchedRule.id || 'unnamed') + '"');
        }
      } else {
        console.log('[AutoLogin] no matching system in Portal');
      }
    } catch (e) {
      console.log('[AutoLogin] Portal API unavailable, skipping');
      return;
    }

    if (!matchedSystem) {
      console.log('[AutoLogin] no credentials, skipping');
      return;
    }

    if (!matchedSystem.password && !matchedSystem.otp && !matchedSystem.token && !matchedSystem.otp_secret) {
      console.log('[AutoLogin] credentials are protected, please login in popup first');
      return;
    }

    var resolvedOtp = await resolveOtpForSystem(matchedSystem);

    if (matchedRule) {
      var configuredHandled = await runConfiguredLoginRule(matchedRule, matchedSystem, resolvedOtp);
      if (configuredHandled) {
        saveLastLoginFlow('rule:' + (matchedRule.name || matchedRule.id || 'configured'), false, matchedSystem.name || '');
        return;
      }
      console.log('[AutoLogin] configured rule fallback -> built-in heuristics');
    }

    // 根据 Portal 配置 type + 历史成功链路选择流程
    var configuredLoginType = matchedSystem.type || 'basic';
    var preferredFlow = await loadSystemFlowPreference(matchedSystem, ssoUser, API_SERVER);
    var loginType = configuredLoginType;
    var flowContext = { system: matchedSystem, user: ssoUser, server: API_SERVER };

    if ((configuredLoginType === 'iam' || configuredLoginType === 'basic') && preferredFlow === 'vaadin') {
      console.log('[AutoLogin] using saved flow preference: vaadin (skip standard first)');
      runPreferredVaadinWithStandardFallback(configuredLoginType, {
        systemName: matchedSystem.name || '',
        username: matchedSystem.username || '',
        password: matchedSystem.password || '',
        otp: resolvedOtp || ''
      }, flowContext);
      return;
    }

    switch (loginType) {
      case 'iam':
        runStandardLoginWithCompatibilityFallback('iam', {
          systemName: matchedSystem.name || '',
          username: matchedSystem.username || '',
          password: matchedSystem.password || '',
          otp: resolvedOtp || ''
        }, flowContext);
        break;

      case 'k8s':
        // K8s token: 优先用 token 字段，如果 token 看起来不像 JWT 则尝试 otp 字段
        var k8sToken = matchedSystem.token || '';
        if ((!k8sToken || k8sToken.startsWith('http')) && matchedSystem.otp) {
          k8sToken = matchedSystem.otp;
        }
        saveLastLoginFlow('k8s_token', false, matchedSystem.name || '');
        saveSystemFlowPreference(flowContext.system, flowContext.user, flowContext.server, 'k8s_token');
        k8sLogin(k8sToken);
        break;

      case 'vaadin':
        saveLastLoginFlow('vaadin', false, matchedSystem.name || '');
        saveSystemFlowPreference(flowContext.system, flowContext.user, flowContext.server, 'vaadin');
        vaadinLogin({
          username: matchedSystem.username || '',
          password: matchedSystem.password || '',
          otp: resolvedOtp || ''
        });
        break;

      case 'basic':
      default:
        runStandardLoginWithCompatibilityFallback('basic', {
          systemName: matchedSystem.name || '',
          username: matchedSystem.username || '',
          password: matchedSystem.password || ''
        }, flowContext);
        break;
    }
  }

  // 启动
  init();

  // SPA 路由变化
  window.addEventListener('hashchange', function() {
    if (isLoginPage()) {
      console.log('[AutoLogin] route changed, re-running...');
      init();
    }
  });

})();
