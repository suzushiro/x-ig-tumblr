// service worker：署名・画像取得・Tumblr への投稿はすべてここで行う。
// content script にはトークンを一切渡さない（X/IG のページ上で動くため）。
importScripts('lib/oauth1.js', 'lib/store.js');

const API_BASE = 'https://api.tumblr.com/v2';
const VALID_STATES = ['published', 'draft', 'private', 'queue'];

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// キャプション：本文を元投稿へのリンクにする。保存するのは本文だけで、
// リンクは投稿ごとに違うので毎回ここで巻き直す（X-Ray と同じ方針）。
// 本文が空ならURLそのものをリンク文字にする（リンクは必ず付ける）。
function buildCaption(text, sourceUrl) {
  const body = (text || '').trim();
  if (!sourceUrl) return esc(body).replace(/\n/g, '<br>');
  const label = body ? esc(body).replace(/\n/g, '<br>') : esc(sourceUrl);
  return `<a href="${esc(sourceUrl)}">${label}</a>`;
}

function parseTags(raw) {
  const seen = new Set();
  const out = [];
  for (const t of String(raw || '').split(/[,、，]/)) {
    const v = t.trim().replace(/^#/, '');
    if (v && !seen.has(v.toLowerCase())) { seen.add(v.toLowerCase()); out.push(v); }
  }
  return out;
}

// X の画像は原寸（name=orig）を取りにいき、ダメなら large に落とす
function candidatesFor(url) {
  try {
    const u = new URL(url);
    if (u.hostname === 'pbs.twimg.com' && u.pathname.startsWith('/media/')) {
      const mk = (name) => { const x = new URL(u); x.searchParams.set('name', name); return x.toString(); };
      return [mk('orig'), mk('4096x4096'), mk('large'), url];
    }
  } catch (e) { /* そのまま */ }
  return [url];
}

async function fetchImage(url) {
  let lastErr = '';
  for (const c of candidatesFor(url)) {
    try {
      const r = await fetch(c, { credentials: 'omit', cache: 'no-store' });
      if (!r.ok) { lastErr = `HTTP ${r.status}`; continue; }
      const blob = await r.blob();
      if (!blob.size) { lastErr = '空のレスポンス'; continue; }
      return blob;
    } catch (e) {
      lastErr = String(e && e.message || e);
    }
  }
  throw new Error(`画像を取得できません（${lastErr}）: ${url.slice(0, 80)}`);
}

function extOf(blob) {
  const t = (blob.type || '').toLowerCase();
  if (t.includes('png')) return 'png';
  if (t.includes('gif')) return 'gif';
  if (t.includes('webp')) return 'webp';
  return 'jpg';
}

async function signedFetch(st, account, method, url, init = {}) {
  const auth = await OAuth1.authHeader({
    method, url,
    consumerKey: st.consumerKey, consumerSecret: st.consumerSecret,
    token: account.token, tokenSecret: account.secret,
    bodyParams: init.bodyParams,
  });
  const headers = Object.assign({}, init.headers, { Authorization: auth });
  return fetch(url, { method, headers, body: init.body, credentials: 'omit' });
}

async function readJson(r) {
  const text = await r.text();
  try { return JSON.parse(text); } catch (e) { return { _raw: text.slice(0, 200) }; }
}

function apiError(r, body) {
  let msg = '';
  const resp = body && body.response;
  if (resp && typeof resp === 'object' && resp.errors) msg = JSON.stringify(resp.errors).slice(0, 200);
  if (!msg && body && Array.isArray(body.errors)) msg = body.errors.map((e) => e.detail || e.title).join(' / ');
  if (!msg && body && body.meta) msg = body.meta.msg || '';
  if (!msg && body && body._raw) msg = body._raw;
  if (r.status === 401) msg = (msg ? msg + ' — ' : '') + 'トークンが無効です。設定画面で連携し直してください';
  return `HTTP ${r.status} ${msg}`.trim();
}

async function createPhotoPost(st, account, msg) {
  if (!VALID_STATES.includes(msg.state)) throw new Error(`stateが不正です: ${msg.state}`);
  if (!msg.images || !msg.images.length) throw new Error('画像が選択されていません');

  // 順序を保ったまま並列で取得する
  const blobs = await Promise.all(msg.images.map(fetchImage));

  const fd = new FormData();
  fd.append('type', 'photo');
  fd.append('state', msg.state);
  fd.append('caption', buildCaption(msg.caption, msg.sourceUrl));
  if (msg.sourceUrl) fd.append('source_url', msg.sourceUrl);
  const tags = parseTags(msg.tags);
  if (tags.length) fd.append('tags', tags.join(','));
  // 複数枚は data[0], data[1], ... で送る（X-Ray と同じ）
  blobs.forEach((b, i) => fd.append(`data[${i}]`, b, `image${i + 1}.${extOf(b)}`));

  // multipart の本文は OAuth1 の署名対象外
  const url = `${API_BASE}/blog/${encodeURIComponent(account.blog)}/post`;
  const r = await signedFetch(st, account, 'POST', url, { body: fd });
  const body = await readJson(r);
  if (r.status !== 200 && r.status !== 201) throw new Error(apiError(r, body));
  const resp = body.response || {};
  const id = resp.id_string || (resp.id != null ? String(resp.id) : '');
  return {
    id,
    postUrl: id ? `https://www.tumblr.com/${account.blog}/${id}` : '',
    count: blobs.length,
  };
}

async function handle(msg) {
  const st = await Store.load();
  const configured = !!(st.consumerKey && st.consumerSecret && st.accounts.length);

  switch (msg && msg.type) {
    case 'context': {
      const preset = msg.key ? st.presets[msg.key] || null : null;
      return {
        ok: true, configured,
        accounts: Store.publicAccounts(st.accounts),
        preset,
        settings: st.settings,
      };
    }
    case 'post': {
      if (!configured) throw new Error('Tumblr連携が未設定です（拡張の設定画面を開いてください）');
      const account = st.accounts.find((a) => a.id === msg.accountId) || st.accounts[0];
      const res = await createPhotoPost(st, account, msg);
      // 投稿が通ってから覚える（失敗した内容を次回に出さない）
      if (msg.key) {
        const fresh = await Store.load();
        fresh.presets[msg.key] = {
          caption: (msg.caption || '').trim(),
          tags: (msg.tags || '').trim(),
          updatedAt: new Date().toISOString(),
        };
        fresh.settings.lastAccount = account.id;
        await Store.save({ presets: fresh.presets, settings: fresh.settings });
      }
      return { ok: true, ...res, state: msg.state, label: account.label, blog: account.blog };
    }
    case 'resetPreset': {
      if (msg.key && st.presets[msg.key]) {
        delete st.presets[msg.key];
        await Store.save({ presets: st.presets });
      }
      return { ok: true };
    }
    case 'openOptions':
      chrome.runtime.openOptionsPage();
      return { ok: true };
    default:
      throw new Error('unknown message');
  }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  handle(msg).then(sendResponse, (e) => sendResponse({ ok: false, error: String(e && e.message || e) }));
  return true; // 非同期で返す
});

chrome.action.onClicked.addListener(() => chrome.runtime.openOptionsPage());

// テスト用に公開（service worker 以外の環境で読み込んだ場合）
self.__tmbTest = { buildCaption, parseTags, candidatesFor };
