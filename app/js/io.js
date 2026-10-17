// 書き出し・読み込み。
//  - backup: 誕生日も含めて全部(自分用のバックアップ)
//  - share : 誕生日を除く(同行者に送る用。色だけを渡す)
import { uid } from './util.js';
import { normalizeTrip, LIMITS } from './model.js';

export const MAX_IMPORT_BYTES = 30 * 1024 * 1024; // 写真入りのバックアップを想定
export const MAX_TRIPS_PER_FILE = 50;

export class ImportError extends Error {}

function forShare(trip) {
  return {
    ...trip,
    // 自分の写真は共有しない(中に写っている人や場所が分かるため)
    background: trip.background === 'photo' ? 'plain' : trip.background,
    backgroundPhoto: '',
    places: trip.places.map((p) => ({ ...p, photo: '' })),
    members: trip.members.map((m) => ({ ...m, birthday: '', colorAuto: false })),
  };
}

export function serializeTrip(trip, { share = false } = {}) {
  const t = share ? forShare(trip) : trip;
  return JSON.stringify({ type: 'travel-planner-trip', version: 2, trip: t }, null, 2);
}

export function serializeBackup(trips) {
  return JSON.stringify({ type: 'travel-planner-backup', version: 2, trips }, null, 2);
}

// 文字列 → 正規化済みの旅行の配列。旅行IDは必ず振り直す(既存の旅行を上書きしない)
export function parseImport(text) {
  if (typeof text !== 'string' || text.length > MAX_IMPORT_BYTES) throw new ImportError('ファイルが大きすぎます');
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new ImportError('JSONとして読み込めませんでした');
  }
  let rawTrips;
  if (data && data.type === 'travel-planner-backup' && Array.isArray(data.trips)) rawTrips = data.trips;
  else if (data && data.trip && typeof data.trip === 'object') rawTrips = [data.trip];
  else if (data && Array.isArray(data.places) && Array.isArray(data.schedule)) rawTrips = [data];
  else throw new ImportError('旅のプランの形式ではありません');
  if (!rawTrips.length || rawTrips.length > MAX_TRIPS_PER_FILE) throw new ImportError('旅行の数が正しくありません');
  return rawTrips.map((raw) => {
    if (!raw || !Array.isArray(raw.places) || !Array.isArray(raw.schedule) || raw.places.length > LIMITS.places * 4) {
      throw new ImportError('旅行データが壊れています');
    }
    return { ...normalizeTrip(raw), id: uid() };
  });
}
