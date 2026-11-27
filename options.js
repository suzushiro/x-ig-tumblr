'use strict';

const REQUEST_TOKEN_URL = 'https://www.tumblr.com/oauth/request_token';
const AUTHORIZE_URL = 'https://www.tumblr.com/oauth/authorize';
const ACCESS_TOKEN_URL = 'https://www.tumblr.com/oauth/access_token';
const API_BASE = 'https://api.tumblr.com/v2';

const $ = (id) => document.getElementById(id);
function msg(id, text, cls) { const m = $(id); m.className = 'msg' + (cls ? ' ' + cls : ''); m.textContent = text || ''; }
const REDIRECT = chrome.identity.getRedirectURL();

async function render() {
  const st = await Store.load();
  $('redirect').textContent = REDIRECT;
  $('ck').value = st.consumerKey;
  $('cs').value = st.consumerSecret;
  $('th').value = st.settings.draftThreshold;

  // 投稿先
  const box = $('accounts');
  box.innerHTML = '';
  if (!st.accounts.length) {
    box.innerHTML = '<div class="empty">まだありません。上の「Tumblr と連携する」から追加してください。</div>';
  } else {
    const t = document.createElement('table');
    t.innerHTML = '<tr><th>表示名</th><th>ブログ</th><th></th></tr>';
    st.accounts.forEach((a, i) => {
      const tr = document.createElement('tr');
      const td1 = document.createElement('td');
      const inp = document.createElement('input');
      inp.type = 'text'; inp.value = a.label;
      inp.onchange = async () => {
        const s = await Store.load();
        if (s.accounts[i]) { s.accounts[i].label = inp.value.trim() || s.accounts[i].blog; await Store.save({ accounts: s.accounts }); }
        msg('acctMsg', '表示名を保存しました', 'ok');
      };
      td1.appendChild(inp);
      const td2 = document.createElement('td'); td2.textContent = a.blog;
      const td3 = document.createElement('td'); td3.style.whiteSpace = 'nowrap';
      const up = document.createElement('button'); up.textContent = '↑'; up.title = '先頭に（既定の投稿先）';
      up.disabled = i === 0;
      up.onclick = async () => {
        const s = await Store.load();
        const [x] = s.accounts.splice(i, 1); s.accounts.unshift(x);
        await Store.save({ accounts: s.accounts }); render();
      };
      const ck = document.createElement('button'); ck.textContent = '確認';
      ck.onclick = () => verify(a);
      const del = document.createElement('button'); del.textContent = '削除'; del.className = 'danger';
      del.onclick = async () => {
        if (!confirm(`${a.label}（${a.blog}）を投稿先から外しますか？`)) return;
        const s = await Store.load();
        s.accounts = s.accounts.filter((x) => x.id !== a.id);
        await Store.save({ accounts: s.accounts }); render();
      };
      td3.append(up, ' ', ck, ' ', del);
      tr.append(td1, td2, td3);
      t.appendChild(tr);
    });
    box.appendChild(t);
  }

  // プリセット
  const pbox = $('presets');
  pbox.innerHTML = '';
  const keys = Object.keys(st.presets).sort();
  if (!keys.length) {
    pbox.innerHTML = '<div class="empty">まだありません。</div>';
  } else {
    const t = document.createElement('table');
    t.innerHTML = '<tr><th>アカウント</th><th>キャプション</th><th>タグ</th><th></th></tr>';
    keys.forEach((k) => {
      const p = st.presets[k];
      const tr = document.createElement('tr');
      const [site, name] = [k.slice(0, k.indexOf(':')), k.slice(k.indexOf(':') + 1)];
      const c = [ (site === 'ig' ? 'IG ' : 'X ') + '@' + name, p.caption, p.tags ];
      c.forEach((v) => { const td = document.createElement('td'); td.textContent = v; tr.appendChild(td); });
      const td = document.createElement('td');
      const del = document.createElement('button'); del.textContent = '削除'; del.className = 'danger';
      del.onclick = async () => {
        const s = await Store.load(); delete s.presets[k]; await Store.save({ presets: s.presets }); render();
      };
      td.appendChild(del); tr.appendChild(td);
      t.appendChild(tr);
    });
    pbox.appendChild(t);
  }
}

function parseForm(text) {
  const out = {};
  new URLSearchParams(text).forEach((v, k) => { out[k] = v; });
  return out;
}

async function oauthPost(url, st, extra, token, tokenSecret) {
  const auth = await OAuth1.authHeader({
    method: 'POST', url, consumerKey: st.consumerKey, consumerSecret: st.consumerSecret,
    token, tokenSecret, extra,
  });
  const r = await fetch(url, { method: 'POST', headers: { Authorization: auth }, credentials: 'omit' });
  const text = await r.text();
  if (!r.ok) throw new Error(`${new URL(url).pathname}: HTTP ${r.status} ${text.slice(0, 200)}`);
  return parseForm(text);
}

