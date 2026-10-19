// モーダル・トースト・絵文字ピッカーなど、画面共通の部品
import { esc, clamp } from './util.js';
import { EMOJI_GROUPS } from './emoji.js';

const $ = (id) => document.getElementById(id);

let lastFocus = null;
let submitHandler = null;

// 入力画面を開いている間は、後ろのページを動かせないように固定する。
// iPhone は、入力欄に触れると、後ろのページを動かして入力欄を見せようとするため、後ろが一番上へ戻ったように見える。
let locked = false;
let lockedY = 0;
export const scrollLocked = () => locked;
export const modalHooks = { onClosed: () => {} };

function lockScroll() {
  if (locked) return;
  locked = true;
  lockedY = scrollY;
  document.body.style.top = `-${lockedY}px`;
  document.body.classList.add('modal-open');
}

function unlockScroll() {
  if (!locked) return;
  locked = false;
  document.body.classList.remove('modal-open');
  document.body.style.top = '';
  const root = document.documentElement;
  root.style.scrollBehavior = 'auto';
  scrollTo(0, lockedY);
  root.style.scrollBehavior = '';
}

export function openModal(html, onSubmit) {
  lastFocus = document.activeElement;
  $('modalroot').innerHTML = `<div class="modalback" id="back"><div class="modal" role="dialog" aria-modal="true">${html}</div></div>`;
  submitHandler = onSubmit || null;
  lockScroll();
  restructureModal();
  const form = $('modalForm');
  if (form && onSubmit) {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      if (onSubmit(new FormData(form), form) !== false) closeModal();
    });
  }
  $('modalroot').querySelector('input:not([type=hidden]),select,textarea,button')?.focus({ preventScroll: true });
}

// 閉じる(左上)と保存(右上)を、アイコンで画面の上に固定する。削除などの追加ボタンは下に残す。
const X_ICON = '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M6 6l12 12M18 6L6 18"/></svg>';
const CHECK_ICON = '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';

function restructureModal() {
  const modal = $('modalroot').querySelector('.modal');
  const h2 = modal?.querySelector('h2');
  if (!h2) return;
  const form = modal.querySelector('#modalForm');
  const actions = modal.querySelector('.modalactions');
  const submit = actions?.querySelector('button[type="submit"]');
  const head = document.createElement('div');
  head.className = 'modalhead';
  head.innerHTML = `<button type="button" class="iconbtn closer" data-action="close" aria-label="閉じる">${X_ICON}</button>`;
  head.append(h2);
  if (form && submit) {
    head.insertAdjacentHTML('beforeend', `<button type="submit" form="modalForm" class="iconbtn primary" aria-label="${esc(submit.textContent.trim() || '保存')}">${CHECK_ICON}</button>`);
  } else {
    head.insertAdjacentHTML('beforeend', '<span class="iconbtn ghost" aria-hidden="true"></span>');
  }
  actions?.querySelectorAll('button[data-action="close"], button[type="submit"]').forEach((b) => b.remove());
  if (actions && !actions.children.length) actions.remove();
  modal.prepend(head);
  // エラー表示は、保存ボタンの近く(上)に出す
  const error = modal.querySelector('.formerror');
  if (error) head.after(error);
}

export function closeModal() {
  $('modalroot').textContent = '';
  submitHandler = null;
  unlockScroll();
  modalHooks.onClosed();
  lastFocus?.focus?.({ preventScroll: true });
}

export const modalOpen = () => !!$('modalroot').firstChild;

let toastTimer = 0;
export function toast(message, action) {
  const root = $('toastroot');
  root.innerHTML = `<div class="toast"><span>${esc(message)}</span>${action ? `<button class="toastbtn" type="button" data-toast-action>${esc(action.label)}</button>` : ''}</div>`;
  root.querySelector('[data-toast-action]')?.addEventListener('click', () => {
    clearTimeout(toastTimer);
    root.textContent = '';
    action.fn();
  });
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (root.textContent = ''), action ? 9000 : 2600);
}

