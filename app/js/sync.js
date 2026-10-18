// 同期の画面側の管理(リンクの保存・自動で同期・参加)。通信と暗号は syncCore / syncCrypto が行う。
// 同期サーバーが設定され、旅行が「同期中」になるまで、アプリは一切通信しない。
import * as db from './db.js';
import { state, hooks, markDirty, addTrip } from './state.js';
import { syncOnce, joinRoom, fromPayload, prepareForSync, SyncError } from './syncCore.js';
import { newKey, isKey, b64u } from './syncCrypto.js';
import { mergeTrip, sameContent } from './merge.js';
import { modalOpen } from './ui.js';

// tripId → { k:鍵, r:サーバー, rev, base, last, status, error }
export const links = new Map();
const metaKey = (id) => 'sync:' + id;
const running = new Set();
const timers = new Map();

// CSP(connect-src)が許す *.workers.dev の https だけを受け付ける
export function normalizeRelay(text) {
  try {
    const u = new URL(String(text).trim());
    const ok = u.protocol === 'https:' && u.hostname.endsWith('.workers.dev') && (u.pathname === '/' || u.pathname === '') && !u.search && !u.hash && !u.username && !u.password;
    return ok ? u.origin : '';
  } catch {
    return '';
  }
}

export async function loadLinks(trips) {
  for (const t of trips) {
    const l = await db.getMeta(metaKey(t.id)).catch(() => null);
    if (l && isKey(l.k) && normalizeRelay(l.r)) links.set(t.id, { k: l.k, r: l.r, rev: l.rev || 0, base: l.base || null, last: l.last || '', status: 'idle', error: '' });
  }
}

const saveLink = (id) => {
  const l = links.get(id);
  if (!l) return Promise.resolve();
  return db.setMeta(metaKey(id), { k: l.k, r: l.r, rev: l.rev, base: l.base, last: l.last });
};

export const isLinked = (id) => links.has(id);

const idle = () => document.activeElement?.matches?.('input, textarea, select');

export async function syncTrip(trip) {
  const link = links.get(trip.id);
  if (!link || running.has(trip.id)) return;
  if (modalOpen()) return scheduleSync(trip, 4000); // 入力中は、画面の中身を差し替えない
  running.add(trip.id);
  link.status = 'syncing';
  try {
    const snapshot = structuredClone(trip);
    const res = await syncOnce({ link, trip });
    if (modalOpen()) throw new SyncError('入力中だったので、あとでもう一度同期します', 'later');
    // 同期している間に手元で編集された分は残したまま、相手の内容を取り込む
    const final = mergeTrip(snapshot, trip, res.merged);
    const changed = !sameContent(final, trip);
    Object.assign(trip, final);
    link.rev = res.rev;
    link.base = res.base;
    link.last = new Date().toISOString();
    link.status = 'ok';
    link.error = '';
    if (changed) markDirty(trip);
    await saveLink(trip.id);
    if (!sameContent(final, res.merged)) scheduleSync(trip, 1500); // 同期中の編集を、次に送る
    if (changed && !idle()) hooks.render();
  } catch (e) {
    link.status = e?.code === 'later' ? 'idle' : 'error';
    link.error = e instanceof SyncError ? e.message : '同期に失敗しました';
    if (e?.code === 'later') scheduleSync(trip, 4000);
  } finally {
    running.delete(trip.id);
    hooks.onSyncState();
  }
}

export function scheduleSync(trip, ms = 1500) {
  if (!links.has(trip.id)) return;
  clearTimeout(timers.get(trip.id));
  timers.set(trip.id, setTimeout(() => syncTrip(trip), ms));
}

// 同期を始める(自分が先に送る側)。最初の送信に成功したときだけ、リンクを作る
export async function startSync(trip, relay) {
  const link = { k: newKey(), r: relay, rev: 0, base: null, last: '', status: 'idle', error: '' };
  links.set(trip.id, link);
  await syncTrip(trip);
  if (link.status !== 'ok') {
    const message = link.error || '同期を始められませんでした';
    links.delete(trip.id);
    throw new SyncError(message, 'start');
  }
  await saveLink(trip.id);
  return link;
}

export function linkUrl(trip) {
  const l = links.get(trip.id);
  const payload = b64u.from(new TextEncoder().encode(JSON.stringify({ v: 1, t: trip.id, k: l.k, r: l.r })));
  return `${location.origin}${location.pathname}#sync=${payload}`;
}

// 招待ファイル(貼り付けなしで参加できる)。中身は、リンクと同じ情報なので、相手以外には渡さない。
export function inviteFile(trip) {
  const l = links.get(trip.id);
  const text = JSON.stringify({ type: 'travel-planner-sync-invite', v: 1, t: trip.id, k: l.k, r: l.r }, null, 2);
  return { name: 'tabi-sync-invite.json', text };
}

// 読み込んだファイルの中身が「招待ファイル」「サーバー設定ファイル」なら、検査して返す
export function parseInviteData(data) {
  if (data?.type === 'travel-planner-sync-invite') {
    if (data.v !== 1 || !/^[\w.-]{1,64}$/.test(data.t) || !isKey(data.k) || !normalizeRelay(data.r)) return { kind: 'invalid' };
    return { kind: 'invite', link: { t: data.t, k: data.k, r: normalizeRelay(data.r) } };
  }
  if (data?.type === 'travel-planner-relay') {
    const relay = normalizeRelay(data.relay);
    return relay ? { kind: 'relay', relay } : { kind: 'invalid' };
  }
  return null;
}

// 貼り付けられた文章やURLから、同期リンクを取り出す
export function parseSyncLink(text) {
  const m = /#sync=([A-Za-z0-9_-]+)/.exec(String(text));
  if (!m) return null;
  try {
    const j = JSON.parse(new TextDecoder().decode(b64u.to(m[1])));
    if (j?.v !== 1 || !/^[\w.-]{1,64}$/.test(j.t) || !isKey(j.k) || !normalizeRelay(j.r)) return null;
    return { t: j.t, k: j.k, r: normalizeRelay(j.r) };
  } catch {
    return null;
  }
}

// 参加する前に、相手の旅行の名前を確かめる
export async function peekLink(j) {
  const { payload } = await joinRoom({ key: j.k, relay: j.r });
  return { name: String(payload.name || '旅行') };
}

export async function joinTrip(j) {
  const { payload, rev } = await joinRoom({ key: j.k, relay: j.r });
  const existing = state.trips.find((x) => x.id === j.t);
  if (existing) {
    links.set(j.t, { k: j.k, r: j.r, rev: 0, base: null, last: '', status: 'idle', error: '' });
    await saveLink(j.t);
    await syncTrip(existing);
    return existing;
  }
  const trip = fromPayload(payload, { id: j.t, created: new Date().toISOString() });
  await addTrip(trip, { select: true });
  links.set(j.t, { k: j.k, r: j.r, rev, base: prepareForSync(trip), last: new Date().toISOString(), status: 'ok', error: '' });
  await saveLink(j.t);
  return trip;
}

export async function stopSync(id) {
  clearTimeout(timers.get(id));
  links.delete(id);
  await db.setMeta(metaKey(id), null);
}

// 開いている旅行を、定期的に・画面が戻ったときに同期する
export function startPolling(getTrip) {
  const tick = () => {
    const t = getTrip();
    if (t && links.has(t.id) && document.visibilityState === 'visible') syncTrip(t);
  };
  setInterval(tick, 10000);
  document.addEventListener('visibilitychange', tick);
  addEventListener('online', tick);
  tick();
}
