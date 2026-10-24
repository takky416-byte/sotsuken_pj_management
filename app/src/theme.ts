// 配色の切り替え。選んだ配色は、この端末のブラウザにだけ保存する (サーバーには送らない)。
export const PALETTES = [
  { id: 'ocean', label: 'ブルー' },
  { id: 'classic', label: 'シンプル(白・グレー)' },
  { id: 'mint', label: 'グリーン' },
  { id: 'pop', label: 'パープル' },
  { id: 'sunset', label: 'オレンジ' },
] as const;

export type PaletteId = (typeof PALETTES)[number]['id'];
const KEY = 'palette';

export function getPalette(): PaletteId {
  try {
    const v = localStorage.getItem(KEY);
    if (PALETTES.some((p) => p.id === v)) return v as PaletteId;
  } catch { /* 保存できない環境では、既定のまま */ }
  return 'ocean';
}

export function applyPalette(id: PaletteId = getPalette()) {
  document.documentElement.dataset.palette = id;
}

export function setPalette(id: PaletteId) {
  try { localStorage.setItem(KEY, id); } catch { /* 保存できなくても、この画面では切り替わる */ }
  applyPalette(id);
}
