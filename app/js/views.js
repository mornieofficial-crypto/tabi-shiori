// 画面のHTMLを組み立てる(状態は変更しない)。ユーザー入力は必ず esc を通す。
import { esc } from './util.js';
import { CATS, CAT_EMOJI, COUPLE } from './model.js';
import { state, getPlace, getMember } from './state.js';
import { badgeColors, PRESET_COLORS } from './color.js';
import { modeOf, stopTimes } from './transit.js';

const placeEmoji = (p) => p.emoji || CAT_EMOJI[p.cat] || '📍';
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
  return trip ? '<button class="btn tiny" data-action="trips">← 旅行一覧</button>' : '';
}

export function renderHome() {
  const trips = state.trips;
  return `<div class="hero"><div class="eyebrow">YOUR JOURNEY, YOUR CHOICE.</div><h1>行きたい場所から、<br>旅をつくろう。</h1><p>候補を集めて、みんなで選んで、決まったらしおりに。旅行当日の予定もここで。</p><button class="btn light" data-action="new-trip">＋ 新しい旅行を作る</button></div>
  <div class="sectionactions"><h2 class="title">あなたの旅行</h2><button class="btn tiny" data-action="import">↑ 読み込む</button></div>
  ${trips.length ? trips.map(renderTripCard).join('') : '<div class="empty"><strong>旅行はまだありません</strong>最初の旅行を作るか、送られた旅行ファイルを読み込んでね。</div>'}
  <div class="card"><h3>アプリの色</h3><p class="small">旅行ごとに別の色にもできます(旅行の設定から)。</p>${swatches(state.settings.accent, 'app-color')}
    <div class="place-actions"><label class="btn tiny">好きな色 <input type="color" class="colorinput" data-action-input="app-color-custom" value="${esc(state.settings.accent)}" aria-label="好きな色を選ぶ"></label></div></div>
  ${trips.length ? '<div class="card"><h3>バックアップ</h3><p class="small">すべての旅行を1つのファイルに保存します(誕生日も含む自分用)。機種変更や故障に備えて、ときどき保存してね。</p><div class="place-actions"><button class="btn" data-action="export-all">↓ すべてバックアップ</button></div></div>' : ''}
  ${storageNotice()}`;
}

function storageNotice() {
  return state.persistent
    ? '<div class="notice">🔒 データはこの端末の中だけに保存します。他の人に見られることはありませんが、別のスマホとは自動同期しません。</div>'
    : '<div class="notice warn">⚠️ この環境では端末への保存が使えません。このまま閉じるとデータが消えるので、こまめに「保存用データ」を書き出してください。</div>';
}

function swatches(selected, action) {
  return `<div class="swatches" role="radiogroup" aria-label="色">${PRESET_COLORS.map((c) => `<button type="button" class="swatch ${c === selected ? 'on' : ''}" style="background:${c}" data-action="${action}" data-hex="${c}" role="radio" aria-checked="${c === selected}" aria-label="色 ${c}"></button>`).join('')}</div>`;
}

function renderTripCard(t) {
  return `<div class="card"><div class="listrow"><span class="emoji">🗺️</span><div class="fillspace"><div class="tripname">${esc(t.name)}</div><div class="small">${esc(t.destination || '行き先未設定')} ・ ${t.days}日間 ・ 候補${t.places.length}件</div><div class="avatars">${t.members.map(avatar).join('')}</div></div></div>
  <div class="place-actions"><button class="btn primary" data-action="open-trip" data-id="${esc(t.id)}">開く ↗</button><button class="btn tiny muted" data-action="export-trip" data-id="${esc(t.id)}">保存用データ</button><button class="btn tiny danger" data-action="delete-trip" data-id="${esc(t.id)}">削除</button></div></div>`;
}

const TABS = [['schedule', '🗓', 'しおり'], ['places', '♡', '行きたい'], ['gear', '✓', '準備'], ['settings', '⚙️', '設定']];

