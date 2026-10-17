// モーダル・トースト・絵文字ピッカーなど、画面共通の部品
import { esc, clamp } from './util.js';
import { EMOJI_GROUPS } from './emoji.js';

const $ = (id) => document.getElementById(id);

let lastFocus = null;
let submitHandler = null;

export function openModal(html, onSubmit) {
  lastFocus = document.activeElement;
  $('modalroot').innerHTML = `<div class="modalback" id="back"><div class="modal" role="dialog" aria-modal="true">${html}</div></div>`;
  submitHandler = onSubmit || null;
  const form = $('modalForm');
  if (form && onSubmit) {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      if (onSubmit(new FormData(form), form) !== false) closeModal();
    });
  }
  $('modalroot').querySelector('input:not([type=hidden]),select,textarea,button')?.focus({ preventScroll: true });
}

export function closeModal() {
  $('modalroot').textContent = '';
  submitHandler = null;
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