async function userInfo(st, token, secret) {
  const url = `${API_BASE}/user/info`;
  const auth = await OAuth1.authHeader({
    method: 'GET', url, consumerKey: st.consumerKey, consumerSecret: st.consumerSecret,
    token, tokenSecret: secret,
  });
  const r = await fetch(url, { headers: { Authorization: auth }, credentials: 'omit' });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`user/info: HTTP ${r.status} ${(body.meta && body.meta.msg) || ''}`);
  return (body.response && body.response.user) || {};
}

async function connect() {
  const st = await Store.load();
  if (!st.consumerKey || !st.consumerSecret) { msg('connectMsg', '先に 1. のキーを保存してください', 'err'); return; }
  $('connect').disabled = true;
  try {
    msg('connectMsg', 'リクエストトークンを取得中…');
    const req = await oauthPost(REQUEST_TOKEN_URL, st, { oauth_callback: REDIRECT });
    if (!req.oauth_token) throw new Error('リクエストトークンが取れませんでした');

    msg('connectMsg', 'Tumblr の認可画面で「許可」を押してください…');
    const back = await chrome.identity.launchWebAuthFlow({
      url: `${AUTHORIZE_URL}?oauth_token=${encodeURIComponent(req.oauth_token)}`,
      interactive: true,
    });
    const q = new URL(back).searchParams;
    const verifier = q.get('oauth_verifier');
    if (!verifier) throw new Error('認可がキャンセルされました');

    msg('connectMsg', 'アクセストークンを取得中…');
    const acc = await oauthPost(ACCESS_TOKEN_URL, st, { oauth_verifier: verifier },
      req.oauth_token, req.oauth_token_secret);
    if (!acc.oauth_token || !acc.oauth_token_secret) throw new Error('アクセストークンが取れませんでした');

    const user = await userInfo(st, acc.oauth_token, acc.oauth_token_secret);
    const blogs = (user.blogs || []).map((b) => b.name).filter(Boolean);
    if (!blogs.length) throw new Error('ブログが見つかりませんでした');

    const n = await addAccounts(blogs.map((b) => ({ label: b, blog: b, token: acc.oauth_token, secret: acc.oauth_token_secret })));
    msg('connectMsg', `${user.name || ''} を連携しました（ブログ ${blogs.length}件、うち新規 ${n}件）。\n不要なブログは 3. で削除してください。`, 'ok');
    render();
  } catch (e) {
    let hint = '';
    if (/callback|401|400/i.test(String(e.message))) hint = '\nTumblr アプリのコールバックURLが上のURLと一致しているか確認してください。';
    msg('connectMsg', '失敗: ' + e.message + hint, 'err');
  } finally {
    $('connect').disabled = false;
  }
}

// 同じブログは上書き（トークン更新）、新しいものは末尾に追加。追加件数を返す
async function addAccounts(list) {
  const s = await Store.load();
  let added = 0;
  for (const a of list) {
    const ex = s.accounts.find((x) => x.blog === a.blog);
    if (ex) { ex.token = a.token; ex.secret = a.secret; }
    else { s.accounts.push({ id: a.blog, label: a.label || a.blog, blog: a.blog, token: a.token, secret: a.secret }); added++; }
  }
  await Store.save({ accounts: s.accounts });
  return added;
}

async function verify(a) {
  const st = await Store.load();
  const full = st.accounts.find((x) => x.id === a.id);
  msg('acctMsg', `${a.blog} を確認中…`);
  try {
    const user = await userInfo(st, full.token, full.secret);
    const blogs = (user.blogs || []).map((b) => b.name);
    const ok = blogs.includes(a.blog);
    msg('acctMsg', ok ? `${a.blog}: OK（${user.name}）` : `${a.blog}: トークンは有効ですが、このブログへの権限がありません（${blogs.join(', ')}）`, ok ? 'ok' : 'err');
  } catch (e) {
    msg('acctMsg', `${a.blog}: ${e.message}`, 'err');
  }
}

$('saveKeys').onclick = async () => {
  await Store.save({ consumerKey: $('ck').value.trim(), consumerSecret: $('cs').value.trim() });
  msg('keysMsg', '保存しました', 'ok');
};

$('connect').onclick = connect;

$('doImport').onclick = async () => {
  try {
    const data = JSON.parse($('importJson').value);
    const list = (Array.isArray(data) ? data : data.accounts || [])
      .filter((a) => a && a.blog && a.token && a.secret);
    if (!list.length) throw new Error('blog / token / secret を持つアカウントがありません');
    const n = await addAccounts(list);
    $('importJson').value = '';
    msg('importMsg', `${list.length}件を取り込みました（新規 ${n}件）。キーは X-Ray の TUMBLR_CONSUMER_KEY / SECRET と同じものを 1. に入れてください。`, 'ok');
    render();
  } catch (e) {
    msg('importMsg', '失敗: ' + e.message, 'err');
  }
};

$('saveSettings').onclick = async () => {
  const s = await Store.load();
  const n = Math.max(0, Math.min(10, parseInt($('th').value, 10) || 0));
  s.settings.draftThreshold = n;
  await Store.save({ settings: s.settings });
  $('th').value = n;
  msg('setMsg', '保存しました', 'ok');
};

render();
