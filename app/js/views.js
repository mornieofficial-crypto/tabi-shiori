// 画面のHTMLを組み立てる(状態は変更しない)。ユーザー入力は必ず esc を通す。
import { esc } from './util.js';
import { CATS, CAT_EMOJI, COUPLE } from './model.js';
import { state, getPlace, getMember } from './state.js';
import { badgeColors, PRESET_COLORS } from './color.js';
import { modeOf, stopTimes, dayStart } from './transit.js';
import { backgroundLabel } from './backgrounds.js';

const placeEmoji = (p) => p.emoji || CAT_EMOJI[p.cat] || '📍';
// 編集はペンのアイコンだけにして、文字を減らす
const PEN = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>';
const penBtn = (action, id, label) => `<button class="iconbtn" data-action="${action}" ${id === undefined ? '' : `data-id="${esc(id)}" `}aria-label="${esc(label)}">${PEN}</button>`;
const chip = (t) => `<span class="chip">${esc(t)}</span>`;

export function avatar(m) {
  const c = badgeColors(m.color);
  return `<span class="avatar" style="background:${c.bg};border-color:${c.border}">${esc(m.emoji)}</span>`;
}

export function dateTitle(t, day) {
  if (!t.date) return `${day}日目`;
  const [y, m, d] = t.date.split('-').map(Number);
  const dt = new Date(y, m - 1, d + day - 1);
  return `${dt.getMonth() + 1}/${dt.getDate()}（${'日月火水木金土'[dt.getDay()]}）`;
}

export function renderHeadRight(trip) {
  // 旅行のタブにいるときだけ、いま開いている旅行名を出す(押すとホームで切り替え)
  return trip && state.tab !== 'home' ? `<button class="btn tiny tripswitch" data-tab="home" aria-label="旅行を切り替える">${esc(trip.name)} ▾</button>` : '';
}

// ホーム = 旅行の一覧だけ。アプリ全体の設定は「設定」タブへ
function renderHome() {
  const trips = state.trips;
  return `<div class="sectionactions"><h2 class="title">あなたの旅行</h2><div class="flex"><button class="btn tiny" data-action="import">↑ 読み込む</button><button class="btn tiny primary" data-action="new-trip">＋ 新しい旅行</button></div></div>
  ${trips.length ? trips.map(renderTripCard).join('') : '<div class="empty"><strong>旅行はまだありません</strong>最初の旅行を作るか、送られた旅行ファイルを読み込んでね。<div style="margin-top:14px"><button class="btn primary" data-action="new-trip">＋ 新しい旅行を作る</button></div></div>'}`;
}

function renderNoTrip() {
  return `<div class="empty" style="margin-top:24px"><strong>旅行を選んでください</strong><button class="btn primary" data-tab="home">ホームで旅行を選ぶ</button></div>`;
}

function storageNotice() {
  return state.persistent
    ? '<div class="notice">🔒 データはこの端末の中だけに保存します。別のスマホとは自動同期しません。</div>'
    : '<div class="notice warn">⚠️ この環境では端末への保存が使えません。このまま閉じるとデータが消えるので、こまめにバックアップを書き出してください。</div>';
}

function swatches(selected, action) {
  return `<div class="swatches" role="radiogroup" aria-label="色">${PRESET_COLORS.map((c) => `<button type="button" class="swatch ${c === selected ? 'on' : ''}" style="background:${c}" data-action="${action}" data-hex="${c}" role="radio" aria-checked="${c === selected}" aria-label="色 ${c}"></button>`).join('')}</div>`;
}

