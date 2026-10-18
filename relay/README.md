# 同期用の中継サーバー(Cloudflare Workers + D1)

2人の端末のあいだで、**暗号化された旅行データ**を受け渡すだけの小さなサーバーです。
サーバーは内容を読めません(鍵は共有リンクの `#` 以降にだけあり、サーバーへは送られません)。

- `handler.js` … 本体(プロトコルの処理)。`worker.js` は入口だけ。
- `migrations/0001_init.sql` … D1 のテーブル(部屋ごとに、版・暗号文・合言葉のハッシュ)。
- `node-relay.mjs` … お手本(メモリ上)。手元の動作確認用。
- プロトコル:`GET/PUT /v1/room/<32桁の16進数>`、書き込みには `X-Token`、版(`rev`)が古いと 409。
- 半年以上、更新のない部屋は、ときどき自動で削除されます。
- テスト:`node --test tests/relay.test.mjs`(D1 の代わりに SQLite を使う。**実際の Cloudflare 上では未確認**)。

## 公開する手順(あなたの操作が必要)

「おかいものメモ」と同じ Cloudflare アカウント(`mornie.official` のアカウント)に置きます。`relay` フォルダで実行します。

```bash
cd relay
npx wrangler login
npx wrangler d1 create tabi-shiori-relay-db
```

1. 表示された `database_id` を、`wrangler.toml` の `REPLACE_WITH_D1_DATABASE_ID` に貼る。
2. テーブルを作って、公開する。

```bash
npx wrangler d1 migrations apply tabi-shiori-relay-db --remote
npx wrangler deploy
```

3. 表示された `https://tabi-shiori-relay.<アカウントの名前>.workers.dev` を、アプリの「アプリの設定 → 同期サーバー」に入れる。

`wrangler.toml` の `ALLOWED_ORIGIN` は、公開サイトのURLに合わせてあります。変えたときは直してください。

## 守られること・守られないこと

- 守られる:サーバーが漏れても、旅行の中身は読めない。
- 守られない:リンクを他人に転送されると、その人も読み書きできる。サーバーには、更新の時刻や内容の大きさは見える。
- 部屋の名前を知らない人は、部屋を見つけられない(鍵から作った推測できない値)。
