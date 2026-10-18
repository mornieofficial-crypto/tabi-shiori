import test from 'node:test';
import assert from 'node:assert/strict';
import { newKey, isKey, deriveKeys, encryptJson, decryptJson } from '../app/js/syncCrypto.js';
import { mergeTrip, prepareForSync } from '../app/js/merge.js';
import { syncOnce, joinRoom, fromPayload, SyncError } from '../app/js/syncCore.js';
import { normalizeTrip } from '../app/js/model.js';
import { createRelay } from '../relay/node-relay.mjs';

const mk = (o = {}) => normalizeTrip({ id: 't1', name: '京都', days: 2, members: [{ id: 'a', name: '香文', birthday: '03-15' }, { id: 'b', name: '隼人' }], updated: '2026-01-01T00:00:00.000Z', ...o });
const touch = (t, at) => { t.updated = at; return t; };

test('暗号: 往復でき、鍵が違うと読めず、部屋の名前から鍵は分からない', async () => {
  const k1 = newKey();
  const k2 = newKey();
  assert.ok(isKey(k1));
  const a = await deriveKeys(k1);
  const b = await deriveKeys(k2);
  assert.notEqual(a.room, b.room);
  assert.ok(!a.room.includes(k1.slice(0, 8)));
  const text = await encryptJson({ x: '京都', n: 1 }, a.aes);
  assert.ok(!text.includes('京都'));
  assert.deepEqual(await decryptJson(text, a.aes), { x: '京都', n: 1 });
  await assert.rejects(() => decryptJson(text, b.aes));
  assert.notEqual(text, await encryptJson({ x: '京都', n: 1 }, a.aes)); // 毎回ちがう暗号文
  assert.equal(isKey('short'), false);
});

test('送る内容に、誕生日・写真・自分の写真の背景は含まれない', () => {
  const t = mk({ background: 'photo', backgroundPhoto: 'data:image/jpeg;base64,/9j/4AAQ', places: [{ id: 'p', name: 'x', photo: 'data:image/jpeg;base64,/9j/4AAQ' }] });
  const payload = prepareForSync(t);
  const text = JSON.stringify(payload);
  assert.ok(!text.includes('03-15'));
  assert.ok(!text.includes('base64'));
  assert.equal(payload.background, 'plain');
  assert.equal(payload.members[0].birthday, '');
});

test('3者比較: 別々の項目の変更は両方残る / 同じ項目は新しいほう / 消した項目は消える', () => {
  const base = mk({ places: [{ id: 'p1', name: 'A', memo: '' }, { id: 'p2', name: 'B' }], checklist: [{ id: 'c1', text: '傘' }, { id: 'c2', text: '充電器' }] });
  const local = structuredClone(base);
  const remote = structuredClone(base);
  // 手元: p1にメモ、持ち物c1を削除、候補p3を追加
  local.places[0].memo = '朝は混む';
  local.checklist = local.checklist.filter((c) => c.id !== 'c1');
  local.places.push({ ...base.places[0], id: 'p3', name: 'C' });
  touch(local, '2026-01-02T00:00:00.000Z');
  // 相手: p2の名前を変更、c2を完了、旅行名を変更
  remote.places[1].name = 'B2';
  remote.checklist[1].done = true;
  remote.name = '京都2日間';
  touch(remote, '2026-01-03T00:00:00.000Z');
  const m = mergeTrip(base, local, remote);
  assert.equal(m.places.find((p) => p.id === 'p1').memo, '朝は混む');
  assert.equal(m.places.find((p) => p.id === 'p2').name, 'B2');
  assert.ok(m.places.some((p) => p.id === 'p3'));
  assert.ok(!m.checklist.some((c) => c.id === 'c1'));
  assert.equal(m.checklist.find((c) => c.id === 'c2').done, true);
  assert.equal(m.name, '京都2日間');
  // 同じ項目を両方が変えた → 新しい更新(相手)が勝つ
  local.places[1].name = 'B-local';
  const m2 = mergeTrip(base, local, remote);
  assert.equal(m2.places.find((p) => p.id === 'p2').name, 'B2');
  // 片方が消し、もう片方が変えた → 変えたほうを残す
  const rem2 = structuredClone(base);
  rem2.places = rem2.places.filter((p) => p.id !== 'p1');
  touch(rem2, '2026-01-04T00:00:00.000Z');
  const m3 = mergeTrip(base, local, rem2);
  assert.ok(m3.places.some((p) => p.id === 'p1'), '手元で変えた候補は、相手が消しても残る');
});

test('3者比較: 手元の誕生日・写真は、相手の内容で消えない', () => {
  const base = mk({ places: [{ id: 'p1', name: 'A', photo: 'data:image/jpeg;base64,/9j/4AAQ' }] });
  const local = structuredClone(base);
  const remote = structuredClone(base);
  remote.members = remote.members.map((m) => ({ ...m, birthday: '', colorAuto: false }));
  remote.places = remote.places.map((p) => ({ ...p, photo: '', memo: '相手のメモ' }));
  touch(remote, '2026-01-05T00:00:00.000Z');
  const m = mergeTrip(base, local, remote);
  assert.equal(m.members[0].birthday, '03-15');
  assert.ok(m.places[0].photo.startsWith('data:image/jpeg'));
  assert.equal(m.places[0].memo, '相手のメモ');
});

