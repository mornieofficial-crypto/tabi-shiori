// 画面のHTMLを組み立てる(状態は変更しない)。ユーザー入力は必ず esc を通す。
import { esc } from './util.js';
import { CATS, CAT_EMOJI, COUPLE } from './model.js';
import { state, getPlace, getMember } from './state.js';
import { badgeColors, PRESET_COLORS } from './color.js';
import { modeOf, stopTimes, dayStart } from './transit.js';
import { backgroundLabel } from './backgrounds.js';
import { ICON } from './icons.js';

const placeEmoji = (p) => p.emoji || CAT_EMOJI[p.cat] || '📍';
// 編集はペンのアイコンだけにして、文字を減らす
const PEN = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>';
const penBtn = (action, id, label) => `<button class="iconbtn" data-action="${action}" ${id === undefined ? '' : `data-id="${esc(id)}" `}aria-label="${esc(label)}">${PEN}</button>`;
const TRASH = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/></svg>';
const trashBtn = (action, id, label) => `<button class="iconbtn danger" data-action="${action}" data-id="${esc(id)}" aria-label="${esc(label)}">${TRASH}</button>`;
const checkBtn = (action, id, on, label) => `<button class="iconbtn check ${on ? 'on' : ''}" data-action="${action}" data-id="${esc(id)}" aria-pressed="${on}" aria-label="${esc(label)}">${ICON.check}</button>`;

export function avatar(m) {
  const c = badgeColors(m.color);
  return `<span class="avatar" style="background:${c.bg};border-color:${c.border}">${esc(m.emoji)}</span>`;
}

// 「10/17〜10/18」のような旅行の期間(出発日が未定なら日数だけ)
export function rangeText(t) {
  if (!t.date) return `${t.days}日間`;
  const f = (n) => { const [y, m, d] = t.date.split('-').map(Number); const dt = new Date(y, m - 1, d + n); return `${dt.getMonth() + 1}/${dt.getDate()}`; };
  return t.days === 1 ? f(0) : `${f(0)}〜${f(t.days - 1)}`;
}

export function dateTitle(t, day) {
  if (!t.date) return `${day}日目`;
  const [y, m, d] = t.date.split('-').map(Number);
  const dt = new Date(y, m - 1, d + day - 1);
  return `${dt.getMonth() + 1}/${dt.getDate()}（${'日月火水木金土'[dt.getDay()]}）`;
}

// 旅行の一覧(いちばん上の階層)。アプリの設定は右上の歯車から
function renderList() {
  const trips = state.trips;
  return `<div class="sectionactions"><h2 class="title">あなたの旅行</h2><div class="flex"><button class="btn tiny" data-action="import">${ICON.upload} 読み込む</button><button class="btn tiny primary" data-action="new-trip">＋ 新しい旅行</button></div></div>
  ${trips.length ? trips.map(renderTripCard).join('') : '<div class="empty"><strong>旅行はまだありません</strong>最初の旅行を作るか、送られた旅行ファイルを読み込んでね。<div style="margin-top:14px"><button class="btn primary" data-action="new-trip">＋ 新しい旅行を作る</button></div></div>'}`;
}

function storageNotice() {
  return state.persistent
    ? '<div class="notice">データはこの端末の中だけに保存します。別のスマホとは自動同期しません。</div>'
    : '<div class="notice warn">この環境では端末への保存が使えません。このまま閉じるとデータが消えるので、こまめにバックアップを書き出してください。</div>';
}

function swatches(selected, action) {
  return `<div class="swatches" role="radiogroup" aria-label="色">${PRESET_COLORS.map((c) => `<button type="button" class="swatch ${c === selected ? 'on' : ''}" style="background:${c}" data-action="${action}" data-hex="${c}" role="radio" aria-checked="${c === selected}" aria-label="色 ${c}"></button>`).join('')}</div>`;
}

function renderTripCard(t) {
  const open = t.id === state.currentId;
  // カード全体をタップすると開く(ゴミ箱だけは別の操作)
  return `<div class="card tripcard ${open ? 'selected' : ''}" role="button" tabindex="0" data-action="open-trip" data-id="${esc(t.id)}" aria-label="${esc(t.name)}を開く"><div class="listrow">${t.backgroundPhoto ? `<span class="thumb" style="background-image:url('${t.backgroundPhoto}')" role="img" aria-label="旅行の写真"></span>` : `<span class="emoji">${ICON.map}</span>`}<div class="fillspace"><div class="tripname">${esc(t.name)} ${open ? '<span class="cat">開いている旅行</span>' : ''}</div><div class="small">${esc(t.destination || '行き先未設定')}</div><div class="small">${esc(rangeText(t))}</div><div class="avatars">${t.members.map(avatar).join('')}</div></div>${trashBtn('delete-trip', t.id, '旅行を削除')}</div></div>`;
}

