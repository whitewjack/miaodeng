// ==UserScript==
// @name         秒登 MiaoDeng 自动登录
// @namespace    https://iam-test.dragonpass.com.cn
// @version      4.0
// @description  一键自动登录助手 - 自动填入账号密码并登录（支持多用户数据隔离）
// @match        *://*.dragonpass.com.cn/*
// @match        https://192.168.*.*/*
// @match        *://*.dp-svc.com/*
// @connect      localhost
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  // ============ Portal API 配置 ============
  const API_BASE = 'http://localhost:6680/api/systems';
  const LAUNCH_HINT_WINDOW_NAME_PREFIX = 'sso_launch_hint_v1:';
  const LAUNCH_HINT_MAX_AGE_MS = 3 * 60 * 1000;
  const LAUNCH_HINT_URL_PARAM_ID = '_md_sid';
  const LAUNCH_HINT_URL_PARAM_TS = '_md_ts';
  // ============ 重试配置 ============
  const MAX_RETRY = 40;
  const RETRY_INTERVAL = 150;
  // =========================================

  function isLoginPage() {
    var hash = location.hash.toLowerCase();
    var path = location.pathname.toLowerCase();
    return hash.includes('login') || hash.includes('signin')
      || path.includes('/login') || path.includes('/signin');
  }

  if (!isLoginPage()) return;

  // ==================== 获取当前用户 ====================

  function getSSOUser() {
    // 优先用 GM_getValue（跨域持久化）
    if (typeof GM_getValue !== 'undefined') {
      var user = GM_getValue('sso_user', '');
      if (user) return user;

      // 首次使用，提示输入用户名
      user = prompt('秒登 MiaoDeng 自动登录脚本\n\n请输入你的用户名（用于加载你的专属凭据）：\n\n提示：与秒登页面 ?user=xxx 中的用户名一致');
      if (user && user.trim()) {
        user = user.trim();
        GM_setValue('sso_user', user);
        return user;
      }
      return '';
    }

    // 降级：localStorage
    var stored = localStorage.getItem('sso_autologin_user') || '';
    if (!stored) {
      stored = prompt('秒登 MiaoDeng 自动登录脚本\n\n请输入你的用户名：');
      if (stored && stored.trim()) {
        stored = stored.trim();
        localStorage.setItem('sso_autologin_user', stored);
      } else {
        stored = '';
      }
    }
    return stored;
  }

  function getApiUrl(user) {
    if (user) {
      return API_BASE + '?user=' + encodeURIComponent(user);
    }
    return API_BASE;
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
    const rawName = String(window.name || '');
    if (!rawName || !rawName.startsWith(LAUNCH_HINT_WINDOW_NAME_PREFIX)) return null;

    const encoded = rawName.slice(LAUNCH_HINT_WINDOW_NAME_PREFIX.length);
    window.name = '';
    if (!encoded) return null;

    const rawText = decodeLaunchHintText(encoded);
    if (!rawText) return null;
    try {
      const parsed = JSON.parse(rawText);
      if (!parsed || parsed.source !== 'sso-portal') return null;
      const ts = Number(parsed.ts || 0);
      if (ts && Math.abs(Date.now() - ts) > LAUNCH_HINT_MAX_AGE_MS) {
        console.log('[AutoLogin] launch hint expired, ignored');
        return null;
      }
      return {
        id: parsed.id == null ? '' : String(parsed.id).trim(),
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
    const id = String(params.get(LAUNCH_HINT_URL_PARAM_ID) || '').trim();
    if (!id) return null;
    const ts = Number(params.get(LAUNCH_HINT_URL_PARAM_TS) || 0);
    if (ts && Math.abs(Date.now() - ts) > LAUNCH_HINT_MAX_AGE_MS) {
      console.log('[AutoLogin] launch hint from url expired, ignored');
      return null;
    }
    return {
      id,
      name: '',
      username: '',
      url: location.href,
      source: 'url'
    };
  }

  function stripLaunchHintFromUrl(urlObj) {
    let changed = false;
    if (urlObj.searchParams.has(LAUNCH_HINT_URL_PARAM_ID)) {
      urlObj.searchParams.delete(LAUNCH_HINT_URL_PARAM_ID);
      changed = true;
    }
    if (urlObj.searchParams.has(LAUNCH_HINT_URL_PARAM_TS)) {
      urlObj.searchParams.delete(LAUNCH_HINT_URL_PARAM_TS);
      changed = true;
    }

    if (urlObj.hash) {
      const hashRaw = urlObj.hash.startsWith('#') ? urlObj.hash.slice(1) : urlObj.hash;
      const parts = hashRaw.split('?');
      const hashPath = parts[0] || '';
      const hashQuery = parts[1] || '';
      if (hashQuery) {
        const hp = new URLSearchParams(hashQuery);
        let hashChanged = false;
        if (hp.has(LAUNCH_HINT_URL_PARAM_ID)) {
          hp.delete(LAUNCH_HINT_URL_PARAM_ID);
          hashChanged = true;
        }
        if (hp.has(LAUNCH_HINT_URL_PARAM_TS)) {
          hp.delete(LAUNCH_HINT_URL_PARAM_TS);
          hashChanged = true;
        }
        if (hashChanged) {
          const nextHashQuery = hp.toString();
          urlObj.hash = hashPath + (nextHashQuery ? ('?' + nextHashQuery) : '');
          changed = true;
        }
      }
    }
    return changed;
  }

  function consumeLaunchHintFromUrl() {
    let u = null;
    try {
      u = new URL(location.href);
    } catch (e) {
      return null;
    }
    let hint = parseLaunchHintFromParams(u.searchParams);
    if (!hint && u.hash) {
      const hashRaw = u.hash.startsWith('#') ? u.hash.slice(1) : u.hash;
      const parts = hashRaw.split('?');
      const hashQuery = parts[1] || '';
      if (hashQuery) {
        hint = parseLaunchHintFromParams(new URLSearchParams(hashQuery));
      }
    }
    if (!hint) return null;

    try {
      const forClean = new URL(location.href);
      if (stripLaunchHintFromUrl(forClean)) {
        history.replaceState(null, '', forClean.toString());
      }
    } catch (e) {}
    return hint;
  }

  function normalizeHintValue(value) {
    return String(value || '').trim().toLowerCase();
  }

  function findSystemByLaunchHint(systems, hint) {
    if (!hint || !Array.isArray(systems) || systems.length === 0) return null;

    const hintId = String(hint.id || '').trim();
    if (hintId) {
      const exactIdMatch = systems.find(s => s && s.id != null && String(s.id).trim() === hintId);
      if (exactIdMatch) {
        console.log(`[AutoLogin] launch hint matched by id: "${exactIdMatch.name || ''}"`);
        return exactIdMatch;
      }
    }

    const hintName = normalizeHintValue(hint.name);
    const hintUsername = normalizeHintValue(hint.username);
    const hintUrl = String(hint.url || '').trim();
    let hintHost = '';
    try {
      if (hintUrl) hintHost = new URL(hintUrl).hostname;
    } catch (e) {}

    let best = null;
    let bestScore = -1;
    for (const s of systems) {
      if (!s) continue;
      let score = 0;
      if (hintName && normalizeHintValue(s.name) === hintName) score += 80;
      if (hintUsername && normalizeHintValue(s.username) === hintUsername) score += 70;
      if (hintHost) {
        try {
          const candidateHost = new URL(s.url || '').hostname;
          if (candidateHost === hintHost) score += 20;
        } catch (e) {}
      }
      if (score > bestScore) {
        best = s;
        bestScore = score;
      }
    }

    if (best && bestScore >= 80) {
      console.log(`[AutoLogin] launch hint matched by metadata: "${best.name || ''}" (score: ${bestScore})`);
      return best;
    }
    return null;
  }

  // ==================== 从 Portal 匹配凭据 ====================

  function findMatchingSystem(systems) {
    const hostname = location.hostname;
    const hashQuery = (location.hash.split('?')[1]) || '';
    const currentParams = new URLSearchParams(hashQuery);
    const currentSystemParam = currentParams.get('system');

    // 第一轮：精确匹配（hostname + system 参数）
    for (const s of systems) {
      try {
        const sysUrl = new URL(s.url);
        const sysHash = sysUrl.hash || '';
        const sysQuery = sysHash.split('?')[1] || '';
        const sysParams = new URLSearchParams(sysQuery);
        const sysSystemParam = sysParams.get('system');

        if (sysUrl.hostname === hostname) {
          if (currentSystemParam && sysSystemParam && currentSystemParam === sysSystemParam) {
            return s;
          }
          if (!currentSystemParam && !sysSystemParam) {
            return s;
          }
        }
      } catch (e) { /* skip */ }
    }

    // 第二轮：hostname 兜底
    for (const s of systems) {
      try {
        const sysUrl = new URL(s.url);
        if (sysUrl.hostname === hostname) return s;
      } catch (e) { /* skip */ }
    }

    return null;
  }

  // ==================== 获取凭据 ====================

  function fetchSystems(apiUrl) {
    return new Promise((resolve) => {
      // 优先用 GM_xmlhttpRequest（跨域无限制）
      if (typeof GM_xmlhttpRequest !== 'undefined') {
        GM_xmlhttpRequest({
          method: 'GET',
          url: apiUrl,
          onload: function (res) {
            try {
              resolve(JSON.parse(res.responseText));
            } catch (e) {
              console.log('[AutoLogin] parse error:', e);
              resolve(null);
            }
          },
          onerror: function () {
            console.log('[AutoLogin] Portal API unavailable');
            resolve(null);
          }
        });
      } else {
        // 降级到 fetch
        fetch(apiUrl)
          .then(r => r.json())
          .then(resolve)
          .catch(() => {
            console.log('[AutoLogin] Portal API unavailable');
            resolve(null);
          });
      }
    });
  }

  // ==================== 输入工具 ====================

  function setNativeValue(el, value) {
    el.value = '';
    el.dispatchEvent(new Event('input', { bubbles: true }));

    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype, 'value'
    ).set;
    nativeInputValueSetter.call(el, value);

    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));
    el.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true }));
  }

  function clickButton(textOrSelector) {
    let btn = document.querySelector(textOrSelector);
    if (btn) { btn.click(); return true; }

    const buttons = document.querySelectorAll('button, .el-button, [role="button"], input[type="submit"]');
    for (const b of buttons) {
      const t = (b.textContent || b.innerText || '').trim();
      if (t.includes(textOrSelector)) {
        b.click();
        return true;
      }
    }
    return false;
  }

  // ==================== 登录流程 ====================

  function doLogin(config) {
    console.log(`[AutoLogin] using credentials for: ${config._systemName || 'unknown'}`);
    let attempt = 0;

    function tryAutoLogin() {
      attempt++;
      if (attempt > MAX_RETRY) {
        console.warn('[AutoLogin] max retries reached');
        return;
      }

      const inputs = Array.from(document.querySelectorAll(
        'input[type="text"], input[type="password"], input[type="tel"], input[type="number"], input:not([type])'
      )).filter(el => el.offsetParent !== null);

      console.log(`[AutoLogin] attempt ${attempt}, found ${inputs.length} inputs`);

      if (inputs.length < 2) {
        setTimeout(tryAutoLogin, RETRY_INTERVAL);
        return;
      }

      const usernameInput = inputs.find(el =>
        el.type === 'text' || el.type === '' || !el.type
      ) || inputs[0];

      const passwordInput = inputs.find(el =>
        el.type === 'password'
      ) || inputs[1];

      if (usernameInput && passwordInput) {
        console.log('[AutoLogin] filling credentials...');
        setNativeValue(usernameInput, config.username);
        setNativeValue(passwordInput, config.password);

        if (inputs.length >= 3) {
          const otpInput = inputs[2];
          console.log('[AutoLogin] filling OTP...');
          setNativeValue(otpInput, config.otp);

          setTimeout(() => {
            console.log('[AutoLogin] clicking login...');
            clickButton('登') || clickButton('Login') || clickButton('submit') ||
            clickButton('.login-btn') || clickButton('[type="submit"]');
          }, 300);
        } else {
          setTimeout(() => {
            console.log('[AutoLogin] clicking next...');
            clickButton('登') || clickButton('下一步') || clickButton('Next') ||
            clickButton('Login') || clickButton('.login-btn') || clickButton('[type="submit"]');

            setTimeout(waitForOTP, 500);
          }, 300);
        }
      } else {
        setTimeout(tryAutoLogin, RETRY_INTERVAL);
      }
    }

    function waitForOTP() {
      let otpAttempt = 0;
      const maxOTPAttempt = 30;

      function checkOTP() {
        otpAttempt++;
        if (otpAttempt > maxOTPAttempt) {
          console.warn('[AutoLogin] no OTP input found');
          return;
        }

        const inputs = Array.from(document.querySelectorAll(
          'input[type="text"], input[type="password"], input[type="tel"], input[type="number"], input:not([type])'
        )).filter(el => el.offsetParent !== null);

        const otpInput = inputs.find(el => {
          const placeholder = (el.placeholder || '').toLowerCase();
          return placeholder.includes('口令') || placeholder.includes('otp') ||
                 placeholder.includes('验证') || placeholder.includes('token') ||
                 placeholder.includes('动态') || placeholder.includes('code');
        }) || (inputs.length >= 1 ? inputs[inputs.length - 1] : null);

        if (otpInput && otpInput.offsetParent !== null) {
          console.log('[AutoLogin] filling OTP...');
          setNativeValue(otpInput, config.otp);

          setTimeout(() => {
            console.log('[AutoLogin] clicking confirm...');
            clickButton('确') || clickButton('登') || clickButton('验证') ||
            clickButton('Login') || clickButton('Submit') ||
            clickButton('.login-btn') || clickButton('[type="submit"]');
          }, 300);
        } else {
          setTimeout(checkOTP, 200);
        }
      }

      checkOTP();
    }

    setTimeout(tryAutoLogin, 500);
  }

  // ==================== 主入口 ====================

  async function init() {
    // 获取当前用户
    var ssoUser = getSSOUser();
    var apiUrl = getApiUrl(ssoUser);
    let launchHint = consumeLaunchHintFromWindowName();
    if (!launchHint) {
      launchHint = consumeLaunchHintFromUrl();
    }

    console.log('[AutoLogin] user: ' + (ssoUser || '(default)') + ', API: ' + apiUrl);
    if (launchHint) {
      console.log(`[AutoLogin] launch hint detected (${launchHint.source || 'unknown'}): id=${launchHint.id || '(none)'}, name="${launchHint.name || ''}"`);
    }

    const systems = await fetchSystems(apiUrl);
    if (!systems) {
      console.log('[AutoLogin] Portal unavailable, skipping. Start server: python3 server.py');
      return;
    }

    let matched = null;
    if (launchHint) {
      matched = findSystemByLaunchHint(systems, launchHint);
      if (!matched) {
        console.log('[AutoLogin] launch hint unmatched, fallback to URL matching');
      }
    }
    if (!matched) {
      matched = findMatchingSystem(systems);
    }
    if (!matched) {
      console.log('[AutoLogin] no matching system in Portal, skipping');
      return;
    }

    console.log(`[AutoLogin] matched: "${matched.name}"`);

    doLogin({
      username: matched.username || '',
      password: matched.password || '',
      otp: matched.otp || '',
      _systemName: matched.name
    });
  }

  init();

  window.addEventListener('hashchange', () => {
    if (isLoginPage()) {
      init();
    }
  });

})();
