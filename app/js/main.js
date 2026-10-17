import { state, hooks, current, getPlace, touch, flush, load, addTrip, removeTrip, saveSettings, applyTheme } from './state.js';
import { renderHome, renderTrip, renderHeadRight } from './views.js';
import { tripForm, memberForm, placeForm, stopForm, dayPickForm, checkForm, themeForm, navChooser } from './forms.js';
import { closeModal, modalOpen, toast, download, shareFile, handleEmojiClick } from './ui.js';
import { serializeTrip, serializeBackup, parseImport, ImportError, MAX_IMPORT_BYTES } from './io.js';
import { moveProgress, dayStart } from './transit.js';
import { isHex } from './color.js';
import { normalizeTheme } from './model.js';

const $ = (id) => document.getElementById(id);

function render() {
  const t = current();
  applyTheme(t);
  document.body.classList.toggle('has-nav', !!t);
  document.body.dataset.bg = t ? t.background : 'plain';
  document.body.style.setProperty('--bg-photo', t && t.backgroundPhoto ? `url("${t.backgroundPhoto}")` : 'none');
  $('headright').innerHTML = renderHeadRight(t);
  $('view').innerHTML = t ? renderTrip(t) : renderHome();
  updateTracks();
}
hooks.render = render;
hooks.onSaveError = () => toast('保存できませんでした。空き容量を確認してね');

// ---- 移動アニメーション: 時刻から位置を計算して、線の上のアイコンを動かす ----
function fmtWait(ms) {
  const m = Math.max(1, Math.ceil(ms / 60000));
  return m >= 60 ? `${Math.floor(m / 60)}時間${m % 60 ? (m % 60) + '分' : ''}` : `${m}分`;
}

function updateTracks() {
  const now = Date.now();
  document.querySelectorAll('.track[data-start]').forEach((el) => {
    const start = Number(el.dataset.start);
    const end = Number(el.dataset.end);
    const { state: st, p } = moveProgress(now, start, end);
    el.style.setProperty('--p', p.toFixed(4));
    el.dataset.state = st;
    const label = document.querySelector(`[data-status="${CSS.escape(el.dataset.id)}"]`);
    if (!label) return;
    label.textContent =
      st === 'before' ? `出発まであと${fmtWait(start - now)}` : st === 'moving' ? `移動中 ${Math.round(p * 100)}%(到着まであと${fmtWait(end - now)})` : st === 'arrived' ? '到着済み' : '';
  });
}
setInterval(updateTracks, 15000);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') updateTracks();
  else flush();
});
addEventListener('pagehide', flush);

// 旅行中なら今日の日を、そうでなければ1日目を最初に開く
function todayDayOrFirst(t) {
  const d0 = t && dayStart(t.date, 1);
  if (!d0) return 1;
  const n = Math.round((new Date().setHours(0, 0, 0, 0) - +d0) / 86400000) + 1;
  return n >= 1 && n <= t.days ? n : 1;
}

// ---- 削除は確認ダイアログではなく「元に戻す」で守る ----
function removeWithUndo(trip, label, mutate) {
  const snapshot = structuredClone(trip);
  mutate();
  touch(trip);
  render();
  toast(`${label}を削除しました`, {
    label: '元に戻す',
    fn: () => {
      Object.assign(trip, snapshot);
      touch(trip);
      render();
    },
  });
}

function removeMember(t, m) {
  removeWithUndo(t, `「${m.name}」`, () => {
    t.members = t.members.filter((x) => x.id !== m.id);
    for (const p of t.places) delete p.votes[m.id];
    t.theme = normalizeTheme(t.theme, t.members);
  });
}

// ---- 書き出し・読み込み ----
const stamp = () => new Date().toISOString().slice(0, 10);

async function importFile(file) {
  if (!file) return;
  if (file.size > MAX_IMPORT_BYTES) return toast('ファイルが大きすぎます');
  try {
    const trips = parseImport(await file.text());
    for (const t of trips) await addTrip(t, { select: trips.length === 1 });
    state.tab = 'schedule';
    state.activeDay = 1;
    render();
    toast(`${trips.length}件の旅行を読み込みました`);
  } catch (e) {
    toast(e instanceof ImportError ? e.message : '読み込めませんでした');
  }
}

function copySchedule(t) {
  let out = `${t.name}\n${t.destination} / ${t.days}日間\n`;
  for (let d = 1; d <= t.days; d++) {
    out += `\n【${d}日目】\n`;
    t.schedule
      .filter((s) => s.day === d)
      .sort((a, b) => a.time.localeCompare(b.time))
      .forEach((s) => {
        const p = getPlace(t, s.placeId);
        out += s.kind === 'move' ? `${s.time}${s.endTime ? '-' + s.endTime : ''} 🚗 ${s.title}\n` : `${s.time} ${s.title}${p ? '｜' + p.name : '（未定）'}\n`;
      });
  }
  const done = () => toast('しおりをコピーしたよ');
  if (navigator.clipboard?.writeText) navigator.clipboard.writeText(out).then(done, () => toast('コピーできませんでした'));
  else toast('コピーできませんでした');
}

