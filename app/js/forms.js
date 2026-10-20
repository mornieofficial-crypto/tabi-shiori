// 入力フォーム(モーダル)。保存時は model.js の正規化を通す。
import { esc, uid, isDateStr, isTimeStr } from './util.js';
import { CATS, CAT_EMOJI, ACTIONS, LIMITS, COUPLE, newTrip, normalizeMember } from './model.js';
import { state, hooks, touch, addTrip, getPlace, getMember, saveSettings } from './state.js';
import { birthdayColor, isHex } from './color.js';
import { MODES, toMinutes, fromMinutes } from './transit.js';
import { navTargets } from './nav.js';
import { openModal, closeModal, toast, emojiField, formVal, formInt, resizeImage } from './ui.js';
import { avatar, placeEmoji } from './views.js';
import { ICON } from './icons.js';
import { peekLink, joinTrip } from './sync.js';
import { BACKGROUNDS, BACKGROUND_IDS, isPhoto, PLACE_PHOTO_MAX_LENGTH } from './backgrounds.js';

const err = (form, msg) => {
  // エラー欄は、保存ボタンの近く(モーダルの上部)に移してあるので、モーダル全体から探す
  const el = (form.closest('.modal') || form).querySelector('.formerror');
  if (el) {
    el.textContent = msg;
    el.hidden = !msg;
    if (msg) el.scrollIntoView({ block: 'nearest' });
  }
  return false;
};
const actions = (cancel = '閉じる', submit = '保存', extra = '') =>
  `<div class="formerror" role="alert" hidden></div><div class="modalactions">${extra}<button type="button" class="btn" data-action="close">${cancel}</button><button type="submit" class="btn primary">${submit}</button></div>`;
const item = (label, inner, id = '') => `<div class="formitem"><label ${id ? `for="${id}"` : ''}>${label}</label>${inner}</div>`;

export function tripForm(t) {
  const editing = !!t;
  const prof = state.settings.profile;
  const person = (i, v) => item(`参加者${i + 1}`, `<input class="field" name="p${i}" maxlength="40" value="${esc(v)}">`);
  openModal(
    `<form id="modalForm"><h2>${editing ? '旅行を編集' : '新しい旅行を作る'}</h2><div class="formgrid">
    ${item('旅行名 *', `<input class="field" name="name" required maxlength="70" value="${esc(t?.name || '')}" placeholder="例：京都の週末旅行">`)}
    ${item('行き先', `<input class="field" name="destination" maxlength="100" value="${esc(t?.destination || '')}" placeholder="例：京都・宇治">`)}
    ${item('出発日（未定でもOK）', `<input class="field" type="date" name="date" value="${esc(t?.date || '')}">`)}
    ${item('何日間？', `<input class="field" type="number" name="days" min="1" max="${LIMITS.days}" value="${t?.days || 3}">`)}
    ${editing ? '' : person(0, prof[0]?.name || 'わたし') + person(1, prof[1]?.name || '同行者')}
    </div>${actions(editing ? 'キャンセル' : 'キャンセル', editing ? '保存' : '旅行を作る')}</form>`,
    (f, form) => {
      const name = formVal(f, 'name');
      if (!name) return err(form, '旅行名を入れてください');
      const date = formVal(f, 'date');
      if (date && !isDateStr(date)) return err(form, '出発日の形式が正しくありません');
      const days = formInt(f, 'days', 1, LIMITS.days, 3);
      if (editing) {
        Object.assign(t, { name, destination: formVal(f, 'destination'), date, days });
        for (const s of t.schedule) s.day = Math.min(s.day, days);
        if (state.activeDay > days) state.activeDay = days;
        touch(t);
      } else {
        const trip = newTrip({ name, destination: formVal(f, 'destination'), date, days, members: [0, 1].map((i) => {
          // ふたりのプロフィールがあれば、アイコン・誕生日・色も引き継ぐ(名前は、この画面で変えた内容を優先)
          const p = prof[i];
          const base = p ? { emoji: p.emoji, birthday: p.birthday, color: p.color, colorAuto: p.colorAuto } : {};
          return { ...base, name: formVal(f, 'p' + i) || p?.name || (i === 0 ? 'わたし' : '同行者') };
        }),
      });
        state.tab = 'schedule';
        state.view = 'trip';
        state.activeDay = 1;
        addTrip(trip);
      }
      hooks.render();
    },
  );
}

const monthOpts = (sel) => `<option value="">--</option>${Array.from({ length: 12 }, (_, i) => `<option value="${i + 1}" ${sel === i + 1 ? 'selected' : ''}>${i + 1}月</option>`).join('')}`;
const dayOpts = (sel) => `<option value="">--</option>${Array.from({ length: 31 }, (_, i) => `<option value="${i + 1}" ${sel === i + 1 ? 'selected' : ''}>${i + 1}日</option>`).join('')}`;

