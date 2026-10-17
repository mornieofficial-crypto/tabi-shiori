// 色の計算。誕生日カラーは月日だけから数式で決める(外部の一覧は使わない)。

const MONTH_DAYS = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

export const isHex = (s) => /^#[0-9a-f]{6}$/i.test(s || '');

export function parseBirthday(s) {
  const m = /^(\d{2})-(\d{2})$/.exec(s || '');
  if (!m) return null;
  const month = +m[1];
  const day = +m[2];
  if (month < 1 || month > 12 || day < 1 || day > MONTH_DAYS[month - 1]) return null;
  return { month, day };
}

// 2月29日を含む 1〜366 の通し日
export function dayOfYear({ month, day }) {
  let n = day;
  for (let i = 0; i < month - 1; i++) n += MONTH_DAYS[i];
  return n;
}

// 黄色〜黄緑(色相35°〜95°)は、くすんで見えるので使わない。色相の輪からその範囲を除いて割り当てる
export const SKIP_HUE_FROM = 35;
export const SKIP_HUE_LEN = 60;

export function birthdayColor(s) {
  const b = parseBirthday(s);
  if (!b) return null;
  const x = ((dayOfYear(b) - 1) / 366) * (360 - SKIP_HUE_LEN);
  return hslToHex(x < SKIP_HUE_FROM ? x : x + SKIP_HUE_LEN, 58, 52);
}

export function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export const rgbToHex = ([r, g, b]) =>
  '#' + [r, g, b].map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')).join('');

export function hslToHex(h, s, l) {
  s /= 100;
  l /= 100;
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return rgbToHex([f(0) * 255, f(8) * 255, f(4) * 255]);
}

export function hexToHsl(hex) {
  const [r, g, b] = hexToRgb(hex).map((v) => v / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return [0, 0, l * 100];
  const s = d / (1 - Math.abs(2 * l - 1));
  let h;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return [(h * 60 + 360) % 360, s * 100, l * 100];
}

export function luminance(hex) {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

// 背景 bg の上で ratio 以上のコントラストになるまで暗くする
export function ensureContrast(hex, bg = '#ffffff', ratio = 4.5) {
  if (contrast(hex, bg) >= ratio) return hex;
  const [h, s, l0] = hexToHsl(hex);
  for (let l = l0; l > 3; l -= 1) {
    const c = hslToHex(h, s, l);
    if (contrast(c, bg) >= ratio) return c;
  }
  return '#000000';
}

export function mix(a, b, t) {
  const ra = hexToRgb(a);
  const rb = hexToRgb(b);
  return rgbToHex(ra.map((v, i) => v + (rb[i] - v) * t));
}

// アプリ全体に当てる色。hexB を渡すと2色のグラデーション
export function themeVars(hexA, hexB) {
  const ink = ensureContrast(hexA, '#ffffff', 4.5);
  const ink2 = hexB ? ensureContrast(hexB, '#ffffff', 4.5) : mix(ink, '#ffffff', 0.35);
  return {
    '--accent': hexA,
    '--accent-ink': ink,
    '--accent-ink2': ink2,
    '--tint': mix(hexA, '#ffffff', 0.88),
    '--tint-line': mix(hexA, '#ffffff', 0.7),
  };
}

// メンバー色のバッジ用(薄い背景の上で読める文字色)
export function badgeColors(hex) {
  const bg = mix(hex, '#ffffff', 0.85);
  return { bg, border: mix(hex, '#ffffff', 0.55), ink: ensureContrast(hex, bg, 4.5) };
}

export const DEFAULT_ACCENT = '#305e51';

export const PRESET_COLORS = [
  '#305e51', '#3b6ea5', '#7a5aa6', '#c0527a', '#c4533a', '#2b8a9d', '#5d8a3c', '#4a4a4a',
];