export function renderTrip(t) {
  const body = { schedule: renderSchedule, places: renderPlaces, gear: renderGear, settings: renderSettings }[state.tab](t);
  return `<div class="hero"><div class="eyebrow">TRAVEL ITINERARY</div><h1>${esc(t.name)}</h1><p>${esc(t.destination || '行き先を決めよう')} ・ ${t.days}日間 ${t.date ? '・ ' + esc(t.date) + ' 出発' : ''}</p><div class="flex">${chip('行きたい候補 ' + t.places.length + '件')}${chip('予定 ' + t.schedule.length + '件')}</div></div>
  <div class="nav" aria-label="旅行内メニュー">${TABS.map(([k, i, n]) => `<button data-tab="${k}" class="${state.tab === k ? 'active' : ''}" ${state.tab === k ? 'aria-current="page"' : ''}><span class="icon">${i}</span>${n}</button>`).join('')}</div>${body}`;
}

function daytabs(t) {
  return `<div class="daytabs">${Array.from({ length: t.days }, (_, i) => i + 1).map((d) => `<button class="${state.activeDay === d ? 'active' : ''}" data-day="${d}"><b>DAY ${d}</b>${esc(dateTitle(t, d))}</button>`).join('')}</div>`;
}

function renderSchedule(t) {
  const stops = t.schedule.filter((s) => s.day === state.activeDay).sort((a, b) => a.time.localeCompare(b.time));
  return `<div class="sectionactions"><h2 class="title">旅のしおり</h2><button class="btn tiny primary" data-action="edit-stop" data-id="">＋ 予定を追加</button></div>${daytabs(t)}
  <div class="notice">決めきれない場所は候補のままでOK。あとから自由に選び直せるよ。</div>
  ${stops.length ? `<div class="timeline">${stops.map((s) => renderStop(t, s)).join('')}</div>` : '<div class="empty"><strong>この日の予定はまだありません</strong>「予定を追加」から作るか、行きたい場所から予定に入れてね。</div>'}
  <button class="btn fill" data-action="edit-stop" data-id="">＋ ${state.activeDay}日目の予定を追加</button>`;
}

function renderStop(t, s) {
  return s.kind === 'move' ? renderMove(t, s) : renderPlaceStop(t, s);
}

function renderMove(t, s) {
  const mode = modeOf(s.mode);
  const times = s.endTime ? stopTimes(t.date, s.day, s.time, s.endTime) : null;
  const live = times ? `data-start="${times.start}" data-end="${times.end}"` : '';
  const hint = !s.endTime ? '到着時刻を入れると、時間に合わせて動きます' : !t.date ? '出発日を設定すると、当日に時間に合わせて動きます' : '';
  return `<div class="stop move ${s.done ? 'done' : ''}"><div class="time">${esc(s.time)}</div><div class="card">
    <div class="spread"><span class="small">${s.optional ? '時間があれば' : ''}</span><button class="btn tiny muted" data-action="edit-stop" data-id="${esc(s.id)}">編集</button></div>
    <h3>${esc(s.title)}</h3><div class="small">${esc(s.time)}${s.endTime ? ' → ' + esc(s.endTime) : ''} ・ ${esc(mode.label)}</div>
    <div class="track" ${live} data-id="${esc(s.id)}" aria-hidden="true"><div class="rail"></div><span class="rider ${mode.flip ? 'flip' : ''}">${esc(mode.emoji)}</span></div>
    <div class="small trackstatus" data-status="${esc(s.id)}" aria-live="off">${esc(hint)}</div>
    ${s.note ? `<p class="small">${esc(s.note)}</p>` : ''}
    <div class="place-actions"><button class="btn tiny" data-action="visit" data-id="${esc(s.id)}">${s.done ? '✓ 済み' : '□ 済み'}</button></div></div></div>`;
}

