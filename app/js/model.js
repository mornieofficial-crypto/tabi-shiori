// データ構造(スキーマ v2)と、外部から来たデータの検証・正規化。
// 読み込んだデータは必ずここを通し、知らない項目は捨てる。
import { uid, clamp, str, isDateStr, isTimeStr } from './util.js';
import { isHex, parseBirthday, birthdayColor, PRESET_COLORS } from './color.js';
import { MODES } from './transit.js';

export const SCHEMA = 2;
export const LIMITS = { members: 8, places: 500, schedule: 500, checklist: 200, days: 30 };

export const CATS = ['食事', 'カフェ', '観光', '宿泊', '釣り', 'お土産', '朝食', '移動', 'その他'];
export const CAT_EMOJI = { 食事: '🍜', カフェ: '☕', 観光: '🌿', 宿泊: '♨️', 釣り: '🎣', お土産: '🎁', 朝食: '🥐', 移動: '🚗', その他: '📍' };
const DEFAULT_MEMBER_EMOJI = ['🐻', '🐰', '🐱', '🐶', '🦊', '🐼', '🐸', '🐥'];
const MODE_IDS = new Set(MODES.map((m) => m.id));

const cleanId = (v) => {
  const s = str(v, 64).replace(/[^\w.-]/g, '');
  return s || uid();
};

function uniqueId(raw, used) {
  let id = cleanId(raw);
  while (used.has(id)) id = uid();
  used.add(id);
  return id;
}

const num = (v) => {
  if (v === '' || v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

export function normalizeMember(raw, i, used = new Set()) {
  const m = raw && typeof raw === 'object' ? raw : { name: raw };
  const birthday = parseBirthday(m.birthday) ? m.birthday : '';
  const colorAuto = !!birthday && m.colorAuto !== false;
  const color = colorAuto ? birthdayColor(birthday) : isHex(m.color) ? m.color.toLowerCase() : PRESET_COLORS[i % PRESET_COLORS.length];
  return {
    id: uniqueId(m.id, used),
    name: str(m.name, 40).trim() || (i === 0 ? 'わたし' : `同行者${i}`),
    emoji: str(m.emoji, 8) || DEFAULT_MEMBER_EMOJI[i % DEFAULT_MEMBER_EMOJI.length],
    birthday,
    color,
    colorAuto,
  };
}

export function normalizeTheme(raw, members) {
  const t = raw && typeof raw === 'object' ? raw : {};
  if (t.mode === 'member' && members.some((m) => m.id === t.memberId)) return { mode: 'member', memberId: t.memberId };
  if (t.mode === 'duo' && members.length >= 2) return { mode: 'duo' };
  if (t.mode === 'custom' && isHex(t.hex)) return { mode: 'custom', hex: t.hex.toLowerCase() };
  return { mode: 'inherit' };
}

function normalizePlace(raw, memberIds, used) {
  const p = raw && typeof raw === 'object' ? raw : {};
  const lat = num(p.lat);
  const lon = num(p.lon);
  const coordsOk = lat !== null && lon !== null && Math.abs(lat) <= 90 && Math.abs(lon) <= 180;
  const votes = {};
  if (p.votes && typeof p.votes === 'object') {
    for (const id of memberIds) if (p.votes[id]) votes[id] = true;
  }
  return {
    id: uniqueId(p.id, used),
    name: str(p.name, 130).trim() || '(名前なし)',
    cat: CATS.includes(p.cat) ? p.cat : 'その他',
    emoji: str(p.emoji, 8),
    region: str(p.region, 100),
    location: str(p.location ?? p.address, 200),
    memo: str(p.memo ?? p.desc, 1000),
    lat: coordsOk ? lat : null,
    lon: coordsOk ? lon : null,
    votes,
  };
}

function normalizeStop(raw, days, placeIds, used) {
  const s = raw && typeof raw === 'object' ? raw : {};
  const kind = s.kind === 'move' ? 'move' : 'stop';
  const placeId = placeIds.has(s.placeId) ? s.placeId : '';
  const options = (Array.isArray(s.options) ? s.options : []).filter((id) => placeIds.has(id)).slice(0, 20);
  if (placeId && !options.includes(placeId)) options.push(placeId);
  const time = isTimeStr(s.time) ? s.time : '12:00';
  return {
    id: uniqueId(s.id, used),
    kind,
    day: clamp(Math.round(Number(s.day)) || 1, 1, days),
    time,
    endTime: isTimeStr(s.endTime) && s.endTime > time ? s.endTime : '',
    title: str(s.title, 100).trim() || (kind === 'move' ? '移動' : '立ち寄り'),
    placeId: kind === 'move' ? '' : placeId,
    options: kind === 'move' ? [] : options,
    note: str(s.note, 500),
    optional: !!s.optional,
    done: !!s.done,
    mode: MODE_IDS.has(s.mode) ? s.mode : 'car',
  };
}

export function normalizeTrip(raw) {
  const t = raw && typeof raw === 'object' ? raw : {};
  const days = clamp(Math.round(Number(t.days)) || 3, 1, LIMITS.days);

  // v1(参加者名の配列・番号で投票)からの移行
  const legacyPeople = !Array.isArray(t.members) && Array.isArray(t.people);
  const memberSrc = (Array.isArray(t.members) ? t.members : legacyPeople ? t.people : ['わたし', '同行者']).slice(0, LIMITS.members);
  const usedM = new Set();
  const members = memberSrc.map((m, i) => normalizeMember(m, i, usedM));
  if (!members.length) members.push(normalizeMember({}, 0, usedM));

  const placesSrc = (Array.isArray(t.places) ? t.places : []).slice(0, LIMITS.places);
  const memberIds = members.map((m) => m.id);
  const usedP = new Set();
  const places = placesSrc.map((p) => {
    if (legacyPeople && p && p.votes && typeof p.votes === 'object') {
      const votes = {};
      members.forEach((m, i) => {
        if (p.votes[i]) votes[m.id] = true;
      });
      p = { ...p, votes };
    }
    return normalizePlace(p, memberIds, usedP);
  });
  const placeIds = new Set(places.map((p) => p.id));

  const usedS = new Set();
  const schedule = (Array.isArray(t.schedule) ? t.schedule : []).slice(0, LIMITS.schedule).map((s) => normalizeStop(s, days, placeIds, usedS));

  const usedC = new Set();
  const checklist = (Array.isArray(t.checklist) ? t.checklist : []).slice(0, LIMITS.checklist).map((c) => ({
    id: uniqueId(c?.id, usedC),
    text: str(c?.text, 200).trim() || '(空)',
    done: !!c?.done,
  }));

  return {
    schema: SCHEMA,
    id: cleanId(t.id),
    name: str(t.name, 70).trim() || '新しい旅行',
    destination: str(t.destination, 100),
    date: isDateStr(t.date) ? t.date : '',
    days,
    members,
    theme: normalizeTheme(t.theme, members),
    places,
    schedule,
    checklist,
    notes: str(t.notes, 5000),
    created: typeof t.created === 'string' ? str(t.created, 40) : new Date().toISOString(),
    updated: typeof t.updated === 'string' ? str(t.updated, 40) : new Date().toISOString(),
  };
}

export function newTrip({ name, destination, date, days, memberNames }) {
  return normalizeTrip({
    id: uid(),
    name,
    destination,
    date,
    days,
    members: memberNames.map((n) => ({ name: n })),
  });
}