export function memberForm(t, m, onDelete, opts = {}) {
  const profileIndex = opts.profile; // 数字ならプロフィールの編集(旅行ではなく、アプリの設定に保存する)
  const isProfile = Number.isInteger(profileIndex);
  const editing = !!m;
  const bd = /^(\d{2})-(\d{2})$/.exec(m?.birthday || '');
  const color = m?.color || '#3b6ea5';
  openModal(
    `<form id="modalForm"><h2>${isProfile ? `ふたりのプロフィール(${profileIndex + 1}人目)` : editing ? 'メンバーを編集' : 'メンバーを追加'}</h2><div class="formgrid">
    ${item('名前 *', `<input class="field" name="name" required maxlength="40" value="${esc(m?.name || '')}">`)}
    ${item('アイコン', emojiField('emoji', m?.emoji || '🐻', { label: 'アイコン' }))}
    ${item('誕生日（任意・この端末にだけ保存）', `<div class="flex"><select class="field half" name="bm" aria-label="月">${monthOpts(bd ? +bd[1] : 0)}</select><select class="field half" name="bd" aria-label="日">${dayOpts(bd ? +bd[2] : 0)}</select></div>`)}
    <label class="check inline"><input type="checkbox" name="auto" ${!m?.birthday || m.colorAuto ? 'checked' : ''}><span>誕生日から色を自動で決める</span></label>
    ${item('色', `<div class="flex"><input type="color" class="colorinput big" name="color" value="${esc(color)}" aria-label="色"><span id="colorHint" class="small"></span></div>`)}
    </div>${actions('キャンセル', '保存', !isProfile && editing && t.members.length > COUPLE ? '<button type="button" class="btn danger" data-action="remove-member-confirm">削除</button>' : '')}</form>`,
    (f, form) => {
      const name = formVal(f, 'name');
      if (!name) return err(form, '名前を入れてください');
      const bm = formVal(f, 'bm');
      const bdv = formVal(f, 'bd');
      if (!!bm !== !!bdv) return err(form, '誕生日は月と日の両方を選んでください');
      const birthday = bm ? `${bm.padStart(2, '0')}-${bdv.padStart(2, '0')}` : '';
      if (birthday && !birthdayColor(birthday)) return err(form, 'その日付は存在しません');
      const auto = !!f.get('auto') && !!birthday;
      const raw = { id: m?.id, name, emoji: formVal(f, 'emoji'), birthday, colorAuto: auto, color: formVal(f, 'color') };
      if (!auto && !isHex(raw.color)) return err(form, '色が正しくありません');
      if (isProfile) {
        const next = normalizeMember({ ...raw, id: 'profile' + profileIndex }, profileIndex);
        const list = [...state.settings.profile];
        // 1人目だけ決めた場合は、2人目に、初期の名前を入れておく
        while (list.length < profileIndex) list.push(normalizeMember({ id: 'profile' + list.length }, list.length));
        list[profileIndex] = next;
        state.settings.profile = list;
        saveSettings();
        hooks.render();
        return;
      }
      const used = new Set(t.members.filter((x) => x !== m).map((x) => x.id));
      const next = normalizeMember(raw, editing ? t.members.indexOf(m) : t.members.length, used);
      if (editing) Object.assign(m, next);
      else t.members.push(next);
      touch(t);
      hooks.render();
    },
  );
  const form = document.getElementById('modalForm');
  const sync = () => {
    const el = form.elements;
    const bmv = el.bm.value;
    const bdv = el.bd.value;
    const c = bmv && bdv ? birthdayColor(`${bmv.padStart(2, '0')}-${bdv.padStart(2, '0')}`) : null;
    const auto = !!(c && el.auto.checked);
    form.querySelector('#colorHint').textContent = auto ? '誕生日から自動で決まります' : '';
    if (auto) el.color.value = c;
    el.color.style.opacity = auto ? '.5' : '';
  };
  form.addEventListener('change', sync);
  sync();
  form.querySelector('[data-action="remove-member-confirm"]')?.addEventListener('click', () => {
    closeModal();
    onDelete(m);
  });
}