// 下のタブは、1つの旅行の中だけ(予定・行きたい・準備・旅行の設定)。一覧とアプリの設定は別の階層
// タブの線アイコン(絵文字ではなく、色と太さを揃えたSVG)
const tabIcon = (paths) => `<svg viewBox="0 0 24 24" aria-hidden="true">${paths}</svg>`;
const TABS = [
  ['schedule', tabIcon('<rect x="3.5" y="5" width="17" height="15.5" rx="3"/><path d="M3.5 10h17M8 3v4M16 3v4"/>'), '予定'],
  ['places', tabIcon('<path d="M12 20s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.4a4.3 4.3 0 0 1 7.5 2.4C19.5 15.4 12 20 12 20Z"/>'), '行きたい'],
  ['gear', tabIcon('<circle cx="12" cy="12" r="8.5"/><path d="M8.2 12.4l2.6 2.6 5-5.4"/>'), '準備'],
  ['tripsettings', tabIcon('<path d="M4 7h10M18 7h2M4 17h2M10 17h10"/><circle cx="16" cy="7" r="2"/><circle cx="8" cy="17" r="2"/>'), '旅行設定'],
];

// 下のタブ。画面を描き直しても残る要素(#navroot)に一度だけ入れ、選択の丸い「ガラス」を滑らせる
export function renderNavInner() {
  return `<span class="navglass" aria-hidden="true"></span>${TABS.map(([k, i, n]) => `<button data-tab="${k}" class="${state.tab === k ? 'active' : ''}" ${state.tab === k ? 'aria-current="page"' : ''}><span class="icon">${i}</span>${n}</button>`).join('')}`;
}

function tripHero(t) {
  return `<div class="hero"><div class="eyebrow">TRAVEL ITINERARY</div><h1>${esc(t.name)}</h1><p>${esc(t.destination || '行き先を決めよう')} ・ ${t.days}日間 ${t.date ? '・ ' + esc(t.date) + ' 出発' : ''}</p><div class="avatars">${t.members.map(avatar).join('')}</div></div>`;
}

export function renderScreen(t) {
  if (state.view === 'app') return renderAppPage();
  if (state.view === 'list' || !t) return renderList();
  const tab = state.tab;
  if (tab === 'tripsettings') return renderTripSettings(t);
  return tripHero(t) + { schedule: renderSchedule, places: renderPlaces, gear: renderGear }[tab](t);
}

function daytabs(t) {
  return `<div class="daytabs">${Array.from({ length: t.days }, (_, i) => i + 1).map((d) => `<button class="${state.activeDay === d ? 'active' : ''}" data-day="${d}"><b>DAY ${d}</b>${esc(dateTitle(t, d))}</button>`).join('')}</div>`;
}

// 旅行N日目が「今日」なら N、そうでなければ 0
function todayDayNumber(t) {
  const d0 = dayStart(t.date, 1);
  if (!d0) return 0;
  const n = Math.round((new Date().setHours(0, 0, 0, 0) - +d0) / 86400000) + 1;
  return n >= 1 && n <= t.days ? n : 0;
}

// 今日の予定のうち、いま進行中の(直近で始まった)予定のID
function currentStopId(stops) {
  const now = new Date();
  const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  let id = '';
  for (const s of stops) if (s.time <= hhmm && !s.done) id = s.id;
  return id;
}

const catChip = (label, cat) => `<span class="cat" data-cat="${esc(cat || '')}">${esc(label)}</span>`;
const thumb = (p) => (p.photo ? `<span class="thumb" style="background-image:url('${p.photo}')" role="img" aria-label="${esc(p.name)}の写真"></span>` : `<span class="emoji">${esc(placeEmoji(p))}</span>`);

function renderSchedule(t) {
  const stops = t.schedule.filter((s) => s.day === state.activeDay).sort((a, b) => a.time.localeCompare(b.time));
  const isToday = todayDayNumber(t) === state.activeDay;
  const nowId = isToday ? currentStopId(stops) : '';
  return `<div class="sectionactions"><div><h2 class="title">${isToday ? '今日の予定' : '旅のしおり'}</h2>${isToday ? `<div class="small" style="margin-top:-8px">${esc(dateTitle(t, state.activeDay))}</div>` : ''}</div><button class="btn tiny primary" data-action="edit-stop" data-id="">＋ 予定を追加</button></div>${daytabs(t)}
  ${stops.length ? `<div class="timeline">${stops.map((s) => renderStop(t, s, nowId)).join('')}<span class="liverider" hidden aria-hidden="true"></span></div>` : '<div class="empty"><strong>この日の予定はまだありません</strong>「予定を追加」から作るか、行きたい場所から予定に入れてね。</div>'}
  <button class="btn fill" data-action="edit-stop" data-id="">＋ ${state.activeDay}日目の予定を追加</button>`;
}

