import { state, hooks, current, getPlace, touch, flush, load, addTrip, removeTrip, selectTrip, saveSettings, applyTheme } from './state.js';
import { renderScreen, renderNavInner } from './views.js';
import { tripForm, memberForm, placeForm, stopForm, dayPickForm, checkForm, bookingForm, themeForm, navChooser, confirmForm, syncJoinForm, genreForm } from './forms.js';
import { closeModal, modalOpen, toast, download, shareFile, shareLinkText, handleEmojiClick } from './ui.js';
import { loadLinks, startPolling, scheduleSync, syncTrip, startSync, stopSync, linkUrl, normalizeRelay, parseSyncLink, links } from './sync.js';
import { serializeTrip, serializeBackup, parseImport, ImportError, MAX_IMPORT_BYTES } from './io.js';
import { moveProgress, dayStart } from './transit.js';
import { isHex } from './color.js';
import { normalizeTheme } from './model.js';

const $ = (id) => document.getElementById(id);

// 下のタブ: 選択の変化に合わせて、ガラスの丸を目的のタブへ滑らせる
let navReady = false;
let lastView = '';
function updateNav() {
  const nav = $('navroot');
  if (!nav.firstChild) nav.innerHTML = renderNavInner();
  let active = null;
  nav.querySelectorAll('button[data-tab]').forEach((b) => {
    const on = b.dataset.tab === state.tab;
    b.classList.toggle('active', on);
    if (on) {
      b.setAttribute('aria-current', 'page');
      active = b;
    } else b.removeAttribute('aria-current');
  });
  const glass = nav.querySelector('.navglass');
  if (!active || !glass || !active.offsetWidth) return; // 一覧・アプリ設定のときはバー自体が非表示
  if (lastView !== state.view) {
    navReady = false;
    lastView = state.view;
  }
  const x = active.offsetLeft;
  const moved = glass.dataset.x !== String(x);
  // 動く時間は距離に合わせて少しだけ変える(行き過ぎる動きはなし。どのタブへも同じ質感で滑る)
  const prev = Number(glass.dataset.x);
  const steps = Number.isFinite(prev) ? Math.abs(x - prev) / active.offsetWidth : 1;
  glass.style.setProperty('--glass-dur', (0.34 + 0.06 * Math.min(steps, 3)).toFixed(2) + 's');
  glass.style.width = active.offsetWidth + 'px';
  glass.style.transform = 'translateX(' + x + 'px)';
  glass.dataset.x = String(x);
  if (moved && navReady) {
    // 水がのびてまとまるような動き(動きを減らす設定では CSS 側で止める)
    glass.classList.remove('flow');
    void glass.offsetWidth;
    glass.classList.add('flow');
  }
  navReady = true;
  nav.classList.add('ready');
}
addEventListener('resize', updateNav);

function render() {
  const t = current();
  applyTheme(t);
  if (!t && state.view === 'trip') state.view = 'list';
  document.body.dataset.view = state.view;
  document.body.dataset.tab = state.tab;
  document.body.dataset.bg = t ? t.background : 'plain';
  document.body.style.setProperty('--bg-photo', t && t.backgroundPhoto ? `url("${t.backgroundPhoto}")` : 'none');
  $('view').innerHTML = renderScreen(t);
  updateNav();
  updateTracks();
}
hooks.render = render;
hooks.onSaveError = () => toast('保存できませんでした。空き容量を確認してね');

// ---- 移動アニメーション: 時刻から位置を計算して、線の上のアイコンを動かす ----
function fmtWait(ms) {
  const m = Math.max(1, Math.ceil(ms / 60000));
  return m >= 60 ? `${Math.floor(m / 60)}時間${m % 60 ? (m % 60) + '分' : ''}` : `${m}分`;
}