export function download(filename, text) {
  const blob = new Blob([text], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

// 写真を縮小してJPEGに作り直す。作り直すことで、撮影場所などのメタデータは取り除かれる。
export async function resizeImage(file, maxSide = 1200, maxLength = 600000) {
  if (!file || !String(file.type).startsWith('image/') || file.size > 25 * 1024 * 1024) throw new Error('bad image');
  const bmp = await createImageBitmap(file);
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  // 大きすぎるときは、画質を下げ、それでもだめなら寸法も小さくして作り直す
  for (const side of [maxSide, maxSide * 0.75, maxSide * 0.5]) {
    const scale = Math.min(1, side / Math.max(bmp.width, bmp.height));
    canvas.width = Math.max(1, Math.round(bmp.width * scale));
    canvas.height = Math.max(1, Math.round(bmp.height * scale));
    ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    for (const q of [0.72, 0.6, 0.5, 0.4]) {
      const url = canvas.toDataURL('image/jpeg', q);
      if (url.length <= maxLength) {
        bmp.close?.();
        return url;
      }
    }
  }
  bmp.close?.();
  throw new Error('too large');
}

// 共有シート(AirDrop・メッセージ・ファイルへ保存など)でファイルを渡す。
// 端末が対応していない場合は 'unsupported'。ボタンを押した直後(ユーザー操作の中)で呼ぶこと。
export async function shareFile(filename, text, title) {
  if (!navigator.share || !navigator.canShare) return 'unsupported';
  // iPhoneのSafariは対応するファイル形式が限られるため、通らなければ text/plain で試す
  for (const type of ['application/json', 'text/plain']) {
    const file = new File([text], filename, { type });
    if (!navigator.canShare({ files: [file] })) continue;
    try {
      await navigator.share({ files: [file], title });
      return 'shared';
    } catch (e) {
      return e?.name === 'AbortError' ? 'cancelled' : 'unsupported';
    }
  }
  return 'unsupported';
}

// リンクなどの文字を、共有シート(AirDrop・メッセージなど)で渡す。使えなければコピーする。
export async function shareLinkText(url, title) {
  try {
    if (navigator.share) {
      await navigator.share({ title, url });
      return 'shared';
    }
  } catch (e) {
    if (e?.name === 'AbortError') return 'cancelled';
  }
  try {
    await navigator.clipboard.writeText(url);
    return 'copied';
  } catch {
    return 'failed';
  }
}

// 絵文字フィールド。ボタンを押すと一覧が開き、選ぶと hidden input に入る
export function emojiField(name, value, { groups = EMOJI_GROUPS, allowEmpty = false, label = '絵文字' } = {}) {
  return `<div class="emojifield" data-emojifield>
    <input type="hidden" name="${esc(name)}" value="${esc(value)}">
    <button type="button" class="emojibtn" data-emoji-toggle aria-label="${esc(label)}を選ぶ" aria-expanded="false">${esc(value) || '＋'}</button>
    <div class="emojigrid" hidden>
      ${allowEmpty ? '<button type="button" class="emojicell txt" data-emoji-pick="">なし</button>' : ''}
      ${groups.map((g) => `<div class="emojigroup">${esc(g.name)}</div><div class="emojirow">${g.list.map((e) => `<button type="button" class="emojicell" data-emoji-pick="${esc(e)}" aria-label="${esc(e)}">${esc(e)}</button>`).join('')}</div>`).join('')}
    </div>
  </div>`;
}

// ピッカーのクリック処理。処理したら true
export function handleEmojiClick(target) {
  const toggle = target.closest('[data-emoji-toggle]');
  if (toggle) {
    const field = toggle.closest('[data-emojifield]');
    const grid = field.querySelector('.emojigrid');
    grid.hidden = !grid.hidden;
    toggle.setAttribute('aria-expanded', String(!grid.hidden));
    return true;
  }
  const pick = target.closest('[data-emoji-pick]');
  if (pick) {
    const field = pick.closest('[data-emojifield]');
    const v = pick.dataset.emojiPick;
    field.querySelector('input[type=hidden]').value = v;
    field.querySelector('[data-emoji-toggle]').textContent = v || '＋';
    field.querySelector('.emojigrid').hidden = true;
    field.querySelector('[data-emoji-toggle]').setAttribute('aria-expanded', 'false');
    field.dispatchEvent(new Event('emojichange', { bubbles: true }));
    return true;
  }
  return false;
}

export const formVal = (f, k) => String(f.get(k) ?? '').trim();
export const formInt = (f, k, min, max, fallback) => clamp(Math.round(Number(formVal(f, k))) || fallback, min, max);