function renderTripCard(t) {
  const open = t.id === state.currentId;
  return `<div class="card ${open ? 'selected' : ''}"><div class="listrow"><span class="emoji">🗺️</span><div class="fillspace"><div class="tripname">${esc(t.name)} ${open ? '<span class="cat">開いている旅行</span>' : ''}</div><div class="small">${esc(t.destination || '行き先未設定')} ・ ${t.days}日間 ・ 候補${t.places.length}件</div><div class="avatars">${t.members.map(avatar).join('')}</div></div></div>
  <div class="place-actions"><button class="btn primary" data-action="open-trip" data-id="${esc(t.id)}">開く</button><button class="btn tiny danger" data-action="delete-trip" data-id="${esc(t.id)}">削除</button></div></div>`;
}

// 下のタブは、旅行を開いていなくても常に表示する(ホーム・しおり・行きたい・準備・設定)
const TABS = [['home', '🏠', 'ホーム'], ['schedule', '🗓', 'しおり'], ['places', '♡', '行きたい'], ['gear', '✓', '準備'], ['settings', '⚙️', '設定']];

function renderNav() {
  return `<nav class="nav" aria-label="メインメニュー">${TABS.map(([k, i, n]) => `<button data-tab="${k}" class="${state.tab === k ? 'active' : ''}" ${state.tab === k ? 'aria-current="page"' : ''}><span class="icon">${i}</span>${n}</button>`).join('')}</nav>`;
}

function tripHero(t) {
  return `<div class="hero"><div class="eyebrow">TRAVEL ITINERARY</div><h1>${esc(t.name)}</h1><p>${esc(t.destination || '行き先を決めよう')} ・ ${t.days}日間 ${t.date ? '・ ' + esc(t.date) + ' 出発' : ''}</p><div class="flex">${chip('行きたい候補 ' + t.places.length + '件')}${chip('予定 ' + t.schedule.length + '件')}<span class="avatars heroavatars">${t.members.map(avatar).join('')}</span></div></div>`;
}

export function renderScreen(t) {
  const tab = state.tab;
  let body;
  if (tab === 'home') body = renderHome();
  else if (tab === 'settings') body = renderSettings(t);
  else if (!t) body = renderNoTrip();
  else body = tripHero(t) + { schedule: renderSchedule, places: renderPlaces, gear: renderGear }[tab](t);
  return body + renderNav();
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
  ${stops.length ? `<div class="timeline">${stops.map((s) => renderStop(t, s, nowId)).join('')}</div>` : '<div class="empty"><strong>この日の予定はまだありません</strong>「予定を追加」から作るか、行きたい場所から予定に入れてね。</div>'}
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
  return `<div class="stop move ${s.done ? 'done' : ''} ${nowId === s.id ? 'now' : ''}"><div class="time">${esc(s.time)}</div><div class="card">
    <div class="spread">${catChip(mode.emoji + ' ' + mode.label, 'move')}<span class="small">${s.optional ? '時間があれば　' : ''}</span>${penBtn('edit-stop', s.id, '予定を編集')}</div>
    <h3>${esc(s.title)}</h3><div class="small">${esc(s.time)}${s.endTime ? ' → ' + esc(s.endTime) : ''}</div>
    <div class="track" ${live} data-id="${esc(s.id)}" aria-hidden="true"><div class="rail"></div><span class="rider ${mode.flip ? 'flip' : ''}">${esc(mode.emoji)}</span></div>
    <div class="small trackstatus" data-status="${esc(s.id)}" aria-live="off">${esc(hint)}</div>
    ${s.note ? `<p class="small">${esc(s.note)}</p>` : ''}
    <div class="place-actions"><button class="btn tiny" data-action="visit" data-id="${esc(s.id)}">${s.done ? '✓ 済み' : '□ 済み'}</button></div></div></div>`;
}

