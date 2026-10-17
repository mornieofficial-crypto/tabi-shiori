import * as db from './db.js';
import { normalizeTrip } from './model.js';
import { isHex, themeVars, DEFAULT_ACCENT } from './color.js';

export const state = {
  trips: [],
  settings: { accent: DEFAULT_ACCENT, relay: '' },
  currentId: null,
  // view: list=旅行の一覧 / trip=1つの旅行の中(下のタブ) / app=アプリの設定
  view: 'list',
  backTo: '', // アプリの設定を開く前にいた場所(trip / list)
  tab: 'schedule',
  activeDay: 1,
  gearTab: 'list',
  reorder: false,
  // 予定ごとの「候補を選ぶ」の開き具合(予定ID → 開いているか)。未指定は、決まっていなければ開く・決まっていれば閉じる
  optionsOpen: new Map(),
  filter: 'すべて',
  search: '',
  persistent: true,
};

export const hooks = { onSaveError: () => {}, render: () => {}, onChange: () => {}, onSyncState: () => {} };

export const current = () => state.trips.find((t) => t.id === state.currentId) || null;
export const getPlace = (t, id) => t.places.find((p) => p.id === id);
export const getMember = (t, id) => t.members.find((m) => m.id === id);

const dirty = new Set();
let timer = 0;

// 保存だけ行う(更新時刻は変えない。同期で取り込んだ内容の保存に使う)
export function markDirty(trip) {
  dirty.add(trip.id);
  clearTimeout(timer);
  timer = setTimeout(flush, 200);
}

export function touch(trip) {
  trip.updated = new Date().toISOString();
  markDirty(trip);
  hooks.onChange(trip); // 同期中の旅行なら、あとで送る
}

export async function flush() {
  clearTimeout(timer);
  const ids = [...dirty];
  dirty.clear();
  for (const id of ids) {
    const trip = state.trips.find((t) => t.id === id);
    if (!trip) continue;
    try {
      await db.saveTrip(trip);
    } catch (e) {
      hooks.onSaveError(e);
    }
  }
}

export async function selectTrip(id) {
  state.currentId = id;
  await db.setMeta('lastTrip', id).catch(hooks.onSaveError);
}

export async function addTrip(trip, { select = true } = {}) {
  state.trips.unshift(trip);
  if (select) await selectTrip(trip.id);
  await db.saveTrip(trip).catch(hooks.onSaveError);
}

export async function removeTrip(id) {
  state.trips = state.trips.filter((t) => t.id !== id);
  dirty.delete(id);
  if (state.currentId === id) await selectTrip(null);
  await db.deleteTrip(id).catch(hooks.onSaveError);
}

export async function saveSettings() {
  await db.setMeta('settings', state.settings).catch(hooks.onSaveError);
}

export function themeFor(trip) {
  const base = state.settings.accent;
  if (!trip) return themeVars(base);
  const th = trip.theme || { mode: 'inherit' };
  if (th.mode === 'member') {
    const m = getMember(trip, th.memberId);
    if (m) return themeVars(m.color);
  }
  if (th.mode === 'duo' && trip.members.length >= 2) return themeVars(trip.members[0].color, trip.members[1].color);
  if (th.mode === 'custom' && isHex(th.hex)) return themeVars(th.hex);
  return themeVars(base);
}

const LEGACY_KEY = 'travel-planner-general-v1';

// 旧試作版(localStorage)のデータを一度だけ取り込む。元のデータは消さない。
async function migrateLegacy() {
  try {
    if (await db.getMeta('legacyMigrated')) return [];
    const raw = JSON.parse(localStorage.getItem(LEGACY_KEY) || 'null');
    await db.setMeta('legacyMigrated', true);
    if (!raw || !Array.isArray(raw.trips)) return [];
    const trips = raw.trips.map(normalizeTrip);
    for (const t of trips) await db.saveTrip(t);
    return trips;
  } catch {
    return [];
  }
}

export async function load() {
  state.persistent = await db.init();
  let trips = (await db.loadTrips()).map(normalizeTrip);
  if (!trips.length) trips = await migrateLegacy();
  trips.sort((a, b) => String(b.created).localeCompare(String(a.created)));
  state.trips = trips;
  // 前回開いていた旅行を、そのまま開く
  const last = await db.getMeta('lastTrip');
  state.currentId = trips.some((t) => t.id === last) ? last : null;
  state.view = state.currentId ? 'trip' : 'list';
  state.tab = 'schedule';
  const s = await db.getMeta('settings');
  if (s && isHex(s.accent)) state.settings.accent = s.accent.toLowerCase();
  if (s && typeof s.relay === 'string') state.settings.relay = s.relay;
}

export function applyTheme(trip) {
  const vars = themeFor(trip);
  const root = document.documentElement;
  for (const [k, v] of Object.entries(vars)) root.style.setProperty(k, v);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', vars['--tint']);
}