export function placeForm(t, p) {
  const editing = !!p;
  let photo = p?.photo || '';
  openModal(
    `<form id="modalForm"><h2>${editing ? '候補を編集' : '行きたい場所を追加'}</h2><div class="formgrid">
    ${item('名前 *', `<input class="field" name="name" required maxlength="130" value="${esc(p?.name || '')}" placeholder="お店・観光スポット名">`)}
    ${item('ジャンル', `<select class="field" name="cat">${[...CATS, ...t.genres.map((g) => g.name)].map((c) => `<option ${p?.cat === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select>`)}
    ${item('写真（任意）', `<div class="flex"><span class="thumb big" id="placePhotoTile"></span><label class="btn tiny">${ICON.camera} 写真を選ぶ<input type="file" id="placePhotoFile" accept="image/*" hidden></label><button type="button" class="btn tiny muted" id="placePhotoRemove" hidden>外す</button></div><p class="small">この端末の中だけに保存します(撮影場所の情報は取り除き、小さくして保存)。共有用のファイルには入りません。</p>`)}
    ${item('マーク（なしならジャンルの絵文字）', emojiField('emoji', p?.emoji || '', { allowEmpty: true, label: 'マーク' }))}
    ${item('エリア', `<input class="field" name="region" maxlength="100" value="${esc(p?.region || '')}" placeholder="例：京都市・祇園">`)}
    ${item('住所・施設名（ナビの検索に使用）', `<input class="field" name="location" maxlength="200" value="${esc(p?.location || '')}">`)}
    ${item('メモ', `<textarea class="field" name="memo" maxlength="1000">${esc(p?.memo || '')}</textarea>`)}
    ${item('緯度・経度（分かる場合だけ。カーナビ直接起動用）', `<div class="flex"><input class="field half" type="number" step="any" name="lat" placeholder="緯度" aria-label="緯度" value="${esc(p?.lat ?? '')}"><input class="field half" type="number" step="any" name="lon" placeholder="経度" aria-label="経度" value="${esc(p?.lon ?? '')}"></div>`)}
    </div>${actions('閉じる', '保存', editing ? `<button type="button" class="btn danger" data-action="remove-place" data-id="${esc(p.id)}">削除</button>` : '')}</form>`,
    (f, form) => {
      const name = formVal(f, 'name');
      if (!name) return err(form, '名前を入れてください');
      const latS = formVal(f, 'lat');
      const lonS = formVal(f, 'lon');
      let lat = null;
      let lon = null;
      if (latS || lonS) {
        lat = Number(latS);
        lon = Number(lonS);
        if (!latS || !lonS || !Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return err(form, '緯度・経度は両方、正しい数値で入れてください');
      }
      const cat = [...CATS, ...t.genres.map((g) => g.name)].includes(formVal(f, 'cat')) ? formVal(f, 'cat') : 'その他';
      const data = { name, cat, photo, emoji: formVal(f, 'emoji'), region: formVal(f, 'region'), location: formVal(f, 'location'), memo: formVal(f, 'memo'), lat, lon };
      if (editing) Object.assign(p, data);
      else t.places.push({ id: uid(), ...data, votes: {} });
      touch(t);
      hooks.render();
    },
  );
  const form = document.getElementById('modalForm');
  const tile = form.querySelector('#placePhotoTile');
  const remove = form.querySelector('#placePhotoRemove');
  const showPhoto = () => {
    tile.style.backgroundImage = photo ? `url("${photo}")` : '';
    tile.innerHTML = photo ? '' : ICON.camera;
    remove.hidden = !photo;
  };
  showPhoto();
  form.querySelector('#placePhotoFile').addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const url = await resizeImage(file, 640, PLACE_PHOTO_MAX_LENGTH);
      if (!isPhoto(url, PLACE_PHOTO_MAX_LENGTH)) throw new Error('invalid');
      photo = url;
      showPhoto();
    } catch {
      err(form, 'この写真は読み込めませんでした。別の写真で試してね');
    }
  });
  remove.addEventListener('click', () => {
    photo = '';
    showPhoto();
  });
}

// 行きたい場所に入っていない名前を、そのまま場所として登録する(同じ名前があれば、それを使う)
function ensurePlace(t, name) {
  const known = t.places.find((p) => p.name === name);
  if (known) return known.id;
  if (t.places.length >= LIMITS.places) return null;
  const id = uid();
  t.places.push({ id, name, cat: 'その他', emoji: '', photo: '', region: '', location: '', memo: '', lat: null, lon: null, votes: {} });
  return id;
}

export function stopForm(t, s, presetPlaceId = '') {
  const editing = !!s;
  const placeId = presetPlaceId || s?.placeId || '';
  const kind = s?.kind || 'stop';
  openModal(
    `<form id="modalForm"><h2>${editing ? '予定を編集' : `${state.activeDay}日目に予定を追加`}</h2><div class="formgrid">
    <div class="segment kindseg" role="radiogroup" aria-label="種類"><label><input type="radio" name="kind" value="stop" ${kind === 'stop' ? 'checked' : ''}>${ICON.pin} スポット</label><label><input type="radio" name="kind" value="move" ${kind === 'move' ? 'checked' : ''}>${ICON.navigate} 移動</label><label><input type="radio" name="kind" value="action" ${kind === 'action' ? 'checked' : ''}>${ICON.check} 行動</label></div>
    ${item('日程', `<select class="field" name="day">${Array.from({ length: t.days }, (_, i) => `<option value="${i + 1}" ${(s?.day || state.activeDay) === i + 1 ? 'selected' : ''}>${i + 1}日目</option>`).join('')}</select>`)}
    <div class="flex"><div class="formitem grow"><label>${kind === 'move' ? '出発' : '時間'} *</label><input class="field" type="time" required name="time" value="${esc(s?.time || '12:00')}"></div><div class="formitem grow" data-for="move"><label>到着</label><input class="field" type="time" name="endTime" value="${esc(s?.endTime || '')}"></div><div class="formitem grow" data-for="move"><label for="moveDur">所要（分）</label><input id="moveDur" class="field" type="number" inputmode="numeric" min="1" max="1439" name="duration" placeholder="例：30" value="${s?.endTime && toMinutes(s.endTime) > toMinutes(s.time) ? toMinutes(s.endTime) - toMinutes(s.time) : ''}"></div></div>
    ${item('タイトル *', `<input class="field" name="title" required maxlength="100" value="${esc(s?.title || (kind === 'move' ? '移動' : kind === 'action' ? ACTIONS.find((a) => a.id === (s?.act || 'checkin')).label : '立ち寄り'))}">`)}
    <div class="formitem" data-for="action"><label>行動の種類</label><div class="modes">${ACTIONS.map((a) => `<label class="modepill"><input type="radio" name="act" value="${a.id}" ${(s?.act || 'checkin') === a.id ? 'checked' : ''}><span>${a.emoji} ${a.label}</span></label>`).join('')}</div></div>
    <div class="formitem" data-for="move"><label>移動手段</label><div class="modes emojionly" role="radiogroup" aria-label="移動手段">${MODES.map((m) => `<label class="modepill" title="${esc(m.label)}"><input type="radio" name="mode" value="${m.id}" aria-label="${esc(m.label)}" ${(s?.mode || 'car') === m.id ? 'checked' : ''}><span>${esc(m.emoji)}</span></label>`).join('')}</div></div>
    <div class="formitem placepick" data-for="stop action" data-placepick><label for="placeQuery">場所</label>
    <input type="hidden" name="placeId" value="${esc(placeId)}"><input type="hidden" name="newPlace" value="">
    <div class="placechip" data-placechip></div>
    <input id="placeQuery" class="field" type="search" placeholder="検索、または名前を入力" autocomplete="off" enterkeyhint="search" maxlength="130">
    <div class="placeresults" data-placeresults hidden></div></div>
    <div class="formitem placepick" data-for="stop" data-optpick><label for="optQuery">候補</label>
    <input type="hidden" name="options" value="${esc(JSON.stringify(s?.options || (placeId ? [placeId] : [])))}"><input type="hidden" name="newOptions" value="[]">
    <div class="optchips" data-optchips></div>
    <input id="optQuery" class="field" type="search" placeholder="候補に追加する場所を検索、または入力" autocomplete="off" enterkeyhint="search" maxlength="130">
    <div class="placeresults" data-optresults hidden></div></div>
    <div class="formitem" data-for="stop"><label for="stopCat">ジャンル</label><select id="stopCat" class="field" name="cat"><option value="">場所と同じ</option>${[...CATS, ...t.genres.map((g) => g.name)].map((c) => `<option value="${esc(c)}" ${s?.cat === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select></div>
    <div class="formitem" data-for="stop action"><label>マーク</label>${emojiField('emoji', s?.emoji || '', { allowEmpty: true, label: 'マーク' })}</div>
    ${item('補足メモ', `<textarea class="field" name="note" maxlength="500">${esc(s?.note || '')}</textarea>`)}
    <label class="check inline"><input type="checkbox" name="optional" ${s?.optional ? 'checked' : ''}><span>時間があれば行く</span></label>
    </div>${actions('閉じる', '保存', editing ? `<button type="button" class="btn danger" data-action="remove-stop" data-id="${esc(s.id)}">削除</button>` : '')}</form>`,
    (f, form) => {
      const kv = formVal(f, 'kind');
      const k = kv === 'move' ? 'move' : kv === 'action' ? 'action' : 'stop';
      const time = formVal(f, 'time');
      const endTime = k === 'move' ? formVal(f, 'endTime') : '';
      const title = formVal(f, 'title');
      if (!title) return err(form, 'タイトルを入れてください');
      if (!isTimeStr(time)) return err(form, '時間を入れてください');
      if (endTime && (!isTimeStr(endTime) || endTime <= time)) return err(form, '到着は出発より後の時刻にしてください(日をまたぐ移動は2つに分けてね)');
      let pid = k !== 'move' && getPlace(t, formVal(f, 'placeId')) ? formVal(f, 'placeId') : '';
      const newName = k !== 'move' ? formVal(f, 'newPlace').slice(0, 130) : '';
      if (newName && !pid) {
        // 行きたい場所に入っていない場所を、自由に入力して、そのまま登録する
        pid = ensurePlace(t, newName);
        if (!pid) return err(form, `場所は${LIMITS.places}件までです`);
      }
      // 候補(選ぶ前の候補): 並べた場所と、新しく入力した名前
      const optIds = [];
      if (k === 'stop') {
        const parse = (key) => { try { const v = JSON.parse(formVal(f, key) || '[]'); return Array.isArray(v) ? v : []; } catch { return []; } };
        for (const id of parse('options')) if (typeof id === 'string' && getPlace(t, id)) optIds.push(id);
        for (const name of parse('newOptions')) {
          if (typeof name !== 'string' || !name.trim()) continue;
          const id = ensurePlace(t, name.trim().slice(0, 130));
          if (!id) return err(form, `場所は${LIMITS.places}件までです`);
          optIds.push(id);
        }
        if (pid) optIds.push(pid);
      }
      const options = [...new Set(optIds)].slice(0, 20);
      const obj = { kind: k, day: formInt(f, 'day', 1, t.days, 1), time, endTime, title, note: formVal(f, 'note'), optional: !!f.get('optional'), mode: MODES.some((m) => m.id === formVal(f, 'mode')) ? formVal(f, 'mode') : 'car', placeId: pid, emoji: k !== 'move' ? formVal(f, 'emoji') : '', cat: k === 'stop' && (CATS.includes(formVal(f, 'cat')) || t.genres.some((g) => g.name === formVal(f, 'cat'))) ? formVal(f, 'cat') : '', act: k === 'action' && ACTIONS.some((a) => a.id === formVal(f, 'act')) ? formVal(f, 'act') : '' };
      if (editing) {
        state.focusStop = s.id;
        Object.assign(s, obj);
        s.options = options;
      } else {
        const newId = uid();
        state.focusStop = newId;
        t.schedule.push({ id: newId, ...obj, options, done: false });
      }
      state.activeDay = obj.day;
      state.tab = 'schedule';
      touch(t);
      hooks.render();
    },
  );
  const form = document.getElementById('modalForm');
  const sync = () => {
    const el = form.elements;
    const k = el.kind.value;
    form.querySelectorAll('[data-for]').forEach((el) => (el.hidden = !el.dataset.for.split(' ').includes(k)));
    const first = form.querySelector('.flex .formitem label');
    if (first) first.textContent = (k === 'move' ? '出発' : '時間') + ' *';
    const defaults = ['立ち寄り', '移動', ...ACTIONS.map((a) => a.label)];
    if (!editing && defaults.includes(el.title.value)) el.title.value = k === 'move' ? '移動' : k === 'action' ? ACTIONS.find((a) => a.id === (el.act.value || 'checkin'))?.label || 'チェックイン' : '立ち寄り';
  };
  form.addEventListener('change', sync);
  sync();
  setupPlacePick(t, form);
  setupOptionsPick(t, form);
  // 出発・到着・所要時間は、つながっている(2つを入れれば、残りが決まる)
  const syncTimes = (e) => {
    const el = form.elements;
    const start = toMinutes(el.time.value);
    if (start === null) return;
    const name = e.target.name;
    if (name === 'duration' || name === 'time') {
      const dur = Number(el.duration.value);
      if (dur > 0) {
        const end = Math.min(1439, start + dur);
        el.endTime.value = fromMinutes(end);
        if (start + dur > 1439) el.duration.value = String(end - start);
      } else if (name === 'duration') el.endTime.value = '';
    } else if (name === 'endTime') {
      const end = toMinutes(el.endTime.value);
      el.duration.value = end !== null && end > start ? String(end - start) : '';
    }
  };
  form.addEventListener('input', syncTimes);
}

// 場所の検索と自由入力。候補は端末の中の「行きたい場所」だけから探す(通信しない)
function setupPlacePick(t, form) {
  const root = form.querySelector('[data-placepick]');
  if (!root) return;
  const idEl = form.elements.placeId;
  const newEl = form.elements.newPlace;
  const q = root.querySelector('#placeQuery');
  const chip = root.querySelector('[data-placechip]');
  const box = root.querySelector('[data-placeresults]');
  const showChip = () => {
    const p = getPlace(t, idEl.value);
    const label = p ? p.name : newEl.value ? newEl.value + '(新しい場所)' : '';
    chip.hidden = !label;
    chip.innerHTML = label ? `<span>${ICON.pin} ${esc(label)}</span><button type="button" data-pick="" aria-label="場所を外す">×</button>` : '';
  };
  const render = () => {
    const text = q.value.trim().toLocaleLowerCase();
    const list = t.places.filter((p) => !text || [p.name, p.region, p.location, p.memo, p.cat].some((v) => String(v || '').toLocaleLowerCase().includes(text))).slice(0, 8);
    const exact = t.places.some((p) => p.name.toLocaleLowerCase() === text);
    const rows = list.map((p) => `<button type="button" class="placeopt" data-pick="${esc(p.id)}"><span>${esc(p.name)}</span><small>${esc(p.region || p.cat)}</small></button>`);
    if (text && !exact) rows.push(`<button type="button" class="placeopt new" data-pick-new>＋ 「${esc(q.value.trim())}」を新しい場所にする</button>`);
    box.innerHTML = rows.join('') || '<div class="small">一致する場所はありません</div>';
    box.hidden = false;
  };
  const choose = (id, name = '') => {
    idEl.value = id;
    newEl.value = name;
    q.value = '';
    box.hidden = true;
    showChip();
  };
  q.addEventListener('input', render);
  q.addEventListener('focus', render);
  q.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    box.querySelector('[data-pick]:not([data-pick=""]), [data-pick-new]')?.click();
  });
  root.addEventListener('click', (e) => {
    const b = e.target.closest('[data-pick], [data-pick-new]');
    if (!b) return;
    if (b.hasAttribute('data-pick-new')) choose('', q.value.trim());
    else choose(b.dataset.pick);
  });
  showChip();
}