// 移動中は、出発の丸から次の予定の丸まで、時間軸(縦の線)の上を乗り物のマークが進む。
// 15秒ごとに「15秒後の位置」へ向けて動かすので、なめらかに進み続けて見える。
function placeRider(rider, stopEl, now, start, end, p) {
  const next = stopEl.nextElementSibling?.classList.contains('stop') ? stopEl.nextElementSibling : null;
  const y0 = stopEl.offsetTop + 27; // 丸(ドット)の中心の高さ
  const y1 = next ? next.offsetTop + 27 : stopEl.offsetTop + stopEl.offsetHeight;
  const yAt = (q) => y0 + (y1 - y0) * q;
  const first = rider.hidden;
  rider.textContent = stopEl.dataset.emoji;
  rider.hidden = false;
  const half = rider.offsetHeight / 2;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (first || reduce) {
    rider.style.transition = 'none';
    rider.style.top = yAt(p) - half + 'px';
    void rider.offsetWidth;
  }
  if (!reduce) {
    const ahead = Math.min(1, (now + 15000 - start) / (end - start));
    rider.style.transition = 'top 15s linear';
    rider.style.top = yAt(ahead) - half + 'px';
  }
}

function updateTracks() {
  const now = Date.now();
  const rider = document.querySelector('.liverider');
  let riding = false;
  document.querySelectorAll('.stop.move[data-start]').forEach((el) => {
    const start = Number(el.dataset.start);
    const end = Number(el.dataset.end);
    const { state: st, p } = moveProgress(now, start, end);
    el.dataset.state = st;
    const label = document.querySelector(`[data-status="${CSS.escape(el.dataset.id)}"]`);
    if (label) {
      label.textContent =
        st === 'before' ? `出発まであと${fmtWait(start - now)}` : st === 'moving' ? `移動中 ${Math.round(p * 100)}%(到着まであと${fmtWait(end - now)})` : st === 'arrived' ? '到着済み' : '';
    }
    if (rider && st === 'moving' && !riding) {
      riding = true;
      placeRider(rider, el, now, start, end, p);
    }
  });
  if (rider && !riding) rider.hidden = true;
}
addEventListener('resize', updateTracks);
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
    state.view = trips.length === 1 ? 'trip' : 'list';
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
    state.gearTab = ['memo', 'booking'].includes(b.dataset.gear) ? b.dataset.gear : 'list';
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
    case 'save-relay': {
      const v = $('relayUrl').value.trim();
      if (!v) {
        state.settings.relay = '';
        saveSettings();
        toast('同期サーバーを外しました');
        return render();
      }
      const r = normalizeRelay(v);
      if (!r) return toast('https://〜.workers.dev の形で入れてください');
      state.settings.relay = r;
      saveSettings();
      toast('保存しました');
      return render();
    }
    case 'join-paste': {
      const j = parseSyncLink($('joinText').value);
      if (!j) return toast('同期リンクを読み取れませんでした');
      return syncJoinForm(j);
    }
    case 'go-list': state.view = 'list'; render(); return scrollTo(0, 0);
    case 'open-app-settings': state.view = 'app'; render(); return scrollTo(0, 0);
    case 'new-trip': return tripForm();
    case 'open-trip': selectTrip(id); state.view = 'trip'; state.activeDay = todayDayOrFirst(state.trips.find((x) => x.id === id)); state.tab = 'schedule'; render(); return scrollTo(0, 0);
    case 'import': return $('importFile').click();
    case 'export-all': download(`tabi-backup-${stamp()}.json`, serializeBackup(state.trips)); return toast('バックアップを保存したよ');
    case 'app-color': state.settings.accent = b.dataset.hex; saveSettings(); return render();
    case 'delete-trip': {
      const target = state.trips.find((x) => x.id === id);
      if (!target) return;
      const wasCurrent = state.currentId === id;
      removeTrip(id).then(() => {
        render();
        toast(`「${target.name}」を削除しました`, { label: '元に戻す', fn: () => addTrip(target, { select: wasCurrent }).then(render) });
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
      // 決定中の候補をもう一度押すと、決定を解除する(候補は残る)
      const unset = s.placeId === b.dataset.place;
      s.placeId = unset ? '' : b.dataset.place;
      touch(t);
      render();
      return toast(unset ? '決定を解除しました' : '予定に反映したよ');
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
    case 'edit-booking': return bookingForm(t, id ? t.bookings.find((x) => x.id === id) : null);
    case 'toggle-booking': {
      const bk = t.bookings.find((x) => x.id === id);
      if (!bk) return;
      bk.done = !bk.done;
      touch(t);
      return render();
    }
    case 'remove-booking': {
      const bk = t.bookings.find((x) => x.id === id);
      if (!bk) return;
      closeModal();
      return removeWithUndo(t, `「${bk.title}」`, () => (t.bookings = t.bookings.filter((x) => x.id !== id)));
    }
    case 'add-genre': return genreForm(t);
    case 'delete-genre': {
      const g = t.genres.find((x) => x.id === id);
      if (!g) return;
      return removeWithUndo(t, `ジャンル「${g.name}」`, () => {
        t.genres = t.genres.filter((x) => x.id !== id);
        for (const p of t.places) if (p.cat === g.name) p.cat = 'その他';
        if (state.filter === g.name) state.filter = 'すべて';
      });
    }
    case 'toggle-reorder': state.reorder = !state.reorder; return render();
    case 'move-check': {
      const i = t.checklist.findIndex((x) => x.id === id);
      const j = i + Number(b.dataset.dir);
      if (i < 0 || j < 0 || j >= t.checklist.length) return;
      [t.checklist[i], t.checklist[j]] = [t.checklist[j], t.checklist[i]];
      touch(t);
      return render();
    }
    case 'sync-start': {
      toast('同期を始めています…');
      startSync(t, state.settings.relay)
        .then(() => {
          render();
          toast('同期を始めました。「リンクを送る」で相手に送ってね');
        })
        .catch((e) => toast(e.message || '同期を始められませんでした'));
      return;
    }
    case 'sync-share': {
      if (!links.has(t.id)) return;
      // 共有シートはボタンを押した直後に開く必要がある
      shareLinkText(linkUrl(t), `旅のプラン「${t.name}」の同期リンク`).then((r) => {
        if (r === 'copied') toast('リンクをコピーしました。相手に送ってね');
        else if (r === 'failed') toast('リンクを共有できませんでした');
      });
      return;
    }
    case 'sync-now': {
      syncTrip(t).then(() => {
        render();
        const l = links.get(t.id);
        toast(l?.status === 'error' ? l.error : '同期しました');
      });
      return;
    }
    case 'sync-stop':
      return confirmForm('同期をやめる', 'この端末の同期をやめます。旅行の内容は、この端末にも相手の端末にもそのまま残ります。', 'やめる', () => {
        stopSync(t.id).then(() => {
          render();
          toast('同期をやめました');
        });
      });
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
  // カード(role=button)はキーボードでも開ける
  if ((e.key === 'Enter' || e.key === ' ') && e.target.matches?.('.tripcard') && e.target === document.activeElement) {
    e.preventDefault();
    e.target.click();
  }
});

// ---- 起動 ----
(async function start() {
  try {
    await load();
  } catch {
    state.persistent = false;
  }
  state.activeDay = todayDayOrFirst(current());
  await loadLinks(state.trips);
  hooks.onChange = (t) => scheduleSync(t);
  hooks.onSyncState = () => {
    // 旅行の設定を見ているときだけ、同期の状態を描き直す(入力中は触らない)
    if (state.view === 'trip' && state.tab === 'tripsettings' && !modalOpen() && !document.activeElement?.matches?.('input, textarea, select')) render();
  };
  render();
  startPolling(current);
  // 同期リンクを開いて来たときは、参加の確認を出す
  const joinLink = parseSyncLink(location.hash);
  if (joinLink) {
    history.replaceState(null, '', location.pathname + location.search);
    syncJoinForm(joinLink);
  }
  if (!state.persistent) toast('この環境では保存できません。書き出しを使ってね');
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('./sw.js').catch(() => {});
})();
