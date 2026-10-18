// 同期用の中継サーバーの本体(Cloudflare Workers + D1)。node-relay.mjs と同じプロトコル:
//   GET /v1/room/:room            → 200 { rev, data }
//   PUT /v1/room/:room  X-Token   → 200 { rev } / 409 { rev, data }(他の端末が先に更新) / 403(合言葉が違う)
// サーバーが持つのは「部屋の名前(鍵から作った乱数)」「書き込み合言葉のハッシュ」「暗号化された内容」だけで、中身は読めない。
// D1 は SQLite なので、版の確認つきの更新(UPDATE ... WHERE rev = ?)で、同時書き込みの衝突を安全に判定する。

const MAX_BODY = 2 * 1024 * 1024;
const ROOM_PATH = /^\/v1\/room\/([0-9a-f]{32})$/;
const STALE_DAYS = 180; // 半年以上、更新も読み込みもない部屋は削除する

const sha256hex = async (s) =>
  [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)))].map((b) => b.toString(16).padStart(2, '0')).join('');

function corsHeaders(env) {
  return {
    'Access-Control-Allow-Origin': env.ALLOWED_ORIGIN || '*',
    'Access-Control-Allow-Headers': 'Content-Type, X-Token',
    'Access-Control-Allow-Methods': 'GET, PUT, OPTIONS',
    'Access-Control-Max-Age': '86400',
    'Cache-Control': 'no-store',
    Vary: 'Origin',
  };
}

const reply = (env, obj, status = 200) =>
  new Response(status === 204 ? null : JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json', ...corsHeaders(env) } });

export async function handleRequest(request, env) {
  if (request.method === 'OPTIONS') return reply(env, null, 204);
  const m = ROOM_PATH.exec(new URL(request.url).pathname);
  if (!m) return reply(env, { error: 'not found' }, 404);
  const room = m[1];
  const db = env.DB;

  if (request.method === 'GET') {
    const row = await db.prepare('SELECT rev, data FROM rooms WHERE room = ?').bind(room).first();
    return reply(env, row ? { rev: row.rev, data: row.data } : { rev: 0, data: null });
  }
  if (request.method !== 'PUT') return reply(env, { error: 'method' }, 405);

  if (Number(request.headers.get('Content-Length') || 0) > MAX_BODY) return reply(env, { error: 'too large' }, 413);
  let body;
  try {
    body = await request.json();
  } catch {
    return reply(env, { error: 'json' }, 400);
  }
  if (typeof body?.data !== 'string' || body.data.length > MAX_BODY || !Number.isInteger(body.rev) || body.rev < 0) return reply(env, { error: 'shape' }, 400);

  const tokenHash = await sha256hex(request.headers.get('X-Token') || '');
  const now = Date.now();
  const current = () => db.prepare('SELECT rev, data FROM rooms WHERE room = ?').bind(room).first();
  const conflict = async () => {
    const row = await current();
    return reply(env, row ? { rev: row.rev, data: row.data } : { rev: 0, data: null }, 409);
  };

  const existing = await db.prepare('SELECT rev, token_hash FROM rooms WHERE room = ?').bind(room).first();
  if (existing) {
    if (existing.token_hash !== tokenHash) return reply(env, { error: 'forbidden' }, 403);
    if (existing.rev !== body.rev) return conflict();
    const res = await db
      .prepare('UPDATE rooms SET rev = rev + 1, data = ?, updated_at = ? WHERE room = ? AND rev = ? AND token_hash = ?')
      .bind(body.data, now, room, body.rev, tokenHash)
      .run();
    if (res.meta.changes !== 1) return conflict(); // ほぼ同時に、他の端末が先に書いた
    await maybePurge(db, now);
    return reply(env, { rev: body.rev + 1 });
  }

  if (body.rev !== 0) return conflict();
  const res = await db
    .prepare('INSERT INTO rooms (room, rev, data, token_hash, updated_at) VALUES (?, 1, ?, ?, ?) ON CONFLICT(room) DO NOTHING')
    .bind(room, body.data, tokenHash, now)
    .run();
  if (res.meta.changes !== 1) return conflict();
  await maybePurge(db, now);
  return reply(env, { rev: 1 });
}

// 使われなくなった部屋を、ときどき(50回に1回ほど)まとめて消す
async function maybePurge(db, now) {
  if (Math.random() > 0.02) return;
  await db.prepare('DELETE FROM rooms WHERE updated_at < ?').bind(now - STALE_DAYS * 86400000).run();
}