// 候補(選ぶ前の候補)の編集: 並べた場所を×で外し、検索・入力で足す
function setupOptionsPick(t, form) {
  const root = form.querySelector('[data-optpick]');
  if (!root) return;
  const idsEl = form.elements.options;
  const namesEl = form.elements.newOptions;
  const q = root.querySelector('#optQuery');
  const chips = root.querySelector('[data-optchips]');
  const box = root.querySelector('[data-optresults]');
  let ids = JSON.parse(idsEl.value || '[]').filter((id) => getPlace(t, id));
  let names = [];
  const save = () => {
    idsEl.value = JSON.stringify(ids);
    namesEl.value = JSON.stringify(names);
    const chip = (label, attr) => `<span class="optchip"><span>${esc(label)}</span><button type="button" ${attr} aria-label="「${esc(label)}」を候補から外す">×</button></span>`;
    chips.innerHTML = ids.map((id) => chip(getPlace(t, id).name, `data-opt-del="${esc(id)}"`)).join('') + names.map((n, i) => chip(n + '(新しい場所)', `data-new-del="${i}"`)).join('');
    chips.hidden = !chips.innerHTML;
  };
  const render = () => {
    const text = q.value.trim().toLocaleLowerCase();
    const list = t.places.filter((p) => !ids.includes(p.id) && (!text || [p.name, p.region, p.location, p.memo, p.cat].some((v) => String(v || '').toLocaleLowerCase().includes(text)))).slice(0, 8);
    const exact = t.places.some((p) => p.name.toLocaleLowerCase() === text) || names.some((n) => n.toLocaleLowerCase() === text);
    const rows = list.map((p) => `<button type="button" class="placeopt" data-opt-add="${esc(p.id)}"><span>${esc(p.name)}</span><small>${esc(p.region || p.cat)}</small></button>`);
    if (text && !exact) rows.push(`<button type="button" class="placeopt new" data-opt-new>＋ 「${esc(q.value.trim())}」を新しい場所の候補にする</button>`);
    box.innerHTML = rows.join('') || '<div class="small">追加できる場所はありません</div>';
    box.hidden = false;
  };
  const after = () => { q.value = ''; box.hidden = true; save(); };
  q.addEventListener('input', render);
  q.addEventListener('focus', render);
  q.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    box.querySelector('[data-opt-add], [data-opt-new]')?.click();
  });
  root.addEventListener('click', (e) => {
    const add = e.target.closest('[data-opt-add]');
    const neu = e.target.closest('[data-opt-new]');
    const del = e.target.closest('[data-opt-del]');
    const delNew = e.target.closest('[data-new-del]');
    if (add) { ids = [...ids, add.dataset.optAdd].slice(0, 20); after(); }
    else if (neu) { if (q.value.trim() && names.length + ids.length < 20) names = [...names, q.value.trim().slice(0, 130)]; after(); }
    else if (del) { ids = ids.filter((id) => id !== del.dataset.optDel); save(); }
    else if (delNew) { names = names.filter((_, i) => i !== Number(delNew.dataset.newDel)); save(); }
  });
  save();
}

