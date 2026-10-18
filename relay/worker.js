// 同期用の中継サーバー(Cloudflare Workers + D1)の入口。中身は handler.js。
// ※ 実際の Cloudflare 上では、まだ動作確認していない(handler.js は、SQLite で作った D1 の代わりを使って、テスト済み)。
import { handleRequest } from './handler.js';

export default { fetch: handleRequest };
