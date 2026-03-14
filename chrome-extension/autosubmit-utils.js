(function (global) {
  'use strict';

  function normalizeDomainRule(text) {
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
    if (!raw) return [];
    var input = raw;
    if (Array.isArray(raw)) {
      input = raw.join('\n');
    }
    return String(input)
      .split(/[\n,;]/)
      .map(normalizeDomainRule)
      .filter(function (v, i, arr) { return v && arr.indexOf(v) === i; });
  }

  function isHostInNoSubmitList(host, rules) {
    var h = normalizeDomainRule(host);
    if (!h || !rules || !rules.length) return false;
    for (var i = 0; i < rules.length; i++) {
      var d = rules[i];
      if (h === d || h.endsWith('.' + d)) return true;
    }
    return false;
  }

  var api = {
    normalizeDomainRule: normalizeDomainRule,
    parseDomainRules: parseDomainRules,
    isHostInNoSubmitList: isHostInNoSubmitList
  };

  global.AutoSubmitUtils = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);