export function dayPickForm(t, id) {
  const p = getPlace(t, id);
  if (!p) return;
  openModal(
    `<form id="modalForm"><h2>「${esc(p.name)}」を予定に入れる</h2><p class="small">日付と時間は後から変更できます。</p><div class="formgrid">
    ${item('何日目？', `<select class="field" name="day">${Array.from({ length: t.days }, (_, i) => `<option value="${i + 1}" ${state.activeDay === i + 1 ? 'selected' : ''}>${i + 1}日目</option>`).join('')}</select>`)}
    ${item('時間', '<input class="field" name="time" type="time" value="12:00">')}</div>${actions('閉じる', '追加する')}</form>`,
    (f) => {
      const day = formInt(f, 'day', 1, t.days, 1);
      const sid = uid();
      state.focusStop = sid;
      t.schedule.push({ id: sid, kind: 'stop', day, time: isTimeStr(formVal(f, 'time')) ? formVal(f, 'time') : '12:00', endTime: '', title: p.cat === '食事' ? '食事' : p.cat === 'カフェ' ? 'カフェ休憩' : p.cat === '宿泊' ? '宿泊' : '立ち寄り', placeId: id, options: [id], note: '', optional: false, done: false, mode: 'car' });
      state.activeDay = day;
      state.tab = 'schedule';
      touch(t);
      hooks.render();
      toast('しおりに追加したよ');
    },
  );
}

