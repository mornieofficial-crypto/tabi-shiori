// 同期用の中継サーバーの「お手本」実装(メモリ上・テストと手元での動作確認用)。
// 本番は worker.js(Cloudflare)を使う。プロトコルは同じ:
//   GET  /v1/room/:room            → 200 { rev, data }   (まだ無ければ rev=0, data=null)
//   PUT  /v1/room/:room  X-Token   → 200 { rev }  / 409 { rev, data }(他の端末が先に更新) / 403(合言葉が違う)
// 中身(data)は端末で暗号化済みの文字列。サーバーは読めない。
import http from 'node:http';
import { createHash } from 'node:crypto';

const MAX_BODY = 2 * 1024 * 1024;

export function createRelay() {
  const rooms = new Map();
  const server = http.createServer(async (req, res) => {
    const send = (code, obj) => {
      res.writeHead(code, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type, X-Token', 'Access-Control-Allow-Methods': 'GET, PUT, OPTIONS' });
      res.end(JSON.stringify(obj));
    };
    if (req.method === 'OPTIONS') return send(204, {});
    const m = /^\/v1\/room\/([0-9a-f]{32})$/.exec(new URL(req.url, 'http://x').pathname);
    if (!m) return send(404, { error: 'not found' });
    const room = rooms.get(m[1]) || { rev: 0, data: null, tokenHash: null };
    if (req.method === 'GET') return send(200, { rev: room.rev, data: room.data });
    if (req.method !== 'PUT') return send(405, { error: 'method' });
    let raw = '';
    for await (const chunk of req) {
      raw += chunk;
      if (raw.length > MAX_BODY) return send(413, { error: 'too large' });
    }
    let body;
    try { body = JSON.parse(raw); } catch { return send(400, { error: 'json' }); }
    if (typeof body.data !== 'string' || !Number.isInteger(body.rev)) return send(400, { error: 'shape' });
    const hash = createHash('sha256').update(String(req.headers['x-token'] || '')).digest('hex');
    if (room.tokenHash && room.tokenHash !== hash) return send(403, { error: 'forbidden' });
    if (body.rev !== room.rev) return send(409, { rev: room.rev, data: room.data });
    room.rev += 1;
    room.data = body.data;
    room.tokenHash = hash;
    rooms.set(m[1], room);
    return send(200, { rev: room.rev });
  });
  return { server, rooms };
}

// `node relay/node-relay.mjs` で手元に起動できる(ポート 8787)
if (import.meta.url === `file://${process.argv[1].replace(/\\/g, '/')}` || process.argv[1]?.endsWith('node-relay.mjs')) {
  const { server } = createRelay();
  server.listen(Number(process.env.PORT) || 8787, '127.0.0.1', () => console.log('relay: http://127.0.0.1:' + server.address().port));
}
