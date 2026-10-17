// 旅行ごとに選べる背景。見た目は css/app.css の [data-bg="..."] で定義する(画像は使わない)。
export const BACKGROUNDS = [
  { id: 'plain', label: 'シンプル' },
  { id: 'tint', label: 'テーマ色' },
  { id: 'dots', label: 'ドット' },
  { id: 'grid', label: '方眼' },
  { id: 'stripes', label: 'ストライプ' },
  { id: 'waves', label: '波' },
  { id: 'sky', label: '空' },
  { id: 'sunset', label: '夕焼け' },
];

// 写真は別扱い(選んだ写真が無ければ使えない)
export const BACKGROUND_IDS = new Set([...BACKGROUNDS.map((b) => b.id), 'photo']);

// 写真は、端末で縮小してJPEGに作り直したものだけを受け付ける(約500KBまで)
export const PHOTO_MAX_LENGTH = 700000;
export const isPhoto = (s) => typeof s === 'string' && s.length <= PHOTO_MAX_LENGTH && /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(s);
export const backgroundLabel = (id) => (id === 'photo' ? '写真' : BACKGROUNDS.find((b) => b.id === id)?.label || 'シンプル');