export function bookingForm(t, b) {
  const editing = !!b;
  openModal(
    `<form id="modalForm"><h2>${editing ? '予約を編集' : '予約を追加'}</h2><div class="formgrid">
    ${item('名前 *', `<input class="field" name="title" required maxlength="100" value="${esc(b?.title || '')}" placeholder="例：アパホテル新潟駅前大通">`)}
    <div class="flex"><div class="formitem grow"><label>日にち</label><select class="field" name="day"><option value="0">未定</option>${Array.from({ length: t.days }, (_, i) => `<option value="${i + 1}" ${b?.day === i + 1 ? 'selected' : ''}>${i + 1}日目</option>`).join('')}</select></div><div class="formitem grow"><label>時間</label><input class="field" type="time" name="time" value="${esc(b?.time || '')}"></div></div>
    ${item('メモ（予約番号・連絡先など）', `<textarea class="field" name="memo" maxlength="500">${esc(b?.memo || '')}</textarea>`)}
    </div>${actions('閉じる', '保存', editing ? `<button type="button" class="btn danger" data-action="remove-booking" data-id="${esc(b.id)}">削除</button>` : '')}</form>`,
    (f, form) => {
      const title = formVal(f, 'title');
      if (!title) return err(form, '名前を入れてください');
      if (!editing && t.bookings.length >= LIMITS.bookings) return err(form, `予約は${LIMITS.bookings}件までです`);
      const time = formVal(f, 'time');
      const data = { title, day: formInt(f, 'day', 0, t.days, 0), time: isTimeStr(time) ? time : '', memo: formVal(f, 'memo') };
      if (editing) Object.assign(b, data);
      else t.bookings.push({ id: uid(), ...data, done: false });
      state.tab = 'gear';
      state.gearTab = 'booking';
      touch(t);
      hooks.render();
    },
  );
}

// 確認の画面(✓で実行、×でやめる)
export function confirmForm(title, message, okLabel, onOk) {
  openModal(`<form id="modalForm"><h2>${esc(title)}</h2><p>${esc(message)}</p><div class="modalactions"><button type="button" class="btn" data-action="close">キャンセル</button><button type="submit" class="btn primary">${esc(okLabel)}</button></div></form>`, () => {
    onOk();
  });
}

// 同期リンクで参加する(まず相手の旅行名を確かめてから、確認を出す)
export async function syncJoinForm(j) {
  toast('リンクを確かめています…');
  let info;
  try {
    info = await peekLink(j);
  } catch (e) {
    return toast(e.message || 'リンクを確かめられませんでした');
  }
  confirmForm('同期に参加', `「${info.name}」を、この端末に追加して同期を始めます。`, '参加する', () => {
    joinTrip(j)
      .then(() => {
        state.view = 'trip';
        state.tab = 'schedule';
        hooks.render();
        toast('同期に参加しました');
      })
      .catch((e) => toast(e.message || '参加できませんでした'));
  });
}

export function genreForm(t) {
  openModal(
    `<form id="modalForm"><h2>ジャンルを追加</h2><div class="formgrid">
    ${item('名前 *', '<input class="field" name="name" required maxlength="10" placeholder="例：温泉・ドライブ">')}
    ${item('マーク', emojiField('emoji', '♨️', { label: 'マーク' }))}
    </div>${actions('キャンセル', '追加')}</form>`,
    (f, form) => {
      const name = formVal(f, 'name');
      if (!name) return err(form, '名前を入れてください');
      if (CATS.includes(name) || t.genres.some((g) => g.name === name)) return err(form, 'その名前のジャンルはすでにあります');
      if (t.genres.length >= LIMITS.genres) return err(form, `追加できるジャンルは${LIMITS.genres}個までです`);
      t.genres.push({ id: uid(), name, emoji: formVal(f, 'emoji') || '📍' });
      touch(t);
      hooks.render();
    },
  );
}

