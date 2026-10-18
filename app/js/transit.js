import { isDateStr, isTimeStr } from './util.js';

// flip: iPhoneの絵文字は左向きのものがあり、右へ進ませるときに反転する。
// 実機で向きが逆に見えたら、ここの flip を変えるだけで直せる。
export const MODES = [
  { id: 'car', emoji: '🚗', label: '車', flip: true },
  { id: 'taxi', emoji: '🚕', label: 'タクシー', flip: true },
  { id: 'bus', emoji: '🚌', label: 'バス', flip: true },
  { id: 'train', emoji: '🚃', label: '電車', flip: true },
  { id: 'shinkansen', emoji: '🚄', label: '新幹線', flip: true },
  { id: 'walk', emoji: '🚶🏻', label: '徒歩', flip: true },
  { id: 'bike', emoji: '🚲', label: '自転車', flip: true },
  { id: 'plane', emoji: '✈️', label: '飛行機', flip: false },
  { id: 'ship', emoji: '🚢', label: '船', flip: false },
];

export const modeOf = (id) => MODES.find((m) => m.id === id) || MODES[0];

export function toMinutes(t) {
  return isTimeStr(t) ? +t.slice(0, 2) * 60 + +t.slice(3) : null;
}

// 旅行 N 日目の 0:00(端末のローカル時刻)。日付未設定なら null
export function dayStart(dateStr, day) {
  if (!isDateStr(dateStr)) return null;
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d + day - 1);
}

// 移動の進み具合。before=出発前 / moving=移動中 / arrived=到着 / unknown=計算不可
export function moveProgress(now, start, end) {
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return { state: 'unknown', p: 0 };
  const t = +now;
  if (t <= start) return { state: 'before', p: 0 };
  if (t >= end) return { state: 'arrived', p: 1 };
  return { state: 'moving', p: (t - start) / (end - start) };
}

// その予定の開始・終了時刻(ミリ秒)。日付未設定や時刻が不正なら null
export function stopTimes(dateStr, day, time, endTime) {
  const base = dayStart(dateStr, day);
  const a = toMinutes(time);
  const b = toMinutes(endTime);
  if (!base || a === null || b === null) return null;
  const t0 = +base;
  return { start: t0 + a * 60000, end: t0 + b * 60000 };
}
