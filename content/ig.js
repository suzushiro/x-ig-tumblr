// Instagram：投稿のアクション行（いいね／コメント／シェア）に t ボタンを足す。
// カルーセルは表示中の数枚しかDOMに無いので、画像は Instagram の Web API
// （ログイン中のブラウザのクッキーで同一オリジン呼び出し）から全枚数ぶん取る。
(function () {
  'use strict';

  const IG_APP_ID = '936619743392459';
  const LIKE = ['いいね！', 'Like', '「いいね！」を取り消す', 'Unlike'];
  const COMMENT = ['コメント', 'Comment'];
  const SHARE = ['シェア', 'Share', '再投稿', 'リポスト', 'Repost', '投稿をシェア', 'Share Post', 'Share post'];
  // 保存（ブックマーク）。保存済みだとラベルが「削除」/ Remove に変わる
  const SAVE = ['保存', 'Save', '削除', 'Remove', '保存済み', 'Saved', '保存する', 'コレクションに保存'];

  function bigIcons(scope, labels) {
    const q = labels ? labels.map((l) => `svg[aria-label="${l}"]`).join(',') : 'svg';
    // コメント欄の小さいハートを除外（投稿のアイコンは24px）
    return [...scope.querySelectorAll(q)].filter((s) => Number(s.getAttribute('height') || 24) >= 20);
  }

  function commonAncestor(a, b) {
    for (let n = a; n; n = n.parentElement) if (n.contains(b)) return n;
    return null;
  }

  // shortcode → media id（Instagram の base64 変種）
  const ALPHA = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  function shortcodeToId(code) {
    let id = 0n;
    for (const c of code.slice(0, 11)) {
      const v = ALPHA.indexOf(c);
      if (v < 0) throw new Error('shortcodeが不正です: ' + code);
      id = id * 64n + BigInt(v);
    }
    return id.toString();
  }

  const CODE_RE = /\/(?:p|reel|tv)\/([A-Za-z0-9_-]{5,})/;

  // 行から投稿の shortcode を特定する
  function shortcodeFor(row) {
    const art = row.closest('article');
    if (art) {
      const links = [...art.querySelectorAll('a[href*="/p/"], a[href*="/reel/"]')];
      const withTime = links.find((a) => a.querySelector('time'));
      const a = withTime || links[0];
      const m = a && a.getAttribute('href').match(CODE_RE);
      if (m) return m[1];
    }
    // 投稿ページ（/p/xxx/）やモーダル表示はURLから
    const m = location.pathname.match(CODE_RE);
    if (m && (row.closest('[role="dialog"]') || row.closest('main'))) return m[1];
    return null;
  }

  function containerFor(row) {
    return row.closest('article') || row.closest('[role="dialog"]') || row.closest('main') || document.body;
  }

  function pickImage(cands) {
    const list = (cands || []).filter((c) => c && c.url)
      .sort((a, b) => (b.width || 0) - (a.width || 0));
    if (!list.length) return null;
    const full = list[0].url;
    const small = list.filter((c) => (c.width || 0) >= 240).pop() || list[list.length - 1];
    return { full, thumb: small.url };
  }

  async function fetchMedia(code) {
    const id = shortcodeToId(code);
    const r = await fetch(`/api/v1/media/${id}/info/`, {
      credentials: 'include',
      headers: { 'X-IG-App-ID': IG_APP_ID, 'X-Requested-With': 'XMLHttpRequest' },
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const data = await r.json();
    const item = data && data.items && data.items[0];
    if (!item) throw new Error('投稿情報が空です');
    const nodes = item.carousel_media && item.carousel_media.length ? item.carousel_media : [item];
    // 動画（media_type 2）は投稿できないので画像だけ
    const images = nodes.filter((n) => n.media_type !== 2)
      .map((n) => pickImage(n.image_versions2 && n.image_versions2.candidates)).filter(Boolean);
    return { username: item.user && item.user.username, images };
  }

  // API が使えないときの保険：DOM に今ある画像（表示中の枚数ぶんだけ）
  function domFallback(row) {
    const box = containerFor(row);
    const seen = new Set();
    const images = [];
    box.querySelectorAll('img').forEach((img) => {
      const alt = img.getAttribute('alt') || '';
      if (/プロフィール写真|profile picture/i.test(alt)) return;
      if (img.closest('header')) return;
      const w = img.naturalWidth || img.width;
      if (w && w < 200) return;
      let full = img.currentSrc || img.src;
      const ss = img.getAttribute('srcset');
      if (ss) {
        const best = ss.split(',').map((p) => p.trim().split(/\s+/))
          .map(([u, w2]) => ({ u, w: parseInt(w2, 10) || 0 })).sort((a, b) => b.w - a.w)[0];
        if (best) full = best.u;
      }
      if (!full || seen.has(full)) return;
      seen.add(full);
      images.push({ thumb: img.currentSrc || img.src, full });
    });
    let username = '';
    const a = [...box.querySelectorAll('a[href]')].find((x) => /^\/[A-Za-z0-9._]+\/$/.test(x.getAttribute('href')));
    if (a) username = a.getAttribute('href').replace(/\//g, '');
    return { username, images };
  }

  // いいねアイコンから上に辿り、保存アイコンを含む最小の要素をその投稿の操作エリアとみなす。
  // 大きいいいねアイコンを2つ以上含んだら別の投稿まで広がったので打ち切る。
  function findRows() {
    const out = [];
    for (const like of bigIcons(document, LIKE)) {
      let scope = null, save = null, fallback = null;
      let n = like.parentElement;
      for (let depth = 0; n && depth < 25; depth++, n = n.parentElement) {
        if (bigIcons(n, LIKE).length > 1) break;
        if (!fallback) {
          const sh = bigIcons(n, SHARE)[0] || bigIcons(n, COMMENT)[0];
          if (sh) fallback = { row: n, share: sh };
        }
        save = bigIcons(n, SAVE)[0] || null;
        if (save) { scope = n; break; }
      }
      if (!scope && fallback) {
        // ラベルで見つからないときは構造で探す：いいね〜シェアの行の親（section）にある、
        // 行の外の24pxアイコンのうち最後のもの＝右端の保存ボタン
        const parent = fallback.row.parentElement;
        const outside = parent ? bigIcons(parent, null).filter((x) => !fallback.row.contains(x)) : [];
        if (outside.length && bigIcons(parent, LIKE).length === 1) {
          scope = parent;
          save = outside[outside.length - 1];
        }
      }
      if (scope) out.push({ scope, like, save });
      else if (fallback) out.push({ scope: fallback.row, like, share: fallback.share });
    }
    return out;
  }

  // 保存ボタンの左に置く。保存ボタンを包む「子が1つだけの入れ子」の一番外側を
  // 横並びにして先頭に差し込む（行全体は space-between なので外に置くと中央に浮く）
  function placeBeforeSave(save, slot) {
    let btn = save.closest('[role="button"], button') || save;
    let wrap = btn;
    while (wrap.parentElement && wrap.parentElement.children.length === 1) wrap = wrap.parentElement;
    wrap.style.display = 'flex';
    wrap.style.alignItems = 'center';
    wrap.insertBefore(slot, wrap.firstChild);
    slot.classList.add('before-save');
  }

  function placeAfterShare(like, share, slot) {
    const group = commonAncestor(like, share);
    if (!group) return false;
    let child = share;
    while (child.parentElement && child.parentElement !== group) child = child.parentElement;
    child.after(slot);
    return true;
  }

  function scan() {
    for (const { scope, like, save, share } of findRows()) {
      if (scope.querySelector('.tmb-t-slot')) continue;
      const code = shortcodeFor(scope);
      if (!code) continue;

      const slot = document.createElement('div');
      slot.className = 'tmb-t-slot ig';
      slot.appendChild(TmbModal.makeButton(() => openFor(slot)));
      if (save) placeBeforeSave(save, slot);
      else if (!placeAfterShare(like, share, slot)) continue;   // 保存が見つからなければシェアの右
    }
  }

  function openFor(slot) {
    const code = shortcodeFor(slot);
    if (!code) { TmbModal.toast(['投稿を特定できませんでした'], 3000); return; }
    const sourceUrl = `https://www.instagram.com/p/${code}/`;
    // 投稿者名は API の応答で確定するので、ここでは仮の値で開く
    const guess = domFallback(slot).username;
    let resolved = null;
    TmbModal.toast(['投稿を読み込み中…'], 1500);
    const load = async () => {
      try {
        resolved = await fetchMedia(code);
      } catch (e) {
        resolved = domFallback(slot);
        if (!resolved.images.length) throw e;
      }
      return resolved.images;
    };
    const user = () => (resolved && resolved.username) || guess || '';
    // キー（ig:ユーザー名）は API で確定してから決めたいので、先に取ってから開く
    load().then(
      () => TmbModal.open({ key: 'ig:' + user().toLowerCase(), handle: user(), sourceUrl, site: 'ig' },
        () => resolved.images),
      (e) => TmbModal.open({ key: guess ? 'ig:' + guess.toLowerCase() : '', handle: guess, sourceUrl, site: 'ig' },
        () => Promise.reject(e)),
    );
  }

  let timer = 0;
  const mo = new MutationObserver(() => {
    if (timer) return;
    timer = setTimeout(() => { timer = 0; scan(); }, 400);
  });
  mo.observe(document.documentElement, { childList: true, subtree: true });
  scan();

  window.__tmbIg = { shortcodeToId, pickImage, findRows, shortcodeFor, scan };
})();