// ジャンルのマーク(初期のジャンルは、マークだけ。この旅行で足したジャンルは、名前も)を変える
export function genreEditForm(t, key) {
  const custom = t.genres.find((g) => g.id === key);
  const builtin = CATS.includes(key) ? key : '';
  if (!custom && !builtin) return;
  const current = custom ? custom.emoji : t.catEmoji?.[builtin] || CAT_EMOJI[builtin];
  openModal(
    `<form id="modalForm"><h2>ジャンルを編集</h2><div class="formgrid">
    ${custom ? item('名前 *', `<input class="field" name="name" required maxlength="10" value="${esc(custom.name)}">`) : `<p><b>${esc(builtin)}</b></p>`}
    ${item('マーク', emojiField('emoji', current, { label: 'マーク' }))}
    </div>${actions('キャンセル', '保存')}</form>`,
    (f, form) => {
      const emoji = formVal(f, 'emoji') || '📍';
      if (custom) {
        const name = formVal(f, 'name');
        if (!name) return err(form, '名前を入れてください');
        if (name !== custom.name && (CATS.includes(name) || t.genres.some((g) => g.name === name))) return err(form, 'その名前のジャンルはすでにあります');
        for (const p of t.places) if (p.cat === custom.name) p.cat = name;
        if (state.filter === custom.name) state.filter = name;
        custom.name = name;
        custom.emoji = emoji;
      } else {
        t.catEmoji = t.catEmoji || {};
        if (emoji === CAT_EMOJI[builtin]) delete t.catEmoji[builtin];
        else t.catEmoji[builtin] = emoji;
      }
      touch(t);
      hooks.render();
    },
  );
}

// 日ごとのひとこと(ヘッダーの吹き出しに出る)。空にして保存すると消える
export function dayNoteForm(t, day) {
  openModal(
    `<form id="modalForm"><h2>${day}日目のひとこと</h2><div class="formgrid">
    ${item('ひとこと', `<input class="field" name="note" maxlength="30" value="${esc(t.dayNotes?.[day] || '')}" placeholder="例：今日は燕三条エリア">`)}
    </div>${actions('閉じる', '保存')}</form>`,
    (f) => {
      const text = formVal(f, 'note').slice(0, 30);
      t.dayNotes = { ...(t.dayNotes || {}) };
      if (text) t.dayNotes[day] = text;
      else delete t.dayNotes[day];
      touch(t);
      hooks.render();
    },
  );
}

export function checkForm(t) {
  openModal(`<form id="modalForm"><h2>持ち物・準備を追加</h2><div class="formgrid">${item('内容 *', '<input class="field" name="text" required maxlength="200" placeholder="例：モバイルバッテリー">')}</div>${actions('閉じる', '追加')}</form>`, (f, form) => {
    const text = formVal(f, 'text');
    if (!text) return err(form, '内容を入れてください');
    if (t.checklist.length >= LIMITS.checklist) return err(form, `項目は${LIMITS.checklist}件までです`);
    t.checklist.push({ id: uid(), text, done: false });
    touch(t);
    hooks.render();
  });
}

export function themeForm(t) {
  const th = t.theme;
  let photo = t.backgroundPhoto; // 選び直した写真は、「決定」を押すまで旅行には反映しない
  const opt = (value, label, checked, extra = '') => `<label class="themeopt"><input type="radio" name="mode" value="${esc(value)}" ${checked ? 'checked' : ''}><span>${label}</span>${extra}</label>`;
  openModal(
    `<form id="modalForm"><h2>この旅行の色と背景</h2><div class="formgrid">
    <div class="group" style="margin:0">色</div>
    ${opt('inherit', '標準の色(アプリの設定の色)', th.mode === 'inherit')}
    ${t.members.map((m) => opt('m:' + m.id, `${avatar(m)} ${esc(m.name)}の色`, th.mode === 'member' && th.memberId === m.id, `<span class="dot big" style="background:${esc(m.color)}"></span>`)).join('')}
    ${t.members.length >= 2 ? opt('duo', `${esc(t.members[0].name)}と${esc(t.members[1].name)}の色(2色)`, th.mode === 'duo', `<span class="dot big" style="background:linear-gradient(90deg,${esc(t.members[0].color)} 50%,${esc(t.members[1].color)} 50%)"></span>`) : ''}
    ${opt('custom', '好きな色', th.mode === 'custom', `<input type="color" class="colorinput" name="hex" value="${esc(th.hex || '#3b6ea5')}" aria-label="好きな色">`)}
    <div class="group" style="margin:8px 0 0">背景</div>
    <div class="bgpicker" role="radiogroup" aria-label="背景">${BACKGROUNDS.map((b) => `<label class="bgopt"><input type="radio" name="background" value="${b.id}" ${t.background === b.id ? 'checked' : ''}><span class="bgtile" data-bg="${b.id}"></span><span class="bglabel">${esc(b.label)}</span></label>`).join('')}<label class="bgopt"><input type="radio" name="background" value="photo" ${t.background === 'photo' ? 'checked' : ''} ${photo ? '' : 'disabled'}><span class="bgtile" id="photoTile">${photo ? '' : ICON.camera}</span><span class="bglabel">写真</span></label></div>
    <div class="flex"><label class="btn tiny">${ICON.camera} 写真を選ぶ<input type="file" id="photoFile" accept="image/*" hidden></label><button type="button" class="btn tiny muted" id="photoRemove" ${photo ? '' : 'hidden'}>写真を外す</button></div>
    <p class="small">写真はこの端末の中だけに保存します。撮影場所などの情報は取り除き、小さくして保存します。共有用のファイルには入りません。</p>
    </div>${actions('キャンセル', '決定')}</form>`,
    (f) => {
      let bg = formVal(f, 'background');
      if (bg === 'photo' && !photo) bg = 'plain';
      t.background = BACKGROUND_IDS.has(bg) ? bg : 'plain';
      t.backgroundPhoto = photo;
      const v = formVal(f, 'mode');
      if (v === 'duo') t.theme = { mode: 'duo' };
      else if (v === 'custom' && isHex(formVal(f, 'hex'))) t.theme = { mode: 'custom', hex: formVal(f, 'hex').toLowerCase() };
      else if (v.startsWith('m:') && getMember(t, v.slice(2))) t.theme = { mode: 'member', memberId: v.slice(2) };
      else t.theme = { mode: 'inherit' };
      touch(t);
      hooks.render();
    },
  );
  const form = document.getElementById('modalForm');
  const radio = form.querySelector('input[name=background][value=photo]');
  const tile = form.querySelector('#photoTile');
  const remove = form.querySelector('#photoRemove');
  const showPhoto = () => {
    tile.style.backgroundImage = photo ? `url("${photo}")` : '';
    tile.style.backgroundSize = 'cover';
    tile.style.backgroundPosition = 'center';
    tile.innerHTML = photo ? '' : ICON.camera;
    radio.disabled = !photo;
    remove.hidden = !photo;
  };
  showPhoto();
  form.querySelector('#photoFile').addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const url = await resizeImage(file);
      if (!isPhoto(url)) throw new Error('invalid');
      photo = url;
      showPhoto();
      radio.checked = true;
    } catch {
      err(form, 'この写真は読み込めませんでした。別の写真で試してね');
    }
  });
  remove.addEventListener('click', () => {
    photo = '';
    showPhoto();
    if (radio.checked) form.querySelector('input[name=background][value=plain]').checked = true;
  });
}

