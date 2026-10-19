// 2人の端末の内容を、3者比較(前回同期した状態=base / 手元=local / 相手=remote)でまとめる。
// どちらかだけが変えた項目はそれを採用し、両方が同じ項目を変えたときだけ、新しい更新のほうを採用する。
// 誕生日・写真は端末の外に出さない(送らない・相手の内容で消さない)。
import { normalizeTrip } from './model.js';

const SCALARS = ['name', 'destination', 'date', 'days', 'theme', 'notes', 'background', 'catEmoji'];
const COLLS = ['members', 'genres', 'places', 'schedule', 'checklist', 'bookings'];
// 端末の中にだけ置く項目
const LOCAL_ONLY = { members: ['birthday', 'colorAuto'], places: ['photo'] };

const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

function strip(entity, coll) {
  const drop = LOCAL_ONLY[coll];
  if (!drop) return entity;
  const copy = { ...entity };
  for (const k of drop) delete copy[k];
  return copy;
}

function restoreLocalOnly(entity, localEntity, coll) {
  const keep = LOCAL_ONLY[coll];
  if (!keep || !localEntity) return entity;
  const out = { ...entity };
  for (const k of keep) if (k in localEntity) out[k] = localEntity[k];
  return out;
}

function pick(b, l, r, newerLocal) {
  if (eq(l, r)) return l;
  if (b !== undefined && eq(l, b)) return r;
  if (b !== undefined && eq(r, b)) return l;
  return newerLocal ? l : r;
}

function mergeColl(coll, base, local, remote, newerLocal) {
  const B = new Map(base.map((x) => [x.id, x]));
  const L = new Map(local.map((x) => [x.id, x]));
  const R = new Map(remote.map((x) => [x.id, x]));
  const keep = new Map();
  for (const id of new Set([...L.keys(), ...R.keys()])) {
    const b = B.get(id);
    const l = L.get(id);
    const r = R.get(id);
    let e;
    if (l && r) {
      const [sl, sr] = [strip(l, coll), strip(r, coll)];
      if (eq(sl, sr)) e = l;
      else if (b && eq(sl, strip(b, coll))) e = restoreLocalOnly(r, l, coll);
      else if (b && eq(sr, strip(b, coll))) e = l;
      else e = newerLocal ? l : restoreLocalOnly(r, l, coll);
    } else if (l) {
      // 相手の側で消されている。手元で変えていなければ消す(変えていれば、変更を優先して残す)
      e = b && eq(strip(l, coll), strip(b, coll)) ? null : l;
    } else {
      e = b && eq(strip(r, coll), strip(b, coll)) ? null : r;
    }
    if (e) keep.set(id, e);
  }
  // 並び順: 並べ替えた(変えた)ほうの順番を使う
  const ids = (a) => a.map((x) => x.id);
  const [iB, iL, iR] = [ids(base), ids(local), ids(remote)];
  const localFirst = base.length && eq(iL, iB) ? false : base.length && eq(iR, iB) ? true : newerLocal;
  const order = localFirst ? [...iL, ...iR] : [...iR, ...iL];
  const out = [];
  for (const id of order) if (keep.has(id)) { out.push(keep.get(id)); keep.delete(id); }
  return out;
}

export function mergeTrip(base, local, remote) {
  const newerLocal = String(local.updated) >= String(remote.updated);
  const out = { ...local };
  for (const k of SCALARS) out[k] = pick(base?.[k], local[k], remote[k], newerLocal);
  if (local.background === 'photo') out.background = 'photo'; // 自分の写真の背景は、そのまま
  for (const c of COLLS) out[c] = mergeColl(c, base?.[c] ?? [], local[c], remote[c], newerLocal);
  out.updated = newerLocal ? local.updated : remote.updated;
  return normalizeTrip(out);
}

// サーバーへ送る形。写真・誕生日は含めない
export function prepareForSync(t) {
  const out = { schema: 2, updated: t.updated };
  for (const k of SCALARS) out[k] = t[k];
  if (out.background === 'photo') out.background = 'plain';
  for (const c of COLLS) out[c] = t[c].map((x) => {
    const copy = { ...x };
    for (const k of LOCAL_ONLY[c] || []) copy[k] = k === 'colorAuto' ? false : '';
    return copy;
  });
  return out;
}

// 相手から来た内容を、手元の旅行の形にする(必ず正規化を通す)
export function fromPayload(payload, localTrip) {
  return normalizeTrip({ ...payload, id: localTrip.id, created: localTrip.created, backgroundPhoto: '' });
}

export const sameContent = (a, b) => eq(prepareForSync(a), prepareForSync(b));