function renderPlaceStop(t, s) {
  const p = getPlace(t, s.placeId);
  const opts = s.options.map((id) => getPlace(t, id)).filter(Boolean);
  return `<div class="stop ${s.done ? 'done' : ''}"><div class="time">${esc(s.time)}</div><div class="card"><div class="spread"><span class="small">${s.optional ? '時間があれば' : ''}</span><button class="btn tiny muted" data-action="edit-stop" data-id="${esc(s.id)}">編集</button></div><h3>${esc(s.title)}</h3>
  ${p ? `<div class="listrow"><span class="emoji">${esc(placeEmoji(p))}</span><div class="fillspace"><b>${esc(p.name)}</b><div class="small">${esc(p.region || p.location || '')}</div></div></div>` : '<div class="small">候補から選択してください</div>'}
  ${s.note ? `<p class="small">${esc(s.note)}</p>` : ''}
  ${opts.length > 1 ? `<div class="divider"></div><div class="group" style="margin:3px 0 8px">候補を選ぶ</div>${opts.map((o) => `<button class="rowbtn" data-action="choose" data-slot="${esc(s.id)}" data-place="${esc(o.id)}"><span>${s.placeId === o.id ? '✓ ' : ''}${esc(o.name)}</span><span>${s.placeId === o.id ? '決定中' : '選ぶ →'}</span></button>`).join('')}` : ''}
  <div class="place-actions"><button class="btn tiny" data-action="visit" data-id="${esc(s.id)}">${s.done ? '✓ 行った' : '□ 行った'}</button>${p ? `<button class="btn tiny" data-action="nav" data-id="${esc(p.id)}">↗ ナビ</button>` : ''}</div></div></div>`;
}

function renderPlaces(t) {
  const q = state.search.toLocaleLowerCase();
  const ALL = '♡ みんなの候補';
  const list = t.places.filter((p) => {
    const catOk = state.filter === 'すべて' || p.cat === state.filter || (state.filter === ALL && t.members.every((m) => p.votes[m.id]));
    return catOk && [p.name, p.region, p.memo, p.location].some((s) => String(s || '').toLocaleLowerCase().includes(q));
  });
  return `<div class="sectionactions"><h2 class="title">行きたい場所</h2><button class="btn tiny primary" data-action="edit-place">＋ 候補を追加</button></div>
  <p class="small">気になる場所にそれぞれ♡を付けて比較。決まった場所はしおりへ追加できるよ。</p>
  <input id="placeSearch" class="search" placeholder="店名・エリア・メモで検索" value="${esc(state.search)}" aria-label="候補を検索">
  <div class="filters">${['すべて', ...CATS, ALL].map((c) => `<button class="${state.filter === c ? 'active' : ''}" data-filter="${esc(c)}">${esc(c)}</button>`).join('')}</div>
  <div class="small">${list.length}件の候補</div>
  ${list.length ? list.slice(0, 200).map((p) => renderPlace(t, p)).join('') : '<div class="empty"><strong>条件に合う候補はありません</strong>検索条件を変更するか、候補を追加してね。</div>'}`;
}

function renderPlace(t, p) {
  return `<div class="card"><div class="listrow"><span class="emoji">${esc(placeEmoji(p))}</span><div class="fillspace"><div class="tripname">${esc(p.name)}</div><div class="small">${esc(p.region || 'エリア未設定')} ・ ${esc(p.cat)}</div></div><button class="btn tiny muted" data-action="edit-place" data-id="${esc(p.id)}">編集</button></div>
  ${p.memo ? `<p>${esc(p.memo)}</p>` : ''}
  <div class="vote">${t.members.map((m) => { const on = !!p.votes[m.id]; const c = badgeColors(m.color); return `<button class="${on ? 'active' : ''}" style="${on ? `background:${c.bg};border-color:${c.border};color:${c.ink}` : ''}" data-action="vote" data-id="${esc(p.id)}" data-member="${esc(m.id)}" aria-pressed="${on}">${on ? '♥' : '♡'} ${esc(m.emoji)} ${esc(m.name)}</button>`; }).join('')}</div>
  <div class="place-actions"><button class="btn tiny primary" data-action="add-place-to-day" data-id="${esc(p.id)}">＋ 予定に入れる</button><button class="btn tiny" data-action="nav" data-id="${esc(p.id)}">↗ ナビ</button></div></div>`;
}