function renderStop(t, s, nowId) {
  return s.kind === 'move' ? renderMove(t, s, nowId) : renderPlaceStop(t, s, nowId);
}

function renderMove(t, s, nowId) {
  const mode = modeOf(s.mode);
  const times = s.endTime ? stopTimes(t.date, s.day, s.time, s.endTime) : null;
  const live = times ? `data-start="${times.start}" data-end="${times.end}"` : '';
  const hint = !s.endTime ? '到着時刻を入れると、時間に合わせて動きます' : !t.date ? '出発日を設定すると、当日に時間に合わせて動きます' : '';
  return `<div class="stop move ${s.done ? 'done' : ''} ${nowId === s.id ? 'now' : ''}" ${live} data-id="${esc(s.id)}" data-emoji="${esc(mode.emoji)}"><div class="time">${esc(s.time)}</div><div class="card">
    <div class="spread">${catChip(mode.emoji + ' ' + mode.label, 'move')}<span class="small">${s.optional ? '時間があれば　' : ''}</span>${penBtn('edit-stop', s.id, '予定を編集')}</div>
    <h3>${esc(s.title)}</h3><div class="small">${esc(s.time)}${s.endTime ? ' → ' + esc(s.endTime) : ''}</div>
    <div class="small trackstatus" data-status="${esc(s.id)}" aria-live="off">${esc(hint)}</div>
    ${s.note ? `<p class="small">${esc(s.note)}</p>` : ''}
    <div class="place-actions">${checkBtn('visit', s.id, s.done, '済み')}</div></div></div>`;
}

function renderPlaceStop(t, s, nowId) {
  const p = getPlace(t, s.placeId);
  const opts = s.options.map((id) => getPlace(t, id)).filter(Boolean);
  return `<div class="stop ${s.done ? 'done' : ''} ${nowId === s.id ? 'now' : ''}"><div class="time">${esc(s.time)}</div><div class="card"><div class="spread">${catChip(s.title, p?.cat)}<span class="small">${s.optional ? '時間があれば　' : ''}</span>${penBtn('edit-stop', s.id, '予定を編集')}</div>
  <div class="listrow stopplace">${s.emoji ? `<span class="emoji">${esc(s.emoji)}</span>` : p ? thumb(p) : '<span class="emoji">📍</span>'}<div class="fillspace">${p ? `<div class="tripname">${esc(p.name)}</div><div class="small">${ICON.pin} ${esc(p.region || p.location || 'エリア未設定')}</div>` : `<div class="tripname muted">場所は未定</div><div class="small">${opts.length ? '下の候補から選べます' : '編集から候補を選べます'}</div>`}</div></div>
  ${s.note ? `<p class="small">${esc(s.note)}</p>` : ''}
  ${opts.length > 1 || (opts.length === 1 && !s.placeId) ? `<div class="divider"></div><div class="group" style="margin:3px 0 8px">候補を選ぶ</div>${opts.map((o) => `<button class="rowbtn" data-action="choose" data-slot="${esc(s.id)}" data-place="${esc(o.id)}"><span>${s.placeId === o.id ? '✓ ' : ''}${esc(o.name)}</span><span>${s.placeId === o.id ? '決定中・もう一度押すと解除' : '選ぶ →'}</span></button>`).join('')}` : ''}
  <div class="place-actions">${checkBtn('visit', s.id, s.done, '行った')}${p ? `<button class="btn tiny primary navbtn" data-action="nav" data-id="${esc(p.id)}">${ICON.navigate} ナビ開始</button>` : ''}</div></div></div>`;
}

function renderPlaces(t) {
  const q = state.search.toLocaleLowerCase();
  const ALL = '♡ みんなの候補';
  const list = t.places.filter((p) => {
    const catOk = state.filter === 'すべて' || p.cat === state.filter || (state.filter === ALL && t.members.every((m) => p.votes[m.id]));
    return catOk && [p.name, p.region, p.memo, p.location].some((s) => String(s || '').toLocaleLowerCase().includes(q));
  });
  return `<div class="sectionactions"><h2 class="title">行きたい場所</h2><button class="btn tiny primary" data-action="edit-place">＋ 候補を追加</button></div>
  <input id="placeSearch" class="search" placeholder="店名・エリア・メモで検索" value="${esc(state.search)}" aria-label="候補を検索">
  <div class="filters">${['すべて', ...CATS, ALL].map((c) => `<button class="${state.filter === c ? 'active' : ''}" data-filter="${esc(c)}">${esc(c)}</button>`).join('')}</div>
  <div class="small">${list.length}件の候補</div>
  ${list.length ? list.slice(0, 200).map((p) => renderPlace(t, p)).join('') : '<div class="empty"><strong>条件に合う候補はありません</strong>検索条件を変更するか、候補を追加してね。</div>'}`;
}

