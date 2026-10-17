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

export const BACKGROUND_IDS = new Set(BACKGROUNDS.map((b) => b.id));
export const backgroundLabel = (id) => BACKGROUNDS.find((b) => b.id === id)?.label || 'シンプル';
