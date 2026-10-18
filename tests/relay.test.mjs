import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { handleRequest } from '../relay/handler.js';
import { newKey } from '../app/js/syncCrypto.js';
import { syncOnce, joinRoom, fromPayload, prepareForSync } from '../app/js/syncCore.js';
import { normalizeTrip } from '../app/js/model.js';

// D1 は SQLite なので、本物の SQL を node:sqlite で動かして、D1 の代わりにする
const migration = readFileSync(new URL('../relay/migrations/0001_init.sql', import.meta.url), 'utf8');
function makeEnv() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(migration);
  const DB = {
    prepare(sql) {
      const st = sqlite.prepare(sql);
      return {
        bind: (...a) => ({
          first: async () => st.get(...a) ?? null,
          run: async () => ({ meta: { changes: Number(st.run(...a).changes) } }),
        }),
      };
    },
  };
  return { DB, sqlite, ALLOWED_ORIGIN: 'https://example.github.io' };
}

const ROOM = 'a'.repeat(32);
const call = (env, method, room, { token, body } = {}) =>
  handleRequest(
    new Request(`https://relay.test/v1/room/${room}`, { method, headers: { 'Content-Type': 'application/json', ...(token ? { 'X-Token': token } : {}) }, body: body ? JSON.stringify(body) : undefined }),
    env,
  );

test('D1版の中継: 作成・更新・合言葉・版の衝突・不正な入力', async () => {
  const env = makeEnv();
  assert.deepEqual(await (await call(env, 'GET', ROOM)).json(), { rev: 0, data: null });
  let r = await call(env, 'PUT', ROOM, { token: 'T1', body: { rev: 0, data: 'v1.a.b' } });
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { rev: 1 });
  assert.equal((await call(env, 'PUT', ROOM, { token: 'T2', body: { rev: 1, data: 'x' } })).status, 403, '合言葉が違う');
  r = await call(env, 'PUT', ROOM, { token: 'T1', body: { rev: 0, data: 'x' } });
  assert.equal(r.status, 409, '古い版への書き込み');
  assert.deepEqual(await r.json(), { rev: 1, data: 'v1.a.b' });
  r = await call(env, 'PUT', ROOM, { token: 'T1', body: { rev: 1, data: 'v1.c.d' } });
  assert.deepEqual(await r.json(), { rev: 2 });
  assert.deepEqual(await (await call(env, 'GET', ROOM)).json(), { rev: 2, data: 'v1.c.d' });
  // 部屋が無いのに rev>0 → 衝突扱い(作れない)
  assert.equal((await call(env, 'PUT', 'b'.repeat(32), { token: 'T', body: { rev: 3, data: 'x' } })).status, 409);
  // 不正
  assert.equal((await call(env, 'GET', 'zzzz')).status, 404);
  assert.equal((await call(env, 'PUT', ROOM, { token: 'T1', body: { rev: 'x', data: 1 } })).status, 400);
  assert.equal((await call(env, 'DELETE', ROOM)).status, 405);
  const opt = await call(env, 'OPTIONS', ROOM);
  assert.equal(opt.status, 204);
  assert.equal(opt.headers.get('Access-Control-Allow-Origin'), 'https://example.github.io');
  // サーバーに残るのは、ハッシュと暗号文だけ(合言葉そのものは残らない)
  const row = env.sqlite.prepare('SELECT * FROM rooms WHERE room = ?').get(ROOM);
  assert.ok(row.token_hash.length === 64 && row.token_hash !== 'T1');
});

test('D1版の中継: 同時に同じ版へ書くと、片方だけ成功する', async () => {
  const env = makeEnv();
  await call(env, 'PUT', ROOM, { token: 'T', body: { rev: 0, data: 'v1.0.0' } });
  const results = await Promise.all([1, 2, 3].map((i) => call(env, 'PUT', ROOM, { token: 'T', body: { rev: 1, data: `v1.${i}.${i}` } })));
  assert.deepEqual(results.map((r) => r.status).sort(), [200, 409, 409]);
});

test('D1版の中継: 半年以上使われていない部屋は、ときどき削除される', async () => {
  const env = makeEnv();
  env.sqlite.prepare('INSERT INTO rooms VALUES (?, 1, ?, ?, ?)').run('c'.repeat(32), 'v1.x.y', 'h', Date.now() - 200 * 86400000);
  const original = Math.random;
  Math.random = () => 0;
  try {
    await call(env, 'PUT', ROOM, { token: 'T', body: { rev: 0, data: 'v1.0.0' } });
  } finally {
    Math.random = original;
  }
  assert.equal(env.sqlite.prepare('SELECT COUNT(*) AS n FROM rooms WHERE room = ?').get('c'.repeat(32)).n, 0);
  assert.equal(env.sqlite.prepare('SELECT COUNT(*) AS n FROM rooms WHERE room = ?').get(ROOM).n, 1);
});

test('D1版の中継 + 同期: 2台の端末が、暗号化された状態でそろう', async () => {
  const env = makeEnv();
  const fetchFn = (url, init) => handleRequest(new Request(url, init), env);
  const relay = 'https://relay.test';
  const key = newKey();
  let A = normalizeTrip({ id: 't', name: '京都', members: [{ id: 'a', name: '香文' }, { id: 'b', name: '隼人' }], places: [{ id: 'p1', name: 'ことぶき寿司', cat: '食事' }] });
  let linkA = { k: key, r: relay, rev: 0, base: null };
  let res = await syncOnce({ fetchFn, link: linkA, trip: A });
  linkA = { ...linkA, rev: res.rev, base: res.base };
  const stored = JSON.stringify(env.sqlite.prepare('SELECT * FROM rooms').all());
  assert.ok(!stored.includes('ことぶき寿司') && !stored.includes('京都'), 'サーバーには暗号文しか無い');

  const joined = await joinRoom({ fetchFn, key, relay });
  let B = fromPayload(joined.payload, { id: 't', created: A.created });
  let linkB = { k: key, r: relay, rev: joined.rev, base: prepareForSync(B) };
  B.places[0].votes = { b: true };
  B.updated = new Date(Date.now() + 1000).toISOString();
  res = await syncOnce({ fetchFn, link: linkB, trip: B });
  linkB = { ...linkB, rev: res.rev, base: res.base };
  res = await syncOnce({ fetchFn, link: linkA, trip: A });
  assert.equal(res.merged.places[0].votes.b, true, 'A に B の♡が届く');
});
