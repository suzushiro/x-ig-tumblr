// OAuth1.0a（HMAC-SHA1）署名。service worker / 拡張ページの両方から使う。
// X-Ray の tumblr_client.py と同じく OAuth1 を使う（トークンが失効しないため）。
(function (g) {
  'use strict';

  // RFC 3986 のパーセントエンコード（encodeURIComponent は !'()* を残すので補う）
  function pct(s) {
    return encodeURIComponent(String(s)).replace(/[!'()*]/g,
      (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase());
  }

  function nonce() {
    const a = new Uint8Array(16);
    crypto.getRandomValues(a);
    return [...a].map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  async function hmacSha1B64(key, text) {
    const enc = new TextEncoder();
    const k = await crypto.subtle.importKey('raw', enc.encode(key),
      { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']);
    const sig = new Uint8Array(await crypto.subtle.sign('HMAC', k, enc.encode(text)));
    let bin = '';
    sig.forEach((b) => { bin += String.fromCharCode(b); });
    return btoa(bin);
  }

  // 署名ベース文字列。params は [key, value] の配列（同名キーの重複を許す）
  function baseString(method, url, params) {
    const u = new URL(url);
    const all = params.slice();
    u.searchParams.forEach((v, k) => all.push([k, v]));
    const norm = all.map(([k, v]) => [pct(k), pct(v)])
      .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : (a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0)))
      .map(([k, v]) => `${k}=${v}`).join('&');
    const baseUrl = `${u.protocol}//${u.host}${u.pathname}`;
    return [method.toUpperCase(), pct(baseUrl), pct(norm)].join('&');
  }

  /**
   * Authorization ヘッダを作る。
   * opts: { method, url, consumerKey, consumerSecret, token?, tokenSecret?,
   *         bodyParams?: [[k,v],...]  ← x-www-form-urlencoded のときだけ渡す。
   *                                     multipart の本文は署名に含めない（仕様）
   *         extra?: {oauth_callback, oauth_verifier}, _nonce?, _ts? (テスト用) }
   */
  async function authHeader(opts) {
    const oauth = {
      oauth_consumer_key: opts.consumerKey,
      oauth_nonce: opts._nonce || nonce(),
      oauth_signature_method: 'HMAC-SHA1',
      oauth_timestamp: String(opts._ts || Math.floor(Date.now() / 1000)),
      oauth_version: '1.0',
    };
    if (opts.token) oauth.oauth_token = opts.token;
    Object.assign(oauth, opts.extra || {});
    const params = Object.entries(oauth).concat(opts.bodyParams || []);
    const base = baseString(opts.method, opts.url, params);
    const key = pct(opts.consumerSecret) + '&' + pct(opts.tokenSecret || '');
    oauth.oauth_signature = await hmacSha1B64(key, base);
    return 'OAuth ' + Object.keys(oauth).sort()
      .map((k) => `${pct(k)}="${pct(oauth[k])}"`).join(', ');
  }

  g.OAuth1 = { pct, baseString, hmacSha1B64, authHeader };
})(typeof self !== 'undefined' ? self : globalThis);
