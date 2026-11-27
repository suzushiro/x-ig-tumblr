// chrome.storage.local の読み書き。トークンを含むので content script には渡さない。
(function (g) {
  'use strict';

  const DEFAULTS = {
    consumerKey: '',
    consumerSecret: '',
    // [{ id, label, blog, token, secret }]
    accounts: [],
    // { 'x:screen_name' | 'ig:username': { caption, tags, updatedAt } }
    presets: {},
    settings: {
      draftThreshold: 3,   // この枚数以上を選ぶと自動で下書きにする（0で無効）
      lastAccount: '',
    },
  };

  async function load() {
    const raw = await chrome.storage.local.get(Object.keys(DEFAULTS));
    const out = {};
    for (const k of Object.keys(DEFAULTS)) {
      const d = DEFAULTS[k];
      const v = raw[k];
      if (v === undefined) out[k] = structuredClone(d);
      else if (d && typeof d === 'object' && !Array.isArray(d)) out[k] = { ...d, ...v };
      else out[k] = v;
    }
    return out;
  }

  async function save(patch) {
    await chrome.storage.local.set(patch);
  }

  function publicAccounts(accounts) {
    return (accounts || []).map((a) => ({ id: a.id, label: a.label, blog: a.blog }));
  }

  g.Store = { DEFAULTS, load, save, publicAccounts };
})(typeof self !== 'undefined' ? self : globalThis);