// ---- クリック処理 ----
document.addEventListener('click', (e) => {
  if (handleEmojiClick(e.target)) return;
  const b = e.target.closest('[data-action],[data-tab],[data-day],[data-filter],[data-gear]');
  if (!b) return;
  if (b.dataset.tab) {
    state.tab = b.dataset.tab;
    render();
    scrollTo(0, 0);
    return;
  }
  if (b.dataset.gear) {
    state.gearTab = b.dataset.gear === 'memo' ? 'memo' : 'list';
    render();
    return;
  }
  if (b.dataset.day) {
    state.activeDay = Number(b.dataset.day);
    render();
    return;
  }
  if (b.dataset.filter) {
    state.filter = b.dataset.filter;
    render();
    return;
  }
  const a = b.dataset.action;
  const id = b.dataset.id;
  const t = current();
  switch (a) {
    case 'close': return closeModal();
    case 'trips': state.currentId = null; return render();
    case 'new-trip': return tripForm();
    case 'open-trip': state.currentId = id; state.activeDay = todayDayOrFirst(state.trips.find((x) => x.id === id)); state.tab = 'schedule'; render(); return scrollTo(0, 0);
    case 'import': return $('importFile').click();
    case 'export-all': download(`tabi-backup-${stamp()}.json`, serializeBackup(state.trips)); return toast('バックアップを保存したよ');
    case 'app-color': state.settings.accent = b.dataset.hex; saveSettings(); return render();
    case 'delete-trip': {
      const target = state.trips.find((x) => x.id === id);
      if (!target) return;
      removeTrip(id).then(() => {
        render();
        toast(`「${target.name}」を削除しました`, { label: '元に戻す', fn: () => addTrip(target, { select: false }).then(render) });
      });
      return;
    }
    case 'export-trip': {
      const target = state.trips.find((x) => x.id === id);
      if (!target) return;
      download(`trip-${target.date || 'plan'}.json`, serializeTrip(target));
      return toast('バックアップを保存したよ');
    }
    case 'share-trip': {
      const target = state.trips.find((x) => x.id === id);
      if (!target) return;
      const name = `trip-${target.date || 'plan'}-share.json`;
      const text = serializeTrip(target, { share: true });
      // 共有シートはボタンを押した直後に開く必要があるので、await の前に呼ぶ
      shareFile(name, text, target.name).then((r) => {
        if (r === 'unsupported') {
          download(name, text);
          toast('この端末では共有シートが使えないので、ファイルを保存したよ');
        } else if (r === 'shared') toast('共有しました');
      });
      return;
    }
  }
  if (!t) return;
  switch (a) {
    case 'edit-trip': return tripForm(t);
    case 'edit-theme': return themeForm(t);
    case 'edit-member': return memberForm(t, id ? t.members.find((m) => m.id === id) : null, (m) => removeMember(t, m));
    case 'edit-place': return placeForm(t, id ? getPlace(t, id) : null);
    case 'remove-place': {
      const p = getPlace(t, id);
      if (!p) return;
      closeModal();
      return removeWithUndo(t, `「${p.name}」`, () => {
        t.places = t.places.filter((x) => x.id !== id);
        for (const s of t.schedule) {
          if (s.placeId === id) s.placeId = '';
          s.options = s.options.filter((x) => x !== id);
        }
      });
    }
    case 'vote': {
      const p = getPlace(t, id);
      const mid = b.dataset.member;
      if (!p || !t.members.some((m) => m.id === mid)) return;
      if (p.votes[mid]) delete p.votes[mid];
      else p.votes[mid] = true;
      touch(t);
      return render();
    }
    case 'add-place-to-day': return dayPickForm(t, id);
    case 'edit-stop': return stopForm(t, id ? t.schedule.find((s) => s.id === id) : null);
    case 'remove-stop': {
      const s = t.schedule.find((x) => x.id === id);
      if (!s) return;
      closeModal();
      return removeWithUndo(t, `「${s.title}」`, () => (t.schedule = t.schedule.filter((x) => x.id !== id)));
    }
    case 'choose': {
      const s = t.schedule.find((x) => x.id === b.dataset.slot);
      if (!s) return;
      s.placeId = b.dataset.place;
      touch(t);
      render();
      return toast('予定に反映したよ');
    }
    case 'visit': {
      const s = t.schedule.find((x) => x.id === id);
      if (!s) return;
      s.done = !s.done;
      touch(t);
      return render();
    }
    case 'nav': {
      const p = getPlace(t, id);
      return p && navChooser(p);
    }
    case 'new-check': return checkForm(t);
    case 'delete-check': {
      const c = t.checklist.find((x) => x.id === id);
      if (!c) return;
      return removeWithUndo(t, `「${c.text}」`, () => (t.checklist = t.checklist.filter((x) => x.id !== id)));
    }
    case 'copy-schedule': return copySchedule(t);
  }
});

document.addEventListener('change', (e) => {
  const el = e.target;
  if (el.id === 'importFile') {
    importFile(el.files?.[0]);
    el.value = '';
    return;
  }
  if (el.dataset.actionInput === 'app-color-custom' && isHex(el.value)) {
    state.settings.accent = el.value.toLowerCase();
    saveSettings();
    render();
    return;
  }
  const t = current();
  if (t && el.dataset.action === 'check') {
    const c = t.checklist.find((x) => x.id === el.dataset.id);
    if (c) {
      c.done = el.checked;
      touch(t);
      render();
    }
  }
});

document.addEventListener('input', (e) => {
  const t = current();
  if (!t) return;
  if (e.target.id === 'tripNotes') {
    t.notes = e.target.value.slice(0, 5000);
    touch(t);
    const c = $('memoCount');
    if (c) c.textContent = `${t.notes.length}/5000`;
  }
  if (e.target.id === 'placeSearch') {
    const pos = e.target.selectionStart;
    const y = scrollY;
    state.search = e.target.value;
    render();
    const next = $('placeSearch');
    next.focus();
    next.setSelectionRange(pos, pos);
    scrollTo(0, y);
  }
});

$('modalroot').addEventListener('click', (e) => {
  if (e.target.id === 'back') closeModal();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && modalOpen()) closeModal();
});

// ---- 起動 ----
(async function start() {
  try {
    await load();
  } catch {
    state.persistent = false;
  }
  render();
  if (!state.persistent) toast('この環境では保存できません。書き出しを使ってね');
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('./sw.js').catch(() => {});
})();
