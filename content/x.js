// X（x.com / twitter.com）：画像付きポストのアクションバーに t ボタンを足す
(function () {
  'use strict';

  // 本体ポストの時刻リンクから /<user>/status/<id> を取る（引用元の時刻は除外）
  function statusOf(article) {
    for (const t of article.querySelectorAll('a[href*="/status/"] time')) {
      const a = t.closest('a');
      if (!a || a.closest('div[role="link"]')) continue;
      const m = a.getAttribute('href').match(/^\/([A-Za-z0-9_]{1,15})\/status\/(\d+)/);
      if (m) return { user: m[1], id: m[2] };
    }
    // 詳細ページの本体ポストは時刻リンクが無い場合があるのでURLから
    const m = location.pathname.match(/^\/([A-Za-z0-9_]{1,15})\/status\/(\d+)/);
    if (m && article.matches('article[tabindex="-1"]')) return { user: m[1], id: m[2] };
    return null;
  }

  // 本体ポストの写真だけを並び順どおりに集める（引用ポスト・動画サムネは除外）
  function photosOf(article, st) {
    const out = [];
    const seen = new Set();
    const push = (img) => {
      const src = img.getAttribute('src') || '';
      if (!/^https:\/\/pbs\.twimg\.com\/media\//.test(src)) return;
      const key = src.split('?')[0];
      if (seen.has(key)) return;
      seen.add(key);
      out.push({ thumb: src, full: src });
    };
    if (st) {
      const links = [...article.querySelectorAll(`a[href*="/status/${st.id}/photo/"]`)]
        .filter((a) => !a.closest('div[role="link"]'))
        .map((a) => ({ a, n: Number((a.getAttribute('href').match(/\/photo\/(\d+)/) || [])[1] || 0) }))
        .sort((p, q) => p.n - q.n);
      links.forEach(({ a }) => a.querySelectorAll('img').forEach(push));
    }
    if (!out.length) {
      article.querySelectorAll('[data-testid="tweetPhoto"] img').forEach((img) => {
        if (!img.closest('div[role="link"]') && !img.closest('[data-testid="videoPlayer"]')) push(img);
      });
    }
    return out;
  }

  function actionBar(article) {
    const groups = [...article.querySelectorAll('div[role="group"]')]
      .filter((g) => g.querySelector('[data-testid="reply"], [data-testid="like"], [data-testid="unlike"]'));
    return groups[groups.length - 1] || null;
  }

  function scan() {
    document.querySelectorAll('article[data-testid="tweet"]').forEach((article) => {
      const st = statusOf(article);
      const bar = actionBar(article);
      if (!bar) return;
      let slot = bar.querySelector(':scope > .tmb-t-slot');
      const has = st && photosOf(article, st).length > 0;
      if (!has) { if (slot) slot.remove(); return; }
      if (slot && slot.dataset.id === st.id) return;
      if (slot) slot.remove();   // 要素が別ポストに使い回された

      slot = document.createElement('div');
      slot.className = 'tmb-t-slot';
      slot.dataset.id = st.id;
      slot.appendChild(TmbModal.makeButton(() => openFor(article)));
      bar.appendChild(slot);
    });
  }

  function openFor(article) {
    const st = statusOf(article);
    if (!st) return;
    const sourceUrl = `https://x.com/${st.user}/status/${st.id}`;
    const images = photosOf(article, st);   // 押した時点のDOMから取り直す
    TmbModal.open(
      { key: 'x:' + st.user.toLowerCase(), handle: st.user, sourceUrl, site: 'x' },
      () => images,
    );
  }

  let timer = 0;
  const mo = new MutationObserver(() => {
    if (timer) return;
    timer = setTimeout(() => { timer = 0; scan(); }, 300);
  });
  mo.observe(document.documentElement, { childList: true, subtree: true });
  scan();

  window.__tmbX = { statusOf, photosOf, actionBar, scan };
})();