function renderPlaceStop(t, s, nowId) {
  const p = getPlace(t, s.placeId);
  const opts = s.options.map((id) => getPlace(t, id)).filter(Boolean);
  return `<div class="stop ${s.done ? 'done' : ''} ${nowId === s.id ? 'now' : ''}"><div class="time">${esc(s.time)}</div><div class="card"><div class="spread">${catChip(s.title, p?.cat)}<span class="small">${s.optional ? '時間があれば　' : ''}</span>${penBtn('edit-stop', s.id, '予定を編集')}</div>
  ${p ? `<div class="listrow stopplace">${thumb(p)}<div class="fillspace"><div class="tripname">${esc(p.name)}</div><div class="small">📍 ${esc(p.region || p.location || 'エリア未設定')}</div></div></div>` : '<div class="small" style="margin-top:8px">候補から選択してください</div>'}
  ${s.note ? `<p class="small">${esc(s.note)}</p>` : ''}
  ${opts.length > 1 ? `<div class="divider"></div><div class="group" style="margin:3px 0 8px">候補を選ぶ</div>${opts.map((o) => `<button class="rowbtn" data-action="choose" data-slot="${esc(s.id)}" data-place="${esc(o.id)}"><span>${s.placeId === o.id ? '✓ ' : ''}${esc(o.name)}</span><span>${s.placeId === o.id ? '決定中' : '選ぶ →'}</span></button>`).join('')}` : ''}
  <div class="place-actions"><button class="btn tiny" data-action="visit" data-id="${esc(s.id)}">${s.done ? '✓ 行った' : '□ 行った'}</button>${p ? `<button class="btn tiny primary navbtn" data-action="nav" data-id="${esc(p.id)}">🚗 ナビ開始</button>` : ''}</div></div></div>`;
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
  return `<div class="card placecard"><div class="listrow">${thumb(p)}<div class="fillspace">${catChip(p.cat, p.cat)}<div class="tripname">${esc(p.name)}</div><div class="small">📍 ${esc(p.region || 'エリア未設定')}</div></div>${penBtn('edit-place', p.id, '候補を編集')}</div>
  ${p.memo ? `<p class="memo">${esc(p.memo)}</p>` : ''}
  <div class="vote">${t.members.map((m) => { const on = !!p.votes[m.id]; const c = badgeColors(m.color); return `<button class="${on ? 'active' : ''}" style="${on ? `background:${c.bg};border-color:${c.border};color:${c.ink}` : ''}" data-action="vote" data-id="${esc(p.id)}" data-member="${esc(m.id)}" aria-pressed="${on}">${on ? '♥' : '♡'} ${esc(m.emoji)} ${esc(m.name)}</button>`; }).join('')}</div>
  <div class="place-actions"><button class="btn primary addbtn" data-action="add-place-to-day" data-id="${esc(p.id)}">＋ 予定に追加</button><button class="btn" data-action="nav" data-id="${esc(p.id)}" aria-label="ナビ">🚗</button></div></div>`;
}

function renderGear(t) {
  const memo = state.gearTab === 'memo';
  const seg = `<div class="seg2" role="tablist"><button role="tab" aria-selected="${!memo}" class="${memo ? '' : 'active'}" data-gear="list">✓ 持ち物</button><button role="tab" aria-selected="${memo}" class="${memo ? 'active' : ''}" data-gear="memo">📝 メモ</button></div>`;
  if (memo) {
    return `<h2 class="title">準備とメモ</h2>${seg}
    <div class="card"><h3>旅行メモ</h3><p class="small">予約・営業時間・釣りの準備など。書いた内容はこの端末に自動保存します。</p><textarea class="field" id="tripNotes" maxlength="5000" aria-label="旅行メモ" placeholder="例：ホテルには15時までに車を預ける">${esc(t.notes)}</textarea><div class="counter" id="memoCount">${t.notes.length}/5000</div></div>`;
  }
  const done = t.checklist.filter((c) => c.done).length;
  return `<div class="sectionactions"><h2 class="title">準備とメモ</h2><button class="btn tiny primary" data-action="new-check">＋ 追加</button></div>${seg}
  <div class="card"><div class="spread"><h3>持ち物リスト</h3>${t.checklist.length ? `<span class="small">${done}/${t.checklist.length} 準備OK</span>` : ''}</div>${t.checklist.length ? `<div class="meter" aria-hidden="true"><i style="width:${Math.round((done / t.checklist.length) * 100)}%"></i></div>` : ''}${t.checklist.length ? t.checklist.map((c) => `<label class="check ${c.done ? 'done' : ''}"><input type="checkbox" data-action="check" data-id="${esc(c.id)}" ${c.done ? 'checked' : ''}><span class="fillspace">${esc(c.text)}</span><button class="btn tiny muted" type="button" data-action="delete-check" data-id="${esc(c.id)}">削除</button></label>`).join('') : '<p class="small">持ち物リストはまだありません。「＋ 追加」から入れてね。</p>'}</div>`;
}

