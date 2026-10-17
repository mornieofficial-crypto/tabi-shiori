export const uid = () =>
  crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36);

export const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export const clamp = (n, min, max) => Math.min(max, Math.max(min, n));

// 絵文字(サロゲートペア)の途中で切らないよう、コードポイント単位で切り詰める
export const str = (v, max) => Array.from(String(v ?? '')).slice(0, max).join('');

export const isDateStr = (s) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || '');
  if (!m) return false;
  const d = new Date(+m[1], +m[2] - 1, +m[3]);
  return d.getFullYear() === +m[1] && d.getMonth() === +m[2] - 1 && d.getDate() === +m[3];
};

export const isTimeStr = (s) => /^([01]\d|2[0-3]):[0-5]\d$/.test(s || '');
