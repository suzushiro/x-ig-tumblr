// Tumblr 投稿モーダル（X / Instagram 共通）。X-Ray の tmb モーダルを移植。
// ページ側のCSSと衝突しないよう Shadow DOM の中に作る。
(function () {
  'use strict';
  if (window.TmbModal) return;

  const CSS = `
:host { all: initial; }
* { box-sizing: border-box; }
.wrap {
  position: fixed; inset: 0; background: rgba(0,0,0,.6);
  display: none; align-items: center; justify-content: center;
  z-index: 2147483000; padding: 16px;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Hiragino Sans", "Noto Sans JP", Meiryo, sans-serif;
  --bg: #15202b; --border: #38444d; --text: #e7e9ea; --dim: #8b98a5;
  --input: #1c2732; --surface: #1a2530; --accent: #1d9bf0; --tumblr: #00b8ff;
}
.wrap.open { display: flex; }
.card {
  background: var(--bg); border: 1px solid var(--border); border-radius: 16px; color: var(--text);
  width: 100%; max-width: 460px; max-height: calc(100vh - 32px); overflow: auto;
  box-shadow: 0 12px 40px rgba(0,0,0,.5); font-size: 14px;
}
.head { padding: 14px 18px; border-bottom: 1px solid var(--border);
  display: flex; align-items: center; gap: 10px; font-weight: 600; }
.x { margin-left: auto; color: var(--dim); font-size: 20px; cursor: pointer; line-height: 1; }
.body { padding: 16px 18px; display: flex; flex-direction: column; gap: 12px; }
.label { color: var(--dim); font-size: 12px; margin-bottom: 6px; }
.fhead { display: flex; align-items: baseline; gap: 8px; margin-bottom: 6px; }
.fhead .label { margin-bottom: 0; }
.lnk { margin-left: auto; font-size: 12px; color: var(--accent); text-decoration: none; cursor: pointer; }
.lnk:hover { text-decoration: underline; }
.imgs { display: flex; gap: 6px; overflow-x: auto; padding-bottom: 6px; min-height: 90px; align-items: center; }
.imgs .loading { color: var(--dim); font-size: 12px; }
.cell { position: relative; flex: none; cursor: pointer; }
.cell img { height: 84px; max-width: 160px; border-radius: 6px; object-fit: cover; display: block;
  border: 2px solid transparent; opacity: .4; transition: opacity .1s, border-color .1s; }
.cell:hover img { opacity: .75; }
.cell.selected img { opacity: 1; border-color: var(--accent); }
.badge { position: absolute; top: 4px; left: 4px; width: 18px; height: 18px; border-radius: 50%;
  background: var(--accent); color: #fff; font-size: 11px; font-weight: 700;
  display: none; align-items: center; justify-content: center; }
.cell.selected .badge { display: flex; }
textarea, input[type=text], select {
  width: 100%; background: var(--input); border: 1px solid var(--border); border-radius: 8px;
  color: var(--text); padding: 8px 10px; font-size: 13px; font-family: inherit; }
textarea { resize: vertical; }
textarea:focus, input[type=text]:focus, select:focus { outline: none; border-color: var(--accent); }
.check { display: flex; align-items: center; gap: 6px; font-size: 12px; color: var(--dim);
  cursor: pointer; user-select: none; }
.check input { cursor: pointer; margin: 0; }
.note { background: var(--surface); border: 1px solid var(--border); border-radius: 8px;
  padding: 8px 10px; font-size: 11px; color: var(--dim); word-break: break-all; }
.note.warn { background: #3a2a12; border-color: #6b4b16; color: #ffd08a; }
.msg { font-size: 12px; min-height: 1em; color: var(--dim); }
.msg.err { color: #f4212e; }
.msg.ok { color: #00ba7c; }
.msg a, .note a { color: var(--accent); }
.foot { padding: 14px 18px; border-top: 1px solid var(--border); display: flex; gap: 10px; }
button { font-family: inherit; }
.cancel { flex: 1; padding: 10px; border-radius: 999px; border: 1px solid var(--border);
  background: transparent; color: var(--text); font-size: 14px; cursor: pointer; }
.go { flex: 2; padding: 10px; border-radius: 999px; border: none; background: var(--tumblr);
  color: #0a1620; font-weight: 700; font-size: 14px; cursor: pointer; }
.go:disabled { opacity: .5; cursor: default; }
.toast { position: fixed; left: 50%; bottom: 24px; transform: translateX(-50%);
  background: #0f1419; color: #e7e9ea; border: 1px solid #38444d; border-radius: 999px;
  padding: 10px 18px; font-size: 13px; z-index: 2147483001; display: none;
  font-family: inherit; box-shadow: 0 6px 24px rgba(0,0,0,.4); }
.toast a { color: #1d9bf0; margin-left: 8px; }
`;

  const HTML = `
<div class="wrap" id="wrap">
  <div class="card" role="dialog" aria-label="Tumblrに投稿">
    <div class="head"><span>📷 Tumblr に投稿</span><span class="x" id="x" title="閉じる">×</span></div>
    <div class="body">
      <div>
        <div class="fhead"><span class="label" id="imgcount">画像</span>
          <a class="lnk" id="selall">全解除</a></div>
        <div class="imgs" id="imgs"></div>
      </div>
      <div>
        <div class="fhead"><span class="label">キャプション（元投稿へのリンクになります）</span>
          <a class="lnk" id="reset" style="display:none">既定に戻す</a></div>
        <textarea id="caption" rows="2"></textarea>
      </div>
      <div>
        <div class="label">タグ（カンマ区切り）</div>
        <input type="text" id="tags">
      </div>
      <div id="acctbox">
        <div class="label">投稿先</div>
        <select id="account"></select>
      </div>
      <label class="check"><input type="checkbox" id="draft"><span>下書きとして投稿する（公開しない）</span></label>
      <div class="note warn" id="autodraft" style="display:none"></div>
      <div class="note" id="src"></div>
      <div class="msg" id="msg"></div>
    </div>
    <div class="foot">
      <button class="cancel" id="cancel">キャンセル</button>
      <button class="go" id="go">投稿する</button>
    </div>
  </div>
</div>
<div class="toast" id="toast"></div>`;

  let host, root, $;
  let ctx = null;          // { key, handle, sourceUrl, site, images:[{thumb, full}] }
  let sel = [];            // 添付する画像の添字（選んだ順）
  let draftTouched = false;
  let threshold = 3;
  let busy = false;
  let openSeq = 0;

  function send(msg) {
    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage(msg, (res) => {
          if (chrome.runtime.lastError) {
            resolve({ ok: false, error: '拡張機能と通信できません。ページを再読み込みしてください' });
          } else resolve(res || { ok: false, error: '応答がありません' });
        });
      } catch (e) {
        resolve({ ok: false, error: '拡張機能が更新されました。ページを再読み込みしてください' });
      }
    });
  }

  function ensure() {
    if (host && host.isConnected) return;
    host = document.createElement('tmb-poster-root');
    root = host.attachShadow({ mode: 'open' });
    root.innerHTML = `<style>${CSS}</style>${HTML}`;
    $ = (id) => root.getElementById(id);
    document.documentElement.appendChild(host);

    // 入力中のキーが X / IG のショートカット（j/k/l など）に拾われないよう止める
    for (const t of ['keydown', 'keyup', 'keypress']) {
      host.addEventListener(t, (ev) => {
        if (t === 'keydown' && ev.key === 'Escape' && !busy) close();
        if (t === 'keydown' && ev.key === 'Enter' && (ev.ctrlKey || ev.metaKey)) post();
        ev.stopPropagation();
      });
    }
    // フォーカスがモーダル外（ページ本体）にあっても Esc で閉じる
    document.addEventListener('keydown', (ev) => {
      if (ev.key === 'Escape' && $('wrap').classList.contains('open') && !busy) {
        ev.stopPropagation();
        close();
      }
    }, true);
    $('wrap').addEventListener('click', (ev) => { if (ev.target === $('wrap') && !busy) close(); });
    $('x').onclick = () => { if (!busy) close(); };
    $('cancel').onclick = () => { if (!busy) close(); };
    $('selall').onclick = toggleAll;
    $('reset').onclick = resetPreset;
    $('draft').onchange = () => { draftTouched = true; applyAutoDraft(); updateGo(); };
    $('go').onclick = post;
  }

  function close() {
    if ($) $('wrap').classList.remove('open');
    ctx = null;
    openSeq++;
  }

  function setMsg(text, cls) {
    const m = $('msg');
    m.className = 'msg' + (cls ? ' ' + cls : '');
    m.textContent = text || '';
  }

  /**
   * モーダルを開く。
   * base: { key, handle, sourceUrl, site: 'x'|'ig' }
   * loadImages: () => Promise<[{thumb, full}]>（IG のように後から取るもの向け）
   */
  async function open(base, loadImages) {
    ensure();
    const seq = ++openSeq;
    ctx = { ...base, images: [] };
    sel = [];
    draftTouched = false;
    busy = false;
    $('go').textContent = '投稿する';
    setMsg('');
    $('draft').checked = false;
    $('autodraft').style.display = 'none';
    $('imgs').innerHTML = '<span class="loading">画像を読み込み中…</span>';
    $('src').textContent = '';
    const a = document.createElement('a');
    a.href = base.sourceUrl; a.target = '_blank'; a.rel = 'noopener'; a.textContent = base.sourceUrl;
    $('src').append(`出典（${base.site === 'ig' ? 'Instagram' : 'X'}）: `, a);
    $('caption').value = base.handle || '';
    $('tags').value = '';
    $('reset').style.display = 'none';
    $('wrap').classList.add('open');
    updateGo();

    const [cres, images] = await Promise.all([
      send({ type: 'context', key: base.key }),
      Promise.resolve().then(loadImages).catch((e) => ({ error: String(e && e.message || e) })),
    ]);
    if (seq !== openSeq) return;   // 待っている間に閉じられた／別の投稿を開いた

    if (!cres.ok) { setMsg(cres.error, 'err'); return; }
    threshold = Number(cres.settings && cres.settings.draftThreshold);
    if (!Number.isFinite(threshold)) threshold = 3;

    // 投稿先
    const s = $('account');
    s.innerHTML = '';
    cres.accounts.forEach((acc) => {
      const o = document.createElement('option');
      o.value = acc.id; o.textContent = `${acc.label}（${acc.blog}）`;
      s.appendChild(o);
    });
    if (cres.settings.lastAccount && cres.accounts.some((x) => x.id === cres.settings.lastAccount)) {
      s.value = cres.settings.lastAccount;
    }
    $('acctbox').style.display = cres.accounts.length > 1 ? '' : 'none';

    // 覚えてあるキャプション／タグ（このアカウントで前回投稿した内容）
    if (cres.preset) {
      $('caption').value = cres.preset.caption || '';
      $('tags').value = cres.preset.tags || '';
      $('reset').style.display = '';
    }

    if (!cres.configured) {
      setMsg('', '');
      const m = $('msg');
      m.className = 'msg err';
      m.append('Tumblr連携が未設定です。');
      const l = document.createElement('a');
      l.href = '#'; l.textContent = '設定を開く';
      l.onclick = (ev) => { ev.preventDefault(); send({ type: 'openOptions' }); };
      m.append(l);
    }

    if (images && images.error) {
      $('imgs').innerHTML = '';
      setMsg('画像を取得できませんでした: ' + images.error, 'err');
      updateGo();
      return;
    }
    ctx.images = images || [];
    renderImages();
    ctx.configured = cres.configured;
    updateGo();
    $('caption').focus();
  }

  function renderImages() {
    const box = $('imgs');
    box.innerHTML = '';
    if (!ctx.images.length) {
      box.innerHTML = '<span class="loading">この投稿には投稿できる画像がありません</span>';
    }
    ctx.images.forEach((im, i) => {
      const cell = document.createElement('div');
      cell.className = 'cell';
      const img = document.createElement('img');
      img.src = im.thumb || im.full;
      img.referrerPolicy = 'no-referrer';
      const badge = document.createElement('span');
      badge.className = 'badge';
      cell.append(img, badge);
      cell.onclick = () => toggleOne(i);
      box.appendChild(cell);
    });
    sel = ctx.images.map((_, i) => i);   // 既定は全選択
    renderSelection();
  }

  function toggleOne(i) {
    const at = sel.indexOf(i);
    if (at >= 0) sel.splice(at, 1); else sel.push(i);   // 選んだ順を保つ
    renderSelection();
  }

  function toggleAll(ev) {
    if (ev) ev.preventDefault();
    const total = ctx ? ctx.images.length : 0;
    sel = sel.length === total ? [] : Array.from({ length: total }, (_, i) => i);
    renderSelection();
  }

  function renderSelection() {
    const cells = [...root.querySelectorAll('.cell')];
    const total = cells.length;
    cells.forEach((c, i) => {
      const at = sel.indexOf(i);
      c.classList.toggle('selected', at >= 0);
      c.querySelector('.badge').textContent = at >= 0 ? String(at + 1) : '';
    });
    $('imgcount').textContent = total > 1 ? `画像（${total}枚中 ${sel.length}枚を選択）` : `画像（${total}枚）`;
    $('selall').style.display = total > 1 ? '' : 'none';
    $('selall').textContent = sel.length === total ? '全解除' : '全選択';
    applyAutoDraft();
    updateGo();
  }

  // 一定枚数以上で自動的に下書き。手で触ったあとは介入しない（X-Ray と同じ）
  function applyAutoDraft() {
    const note = $('autodraft');
    if (threshold <= 0 || draftTouched) { note.style.display = 'none'; return; }
    const hit = sel.length >= threshold;
    $('draft').checked = hit;
    note.style.display = hit ? '' : 'none';
    note.textContent = `${threshold}枚以上を選んだので下書きにしました。チェックを外せば公開で投稿できます。`;
  }

  function updateGo() {
    const go = $('go');
    if (!busy) go.textContent = $('draft').checked ? '下書きに保存' : '投稿する';
    go.disabled = busy || !ctx || !ctx.configured || sel.length === 0;
  }

  async function resetPreset(ev) {
    if (ev) ev.preventDefault();
    if (!ctx) return;
    $('caption').value = ctx.handle || '';
    $('tags').value = '';
    $('reset').style.display = 'none';
    await send({ type: 'resetPreset', key: ctx.key });
  }

  function toast(nodes, ms) {
    ensure();
    const t = $('toast');
    t.textContent = '';
    t.append(...nodes);
    t.style.display = 'block';
    clearTimeout(toast._t);
    toast._t = setTimeout(() => { t.style.display = 'none'; }, ms || 5000);
  }

  async function post() {
    if (!ctx || busy || $('go').disabled) return;
    busy = true;
    const mine = ctx;
    updateGo();
    $('go').textContent = '投稿中…';
    setMsg(`画像${sel.length}枚を送信中…`);

    const res = await send({
      type: 'post',
      key: mine.key,
      sourceUrl: mine.sourceUrl,
      images: sel.map((i) => mine.images[i].full),
      caption: $('caption').value,
      tags: $('tags').value,
      accountId: $('account').value,
      state: $('draft').checked ? 'draft' : 'published',
    });
    busy = false;
    if (ctx !== mine) return;
    if (!res.ok) {
      setMsg('失敗: ' + (res.error || '不明なエラー'), 'err');
      updateGo();
      return;
    }
    const stateLabel = { published: '公開', draft: '下書き', private: '非公開', queue: 'キュー' }[res.state] || res.state;
    const nodes = [`Tumblrに投稿しました（${res.label} / ${stateLabel} / ${res.count}枚）`];
    if (res.postUrl) {
      const a = document.createElement('a');
      a.href = res.postUrl; a.target = '_blank'; a.rel = 'noopener'; a.textContent = '開く';
      nodes.push(a);
    }
    close();
    toast(nodes, 6000);
  }

  // ボタンの見た目（X-Ray の t ボタン）。ページ側に置くので Shadow DOM の外。
  const BTN_CSS = `
.tmb-t-btn { width: 26px; height: 26px; border-radius: 6px; border: 1px solid rgba(139,152,165,.5);
  background: transparent; color: rgb(113,118,123); cursor: pointer; padding: 0;
  font: 700 15px/1 Georgia, "Times New Roman", serif; display: inline-flex;
  align-items: center; justify-content: center; flex: none; align-self: center; }
.tmb-t-btn:hover { background: #00b8ff; border-color: #00b8ff; color: #0a1620; }
.tmb-t-slot { display: flex; align-items: center; justify-content: center; }
.tmb-t-slot.ig { margin: 0 4px; }
.tmb-t-slot.ig.before-save { margin: 0 10px 0 0; }
`;
  function injectButtonCss() {
    if (document.getElementById('tmb-t-btn-css')) return;
    const st = document.createElement('style');
    st.id = 'tmb-t-btn-css';
    st.textContent = BTN_CSS;
    (document.head || document.documentElement).appendChild(st);
  }

  function makeButton(onClick) {
    injectButtonCss();
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'tmb-t-btn';
    b.textContent = 't';
    b.title = 'Tumblrに投稿';
    b.setAttribute('aria-label', 'Tumblrに投稿');
    b.addEventListener('click', (ev) => {
      ev.preventDefault();
      ev.stopPropagation();   // ツイート詳細への遷移を止める
      onClick(ev);
    });
    return b;
  }

  window.TmbModal = { open, close, makeButton, toast, _state: () => ({ ctx, sel, draftTouched }) };
})();