function renderPlace(t, p) {
  return `<div class="card placecard"><div class="listrow">${thumb(p)}<div class="fillspace">${catChip(p.cat, p.cat)}<div class="tripname">${esc(p.name)}</div><div class="small">${ICON.pin} ${esc(p.region || 'エリア未設定')}</div></div>${penBtn('edit-place', p.id, '候補を編集')}</div>
  ${p.memo ? `<p class="memo">${esc(p.memo)}</p>` : ''}
  <div class="vote">${t.members.map((m) => { const on = !!p.votes[m.id]; const c = badgeColors(m.color); return `<button class="${on ? 'active' : ''}" style="${on ? `background:${c.bg};border-color:${c.border};color:${c.ink}` : ''}" data-action="vote" data-id="${esc(p.id)}" data-member="${esc(m.id)}" aria-pressed="${on}">${on ? '♥' : '♡'} ${esc(m.emoji)} ${esc(m.name)}</button>`; }).join('')}</div>
  <div class="place-actions"><button class="btn primary addbtn" data-action="add-place-to-day" data-id="${esc(p.id)}">＋ 予定に追加</button><button class="btn" data-action="nav" data-id="${esc(p.id)}" aria-label="ナビ">${ICON.navigate}</button></div></div>`;
}

function renderGear(t) {
  const tab = state.gearTab;
  const seg = `<div class="seg2" role="tablist">${[['list', '持ち物'], ['booking', '予約'], ['memo', 'メモ']].map(([k, n]) => `<button role="tab" aria-selected="${tab === k}" class="${tab === k ? 'active' : ''}" data-gear="${k}">${n}</button>`).join('')}</div>`;
  if (tab === 'memo') {
    return `<h2 class="title">準備とメモ</h2>${seg}
    <div class="card"><h3>旅行メモ</h3><p class="small">予約・営業時間・釣りの準備など。書いた内容はこの端末に自動保存します。</p><textarea class="field" id="tripNotes" maxlength="5000" aria-label="旅行メモ" placeholder="例：ホテルには15時までに車を預ける">${esc(t.notes)}</textarea><div class="counter" id="memoCount">${t.notes.length}/5000</div></div>`;
  }
  if (tab === 'booking') return renderBookings(t, seg);
  const done = t.checklist.filter((c) => c.done).length;
  return `<div class="sectionactions"><h2 class="title">準備とメモ</h2><button class="btn tiny primary" data-action="new-check">＋ 追加</button></div>${seg}
  <div class="card"><div class="spread"><h3>持ち物リスト</h3><span class="flex">${t.checklist.length ? `<span class="small">${done}/${t.checklist.length}</span>` : ''}${t.checklist.length > 1 ? `<button class="btn tiny ${state.reorder ? 'primary' : ''}" data-action="toggle-reorder">${state.reorder ? '完了' : '並べ替え'}</button>` : ''}</span></div>${t.checklist.length ? `<div class="meter" aria-hidden="true"><i style="width:${Math.round((done / t.checklist.length) * 100)}%"></i></div>` : ''}${state.reorder ? t.checklist.map((c, i) => `<div class="check reorder"><span class="fillspace">${esc(c.text)}</span><button class="iconbtn" data-action="move-check" data-id="${esc(c.id)}" data-dir="-1" aria-label="上へ" ${i === 0 ? 'disabled' : ''}>${ICON.up}</button><button class="iconbtn" data-action="move-check" data-id="${esc(c.id)}" data-dir="1" aria-label="下へ" ${i === t.checklist.length - 1 ? 'disabled' : ''}>${ICON.down}</button></div>`).join('') : t.checklist.length ? t.checklist.map((c) => `<label class="check ${c.done ? 'done' : ''}"><input type="checkbox" data-action="check" data-id="${esc(c.id)}" ${c.done ? 'checked' : ''}><span class="fillspace">${esc(c.text)}</span>${trashBtn('delete-check', c.id, '削除')}</label>`).join('') : '<p class="small">持ち物リストはまだありません。「＋ 追加」から入れてね。</p>'}</div>`;
}

