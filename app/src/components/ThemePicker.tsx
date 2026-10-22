import { useState } from 'react';
import { PALETTES, getPalette, setPalette, type PaletteId } from '../theme';

export function ThemePicker() {
  const [id, setId] = useState<PaletteId>(getPalette());
  return (
    <select className="theme-picker" aria-label="配色" value={id} onChange={(e) => { const v = e.target.value as PaletteId; setId(v); setPalette(v); }}>
      {PALETTES.map((p) => <option key={p.id} value={p.id}>🎨 {p.label}</option>)}
    </select>
  );
}