async function withRelay(fn) {
  const { server, rooms } = createRelay();
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const relay = `http://127.0.0.1:${server.address().port}`;
  try { await fn(relay, rooms); } finally { server.close(); }
}

test('同期: 2台の端末が編集を交互に・同時に行っても、内容がそろう', async () => {
  await withRelay(async (relay, rooms) => {
    const key = newKey();
    // A が旅行を作って最初に送る
    let A = mk({ places: [{ id: 'p1', name: 'ことぶき寿司', cat: '食事' }] });
    let linkA = { k: key, r: relay, rev: 0, base: null };
    let res = await syncOnce({ link: linkA, trip: A });
    assert.equal(res.pushed, true);
    linkA = { ...linkA, rev: res.rev, base: res.base };

    // サーバーに置かれた内容は暗号文だけ(日本語や旅行名が見えない)
    const stored = JSON.stringify([...rooms.values()]);
    assert.ok(!stored.includes('ことぶき寿司') && !stored.includes('京都'));

    // B が参加する
    const joined = await joinRoom({ key, relay });
    let B = fromPayload(joined.payload, { id: 't1', created: A.created });
    let linkB = { k: key, r: relay, rev: joined.rev, base: prepareForSync(B) };
    assert.equal(B.places[0].name, 'ことぶき寿司');

    // 同時編集: A は持ち物を追加、B は候補にメモと♡
    A.checklist.push({ id: 'cA', text: '傘', done: false });
    touch(A, '2026-02-01T10:00:00.000Z');
    B.places[0].memo = 'タレカツも気になる';
    B.places[0].votes = { b: true };
    touch(B, '2026-02-01T10:00:05.000Z');

    res = await syncOnce({ link: linkA, trip: A });
    linkA = { ...linkA, rev: res.rev, base: res.base };
    A = res.merged;
    res = await syncOnce({ link: linkB, trip: B }); // B は A の更新を取り込みつつ、自分の分を送る
    linkB = { ...linkB, rev: res.rev, base: res.base };
    B = res.merged;
    res = await syncOnce({ link: linkA, trip: A }); // A がもう一度同期 → B の変更が入る
    A = res.merged;

    for (const t of [A, B]) {
      assert.ok(t.checklist.some((c) => c.id === 'cA'));
      assert.equal(t.places[0].memo, 'タレカツも気になる');
      assert.equal(t.places[0].votes.b, true);
    }
    assert.equal(A.members[0].birthday, '03-15', 'A の誕生日は A の端末に残る');
  });
});

test('同期: 別の鍵・不正なサーバー応答では失敗し、手元の内容は壊れない', async () => {
  await withRelay(async (relay) => {
    const A = mk();
    const res = await syncOnce({ link: { k: newKey(), r: relay, rev: 0, base: null }, trip: A });
    assert.equal(res.pushed, true);
    await assert.rejects(() => joinRoom({ key: newKey(), relay }), (e) => e instanceof SyncError && e.code === 'empty');
    await assert.rejects(() => syncOnce({ link: { k: newKey(), r: 'http://127.0.0.1:1', rev: 0, base: null }, trip: A }), (e) => e.code === 'network');
  });
});

test('中継サーバー: 合言葉が違う書き込みは拒否、古い版への書き込みは409', async () => {
  await withRelay(async (relay) => {
    const room = 'a'.repeat(32);
    const put = (rev, token, data = 'v1.x.y') => fetch(`${relay}/v1/room/${room}`, { method: 'PUT', headers: { 'X-Token': token, 'Content-Type': 'application/json' }, body: JSON.stringify({ rev, data }) });
    assert.equal((await put(0, 'T1')).status, 200);
    assert.equal((await put(1, 'T2')).status, 403);
    assert.equal((await put(0, 'T1')).status, 409);
    assert.equal((await put(1, 'T1')).status, 200);
    assert.equal((await fetch(`${relay}/v1/room/zzzz`)).status, 404);
  });
});

test('招待ファイル・サーバー設定ファイル: 正しいものだけ受け付ける', async () => {
  const { parseInviteData } = await import('../app/js/sync.js');
  const k = newKey();
  const ok = parseInviteData({ type: 'travel-planner-sync-invite', v: 1, t: 'trip-1', k, r: 'https://relay.example.workers.dev/' });
  assert.equal(ok.kind, 'invite');
  assert.deepEqual(ok.link, { t: 'trip-1', k, r: 'https://relay.example.workers.dev' });
  assert.equal(parseInviteData({ type: 'travel-planner-sync-invite', v: 1, t: 'x', k: 'short', r: 'https://a.workers.dev' }).kind, 'invalid');
  assert.equal(parseInviteData({ type: 'travel-planner-sync-invite', v: 1, t: 'x', k, r: 'https://evil.example.com' }).kind, 'invalid', '許可していないサーバーは弾く');
  assert.equal(parseInviteData({ type: 'travel-planner-sync-invite', v: 1, t: '../x', k, r: 'https://a.workers.dev' }).kind, 'invalid');
  assert.deepEqual(parseInviteData({ type: 'travel-planner-relay', relay: 'https://a.workers.dev' }), { kind: 'relay', relay: 'https://a.workers.dev' });
  assert.equal(parseInviteData({ type: 'travel-planner-relay', relay: 'http://a.workers.dev' }).kind, 'invalid');
  assert.equal(parseInviteData({ type: 'travel-planner-trip' }), null);
});
