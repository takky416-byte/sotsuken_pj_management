import { useState } from 'react';
import { PALETTES, getPalette, setPalette, type PaletteId } from '../theme';
import { TONES, setTone, useTone, type ToneId } from '../lib/tone';

export function ThemePicker() {
  const [id, setId] = useState<PaletteId>(getPalette());
  const tone = useTone();
  return (
    <>
      <select className="theme-picker" aria-label="配色" value={id} onChange={(e) => { const v = e.target.value as PaletteId; setId(v); setPalette(v); }}>
        {PALETTES.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
      </select>
      <select className="theme-picker" aria-label="トーン" value={tone} onChange={(e) => setTone(e.target.value as ToneId)}>
        {TONES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
      </select>
    </>
  );
}
