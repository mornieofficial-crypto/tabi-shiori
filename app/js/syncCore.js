// 同期の本体(画面に依存しない)。fetch を差し込めるので、テストでも使える。
//   手元の内容を暗号化して中継サーバーに置き、相手の内容があれば3者比較でまとめる。
import { deriveKeys, encryptJson, decryptJson } from './syncCrypto.js';
import { mergeTrip, prepareForSync, fromPayload, sameContent } from './merge.js';

export class SyncError extends Error {
  constructor(message, code) {
    super(message);
    this.code = code;
  }
}

const MAX_ATTEMPTS = 4;

async function call(fetchFn, relay, room, method, token, body) {
  let res;
  try {
    res = await fetchFn(`${relay}/v1/room/${room}`, {
      method,
      headers: { 'Content-Type': 'application/json', ...(token ? { 'X-Token': token } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      cache: 'no-store',
    });
  } catch {
    throw new SyncError('サーバーにつながりません', 'network');
  }
  if (res.status === 403) throw new SyncError('この旅行は、別の鍵で使われています', 'forbidden');
  if (res.status !== 200 && res.status !== 409) throw new SyncError(`サーバーのエラー(${res.status})`, 'server');
  return { status: res.status, json: await res.json() };
}

// link = { k: 鍵, r: 中継サーバーのURL, rev: 前回の版, base: 前回同期した内容(送った形) }
// 戻り値: { merged(手元の形), rev, base(今回送った形), pushed }
export async function syncOnce({ fetchFn = globalThis.fetch.bind(globalThis), link, trip }) {
  const keys = await deriveKeys(link.k);
  const local = structuredClone(trip);
  const base = link.base ? fromPayload(link.base, local) : null;

  let { json: remoteRes } = await call(fetchFn, link.r, keys.room, 'GET');
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    let remote = null;
    if (remoteRes.rev > 0 && remoteRes.data) {
      try {
        remote = fromPayload(await decryptJson(remoteRes.data, keys.aes), local);
      } catch {
        throw new SyncError('相手の内容を読めませんでした(鍵が違う可能性があります)', 'decrypt');
      }
    }
    const merged = remote ? mergeTrip(base, local, remote) : local;
    if (remote && sameContent(merged, remote)) {
      return { merged, rev: remoteRes.rev, base: prepareForSync(merged), pushed: false };
    }
    const payload = prepareForSync(merged);
    const put = await call(fetchFn, link.r, keys.room, 'PUT', keys.token, {
      rev: remoteRes.rev,
      data: await encryptJson(payload, keys.aes),
    });
    if (put.status === 200) return { merged, rev: put.json.rev, base: payload, pushed: true };
    remoteRes = put.json; // 他の端末が先に更新していた → 最新を取り込んでやり直す
  }
  throw new SyncError('更新が重なって、まとめきれませんでした。少し待ってやり直してね', 'conflict');
}

// 相手が始めた同期に参加する。相手の内容がまだ無ければ参加できない。
export async function joinRoom({ fetchFn = globalThis.fetch.bind(globalThis), key, relay }) {
  const keys = await deriveKeys(key);
  const { json } = await call(fetchFn, relay, keys.room, 'GET');
  if (!(json.rev > 0) || !json.data) throw new SyncError('リンクが無効か、相手がまだ同期を始めていません', 'empty');
  let payload;
  try {
    payload = await decryptJson(json.data, keys.aes);
  } catch {
    throw new SyncError('リンクの鍵が違うようです', 'decrypt');
  }
  return { payload, rev: json.rev };
}

export { fromPayload, prepareForSync };