function themeLabel(t) {
  const th = t.theme;
  if (th.mode === 'member') return `${getMember(t, th.memberId)?.name || ''}の色`;
  if (th.mode === 'duo') return `${t.members[0].name}と${t.members[1].name}の色`;
  if (th.mode === 'custom') return '好きな色';
  return 'アプリ共通の色';
}

// 設定タブ = 「この旅行の設定」+「アプリ全体の設定」
function renderSettings(t) {
  return `<h2 class="title">設定</h2>${t ? tripSettings(t) : ''}${appSettings()}`;
}

function tripSettings(t) {
  return `<div class="group">この旅行「${esc(t.name)}」</div>
  <div class="card"><div class="sectionactions"><h3>基本情報</h3>${penBtn('edit-trip', undefined, '旅行の基本情報を編集')}</div><p>行き先：${esc(t.destination || '未設定')}</p><p>出発日：${esc(t.date || '未定')}</p><p>日数：${t.days}日間</p></div>
  <div class="card"><div class="sectionactions"><h3>メンバー</h3>${t.members.length < COUPLE ? '<button class="btn tiny" data-action="edit-member" data-id="">＋ 追加</button>' : ''}</div>
  ${t.members.map((m) => `<div class="listrow memberrow">${avatar(m)}<div class="fillspace"><b>${esc(m.name)}</b><div class="small"><span class="dot" style="background:${esc(m.color)}"></span>${m.birthday ? '誕生日から色を設定' + (m.colorAuto ? '' : '(手動)') : '色を手動で設定'}</div></div>${penBtn('edit-member', m.id, `${m.name}を編集`)}</div>`).join('')}
  <p class="small">誕生日はこの端末にだけ保存します。</p></div>
  <div class="card"><div class="sectionactions"><h3>色と背景</h3>${penBtn('edit-theme', undefined, '色と背景を変える')}</div><p>色：${esc(themeLabel(t))}</p><p>背景：${esc(backgroundLabel(t.background))}</p></div>
  <div class="card"><h3>共有</h3><p class="small">共有用のファイルには、誕生日と写真が入りません。</p>
  <div class="place-actions"><button class="btn primary" data-action="share-trip" data-id="${esc(t.id)}">📲 AirDropなどで共有</button><button class="btn" data-action="copy-schedule">📋 しおりをコピー</button></div></div>`;
}

function appSettings() {
  return `<div class="group">アプリ</div>
  <div class="card"><h3>アプリの色</h3><p class="small">旅行で色を決めていないときの色です。</p>${swatches(state.settings.accent, 'app-color')}
    <div class="place-actions"><label class="btn tiny">好きな色 <input type="color" class="colorinput" data-action-input="app-color-custom" value="${esc(state.settings.accent)}" aria-label="好きな色を選ぶ"></label></div></div>
  <div class="card"><h3>バックアップ</h3><p class="small">機種変更や故障に備えて、ときどき保存してね(誕生日・写真も含む自分用)。</p>
  <div class="place-actions"><button class="btn" data-action="export-all">↓ すべての旅行を保存</button>${state.currentId ? `<button class="btn" data-action="export-trip" data-id="${esc(state.currentId)}">↓ この旅行だけ保存</button>` : ''}<button class="btn" data-action="import">↑ 読み込む</button></div></div>
  ${storageNotice()}`;
}
