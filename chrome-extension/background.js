// 秒登 MiaoDeng - Background Service Worker
// 代理 API 请求，绕过 Private Network Access 限制

chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
  if (request.type === 'fetchSystems' || request.type === 'fetchJson') {
    var token = request.authToken || '';
    var headers = {};
    if (token) {
      headers['X-Auth-Token'] = token;
      headers['Authorization'] = 'Bearer ' + token;
    }
    fetch(request.url, {
      method: request.method || 'GET',
      headers: headers,
      cache: 'no-store'
    })
      .then(function(res) {
        return res.json().then(function(data) {
          return { ok: res.ok, status: res.status, data: data || {} };
        });
      })
      .then(function(result) {
        if (!result.ok) {
          sendResponse({
            ok: false,
            status: result.status,
            error: (result.data && result.data.error) ? result.data.error : ('HTTP ' + result.status),
            data: result.data
          });
          return;
        }
        sendResponse({ ok: true, data: result.data });
      })
      .catch(function(err) { sendResponse({ ok: false, error: err.message }); });
    return true; // 保持消息通道打开（异步响应）
  }

  if (request.type === 'getSettings') {
    chrome.storage.local.get(['sso_server', 'sso_user', 'sso_auto_submit', 'sso_no_submit_domains'], function(result) {
      var server = (result.sso_server || 'http://localhost:6680').replace(/\/+$/, '');
      var user = result.sso_user || '';
      var tokenKey = 'sso_token::' + server + '::' + (user || 'default');
      chrome.storage.local.get([tokenKey], function(tokenResult) {
        var token = tokenResult[tokenKey] || '';
        sendResponse({
          server: server,
          user: user,
          token: token,
          autoSubmit: result.sso_auto_submit !== false,
          noSubmitDomains: result.sso_no_submit_domains || ''
        });
      });
    });
    return true;
  }
});
