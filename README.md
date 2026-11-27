# X/IG → Tumblr（Chrome拡張 / MV3）

X と Instagram のポストのアクションバーに **t** ボタンを追加し、X-Ray と同じ投稿フォームから Tumblr に直接投稿します（Tumblr API・OAuth1）。

- 画像は**選択式**（既定は全選択、タップで外す／戻す、バッジの数字＝添付順）
- **キャプションは元投稿へのリンク**になる（`<a href="元投稿URL">キャプション</a>`、`source_url` も付与）。空ならURL自体をリンク文字にする
- 投稿に成功すると、**アカウントごとに**キャプション（リンク抜き）とタグを保存し、次回そのアカウントのポストで自動入力。「既定に戻す」で破棄
- 3枚以上で自動的に下書き（設定で変更可・手で触ったら介入しない）／複数ブログ対応・最後に使った投稿先を記憶
- Instagram はカルーセルの全画像を Web API（ログイン中のクッキー）から取得。動画は除外
- X は原寸（`name=orig`）で送信。引用ポスト側の画像と動画サムネは対象外
- キー・トークンは拡張のストレージにだけ保存し、X/IG のページ側には渡さない

## インストール
1. zip を展開し、`chrome://extensions` → デベロッパーモード ON → 「パッケージ化されていない拡張機能を読み込む」で展開したフォルダを選ぶ
2. 拡張アイコンをクリック → 設定画面

## 連携（どちらか）
**A. X-Ray のトークンを流用（いちばん楽）**
1. 設定 1. に X-Ray の `TUMBLR_CONSUMER_KEY` / `TUMBLR_CONSUMER_SECRET` を入れて保存
2. 設定 2. の「X-Ray の tumblr_accounts.json から取り込む」に `data/tumblr_accounts.json` の中身を貼って取り込む

**B. 拡張から新しく認可**
1. https://www.tumblr.com/oauth/apps で（新しく）アプリを登録し、Default callback URL に
   `https://hcaocfpahcmcmblgfhnhjcmcblecpdcd.chromiumapp.org/` を設定
   （X-Ray のアプリのコールバックを書き換えると `tools/tumblr_auth.py` が使えなくなるので別アプリ推奨）
2. キーを保存 →「Tumblr と連携する」→ 許可。アカウント内の全ブログが追加されるので、不要なものは削除

拡張IDは manifest の `key` で固定しているので、別フォルダから読み込み直してもコールバックURLは変わりません。

## 構成
- `background.js` … OAuth1署名・画像取得・Tumblr投稿・プリセット保存（service worker）
- `content/modal.js` … 投稿フォーム（Shadow DOM。入力中のキーは X/IG のショートカットに渡さない）
- `content/x.js` / `content/ig.js` … ボタン挿入と画像の収集
- `options.html/js` … キー・連携・投稿先・自動下書き・保存済みプリセット
- `lib/oauth1.js` … HMAC-SHA1 署名（Twitter公式の署名例で検証済み）

## 注意
- X / Instagram の DOM 変更でボタンが出なくなる可能性あり（セレクタは `content/x.js` / `content/ig.js` 冒頭付近）
- 初回は**下書きで**試してください（モックでの検証のみで、本物の API にはまだ投げていません）