function renderBookings(t, seg) {
  const list = [...t.bookings].sort((x, y) => (x.day || 99) - (y.day || 99) || x.time.localeCompare(y.time));
  const done = t.bookings.filter((b) => b.done).length;
  return `<div class="sectionactions"><h2 class="title">準備とメモ</h2><button class="btn tiny primary" data-action="edit-booking" data-id="">＋ 追加</button></div>${seg}
  <div class="card"><div class="spread"><h3>予約</h3>${t.bookings.length ? `<span class="small">${done}/${t.bookings.length} 予約済み</span>` : ''}</div>
  ${list.length ? list.map((b) => `<div class="listrow bookrow">${checkBtn('toggle-booking', b.id, b.done, '予約済み')}<div class="fillspace"><b>${esc(b.title)}</b><div class="small">${b.day ? esc(dateTitle(t, b.day)) : '日にち未定'}${b.time ? ' ' + esc(b.time) : ''}</div>${b.memo ? `<div class="memo">${esc(b.memo)}</div>` : ''}</div>${penBtn('edit-booking', b.id, '予約を編集')}</div>`).join('') : '<p class="small">宿・レストラン・チケットなどの予約をここにまとめられます。「＋ 追加」から入れてね。</p>'}</div>`;
}

function themeLabel(t) {
  const th = t.theme;
  if (th.mode === 'member') return `${getMember(t, th.memberId)?.name || ''}の色`;
  if (th.mode === 'duo') return `${t.members[0].name}と${t.members[1].name}の色`;
  if (th.mode === 'custom') return '好きな色';
  return 'アプリ共通の色';
}

// 設定タブ = 「この旅行の設定」+「アプリ全体の設定」
function renderTripSettings(t) {
  return `<h2 class="title">旅行の設定</h2>${tripSettings(t)}`;
}

function renderAppPage() {
  return `<h2 class="title">アプリの設定</h2>${appSettings()}`;
}

function tripSettings(t) {
  return `<div class="card"><div class="sectionactions"><h3>基本情報</h3>${penBtn('edit-trip', undefined, '旅行の基本情報を編集')}</div><p>行き先：${esc(t.destination || '未設定')}</p><p>出発日：${esc(t.date || '未定')}</p><p>日数：${t.days}日間</p></div>
  <div class="card"><div class="sectionactions"><h3>メンバー</h3>${t.members.length < COUPLE ? '<button class="btn tiny" data-action="edit-member" data-id="">＋ 追加</button>' : ''}</div>
  ${t.members.map((m) => `<div class="listrow memberrow">${avatar(m)}<div class="fillspace"><b>${esc(m.name)}</b><div class="small"><span class="dot" style="background:${esc(m.color)}"></span>${m.birthday ? '誕生日から色を設定' + (m.colorAuto ? '' : '(手動)') : '色を手動で設定'}</div></div>${penBtn('edit-member', m.id, `${m.name}を編集`)}</div>`).join('')}
  <p class="small">誕生日はこの端末にだけ保存します。</p></div>
  <div class="card"><div class="sectionactions"><h3>色と背景</h3>${penBtn('edit-theme', undefined, '色と背景を変える')}</div><p>色：${esc(themeLabel(t))}</p><p>背景：${esc(backgroundLabel(t.background))}</p></div>
  <div class="card"><h3>共有</h3><p class="small">共有用のファイルには、誕生日と写真が入りません。</p>
  <div class="place-actions"><button class="btn primary" data-action="share-trip" data-id="${esc(t.id)}">${ICON.share} AirDropなどで共有</button><button class="btn" data-action="copy-schedule">${ICON.copy} しおりをコピー</button></div></div>`;
}

function appSettings() {
  return `<div class="card"><h3>アプリの色</h3><p class="small">旅行で色を決めていないときの色です。</p>${swatches(state.settings.accent, 'app-color')}
    <div class="place-actions"><label class="btn tiny">好きな色 <input type="color" class="colorinput" data-action-input="app-color-custom" value="${esc(state.settings.accent)}" aria-label="好きな色を選ぶ"></label></div></div>
  <div class="card"><h3>バックアップ</h3><p class="small">機種変更や故障に備えて、ときどき保存してね(誕生日・写真も含む自分用)。</p>
  <div class="place-actions"><button class="btn" data-action="export-all">${ICON.download} すべての旅行を保存</button>${state.currentId ? `<button class="btn" data-action="export-trip" data-id="${esc(state.currentId)}">${ICON.download} この旅行だけ保存</button>` : ''}<button class="btn" data-action="import">${ICON.upload} 読み込む</button></div></div>
  ${storageNotice()}`;
}