// ナビの選択。住所だけの場所は、位置を確認してから開く導線にする
// 場所の詳細(行きたい・予定の候補から開く)
export function placeDetail(t, p) {
  const n = navTargets(p);
  const row = (label, value) => (value ? `<div class="detailrow"><div class="small">${esc(label)}</div><div>${value}</div></div>` : '');
  const votes = t.members.map((m) => `<span class="votepill ${p.votes[m.id] ? 'on' : ''}">${p.votes[m.id] ? '♥' : '♡'} ${esc(m.emoji)} ${esc(m.name)}</span>`).join('');
  openModal(`<h2>${esc(p.name)}</h2>
  ${p.photo ? `<div class="detailphoto" style="background-image:url('${p.photo}')" role="img" aria-label="${esc(p.name)}の写真"></div>` : ''}
  <div class="detailbody">
    <span class="cat" data-cat="${esc(p.cat)}">${esc(placeEmoji(p))} ${esc(p.cat)}</span>
    <div class="tripname detailname">${esc(p.name)}</div>
    ${row('エリア', esc(p.region))}
    ${row('住所・施設名', esc(p.location))}
    ${p.memo ? `<div class="detailrow"><div class="small">メモ</div><div class="detailmemo">${esc(p.memo)}</div></div>` : ''}
    ${row('緯度・経度', n.hasCoords ? `${esc(p.lat)}, ${esc(p.lon)}` : '')}
    <div class="detailrow"><div class="small">みんなの希望</div><div class="votepills">${votes}</div></div>
  </div>
  <div class="navlist">
    <a class="btn primary fill" href="${esc(n.google)}" target="_blank" rel="noopener noreferrer">${ICON.map} Googleマップで開く</a>
    <button class="btn fill" data-action="nav" data-id="${esc(p.id)}">${ICON.navigate} ナビで開く(カーナビなど)</button>
    <button class="btn fill" data-action="add-place-to-day" data-id="${esc(p.id)}">＋ 予定に追加</button>
    <button class="btn fill" data-action="edit-place" data-id="${esc(p.id)}">編集する</button>
  </div>`);
}

export function navChooser(place) {
  const n = navTargets(place);
  openModal(`<h2>ナビを開く</h2><div class="card"><b>${esc(place.name)}</b><div class="small">${esc(place.location || place.region || '住所は未登録')}</div></div>
  ${n.hasCoords ? '' : '<div class="notice warn">緯度・経度が未登録です。まず「Yahoo!マップで確認」で位置を確かめてね。</div>'}
  <div class="navlist">${n.yahooCar ? `<a class="btn primary fill" href="${esc(n.yahooCar)}">${ICON.navigate} Yahoo!カーナビで開く</a>` : ''}
  <a class="btn fill" href="${esc(n.google)}" target="_blank" rel="noopener noreferrer">${ICON.pin} Googleマップで開く</a>
  <a class="btn fill" href="${esc(n.yahooMap)}" target="_blank" rel="noopener noreferrer">${ICON.map} Yahoo!マップで確認</a>
  <a class="btn fill" href="${esc(n.apple)}" target="_blank" rel="noopener noreferrer"> Appleマップで開く</a></div>
  <p class="small">Yahoo!カーナビのアプリが入っていないと開けません。その場合は他を選んでね。</p>
  <div class="modalactions"><button type="button" class="btn" data-action="close">閉じる</button></div>`);
}