function renderGear(t) {
  return `<div class="sectionactions"><h2 class="title">準備とメモ</h2><button class="btn tiny" data-action="new-check">＋ 持ち物を追加</button></div>
  <div class="card"><h3>出発までに準備すること</h3>${t.checklist.length ? t.checklist.map((c) => `<label class="check ${c.done ? 'done' : ''}"><input type="checkbox" data-action="check" data-id="${esc(c.id)}" ${c.done ? 'checked' : ''}><span class="fillspace">${esc(c.text)}</span><button class="btn tiny muted" type="button" data-action="delete-check" data-id="${esc(c.id)}">削除</button></label>`).join('') : '<p class="small">持ち物リストはまだありません。</p>'}</div>
  <div class="card"><h3>旅行メモ</h3><p class="small">予約・営業時間・釣りの準備など。書いた内容はこの端末に自動保存します。</p><textarea class="field" id="tripNotes" maxlength="5000" aria-label="旅行メモ" placeholder="例：ホテルには15時までに車を預ける">${esc(t.notes)}</textarea></div>`;
}

function themeLabel(t) {
  const th = t.theme;
  if (th.mode === 'member') return `${getMember(t, th.memberId)?.name || ''}の色`;
  if (th.mode === 'duo') return `${t.members[0].name}と${t.members[1].name}の色`;
  if (th.mode === 'custom') return '好きな色';
  return 'アプリ共通の色';
}

function renderSettings(t) {
  return `<h2 class="title">旅行の設定</h2>
  <div class="card"><div class="sectionactions"><h3>基本情報</h3><button class="btn tiny" data-action="edit-trip">編集する</button></div><p>旅行名：<b>${esc(t.name)}</b></p><p>行き先：${esc(t.destination || '未設定')}</p><p>出発日：${esc(t.date || '未定')}</p><p>日数：${t.days}日間</p></div>
  <div class="card"><div class="sectionactions"><h3>メンバー</h3>${t.members.length < COUPLE ? '<button class="btn tiny" data-action="edit-member" data-id="">＋ 追加</button>' : ''}</div>
  ${t.members.map((m) => `<div class="listrow memberrow">${avatar(m)}<div class="fillspace"><b>${esc(m.name)}</b><div class="small"><span class="dot" style="background:${esc(m.color)}"></span>${m.birthday ? '誕生日から色を設定' + (m.colorAuto ? '' : '(手動)') : '色を手動で設定'}</div></div><button class="btn tiny muted" data-action="edit-member" data-id="${esc(m.id)}">編集</button></div>`).join('')}
  <p class="small">誕生日はこの端末にだけ保存します。同行者に渡すファイルには「色」だけが入ります。</p></div>
  <div class="card"><div class="sectionactions"><h3>この旅行の色</h3><button class="btn tiny" data-action="edit-theme">変える</button></div><p>${esc(themeLabel(t))}</p></div>
  <div class="card"><h3>共有とバックアップ</h3><p class="small">「共有」を押すと、AirDrop・メッセージ・ファイルへの保存などを選べます。共有用のファイルには誕生日が入りません。自分用には「バックアップ用で保存」を使ってね。</p>
  <div class="place-actions"><button class="btn primary" data-action="share-trip" data-id="${esc(t.id)}">📲 AirDropなどで共有</button><button class="btn" data-action="export-trip" data-id="${esc(t.id)}">↓ バックアップ用で保存</button><button class="btn" data-action="import">↑ 読み込む</button><button class="btn" data-action="copy-schedule">📋 しおりをコピー</button></div>
  <div class="notice warn">いまは端末内だけの保存です。リアルタイムの共同編集は今後追加予定で、そのときも内容は暗号化して送る設計です。</div></div>
  <div class="card"><h3>ナビについて</h3><p class="small">場所ごとの「ナビ」ボタンから、Yahoo!カーナビ・Yahoo!マップ・Appleマップを選べます。住所だけの場所は、先にYahoo!マップで位置を確認してから出発してね。</p></div>
  ${storageNotice()}`;
}
