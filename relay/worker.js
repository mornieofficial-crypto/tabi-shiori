// 同期用の中継サーバー(Cloudflare Workers + Durable Objects)。
// ※ お手本の node-relay.mjs と同じプロトコル。この Worker 自体は、実際の Cloudflare 上ではまだ動作確認していない。
// サーバーが持つのは「部屋の名前(鍵から作った乱数)」「書き込み用合言葉のハッシュ」「暗号化された内容」だけで、中身は読めない。

const MAX_BODY = 2 * 1024 * 1024;
const ROOM_PATH = /^\/v1\/room\/([0-9a-f]{32})$/;

const sha256hex = async (s) =>
  [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)))].map((b) => b.toString(16).padStart(2, '0')).join('');

function cors(env) {
  return {
    'Access-Control-Allow-Origin': env.ALLOWED_ORIGIN || '*',
    'Access-Control-Allow-Headers': 'Content-Type, X-Token',
    'Access-Control-Allow-Methods': 'GET, PUT, OPTIONS',
    'Access-Control-Max-Age': '86400',
    'Cache-Control': 'no-store',
  };
}

const json = (obj, status, env) =>
  new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json', ...cors(env) } });

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(env) });
    const m = ROOM_PATH.exec(new URL(request.url).pathname);
    if (!m) return json({ error: 'not found' }, 404, env);
    if (!['GET', 'PUT'].includes(request.method)) return json({ error: 'method' }, 405, env);
    if (Number(request.headers.get('Content-Length') || 0) > MAX_BODY) return json({ error: 'too large' }, 413, env);
    const stub = env.ROOM.get(env.ROOM.idFromName(m[1]));
    const res = await stub.fetch(request);
    // Durable Object の応答に CORS を付けて返す
    return new Response(res.body, { status: res.status, headers: { 'Content-Type': 'application/json', ...cors(env) } });
  },
};

// 1つの部屋 = 1つの Durable Object(同時に1つずつ処理されるので、版の確認が安全に行える)
export class Room {
  constructor(state) {
    this.storage = state.storage;
  }

  async fetch(request) {
    const reply = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } });
    if (request.method === 'GET') {
      const rev = (await this.storage.get('rev')) ?? 0;
      return reply({ rev, data: (await this.storage.get('data')) ?? null });
    }
    let body;
    try {
      body = await request.json();
    } catch {
      return reply({ error: 'json' }, 400);
    }
    if (typeof body.data !== 'string' || body.data.length > MAX_BODY || !Number.isInteger(body.rev)) return reply({ error: 'shape' }, 400);
    const tokenHash = await sha256hex(request.headers.get('X-Token') || '');
    const stored = await this.storage.get('tokenHash');
    if (stored && stored !== tokenHash) return reply({ error: 'forbidden' }, 403);
    const rev = (await this.storage.get('rev')) ?? 0;
    if (body.rev !== rev) return reply({ rev, data: (await this.storage.get('data')) ?? null }, 409);
    await this.storage.put({ rev: rev + 1, data: body.data, tokenHash });
    return reply({ rev: rev + 1 });
  }
}
