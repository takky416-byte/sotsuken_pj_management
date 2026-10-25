import { isDateString } from './dates';

/** 叩き台の「期間」の行。「2026-11-02〜2026-11-10」「11/2〜11/10」を、開始日・終了日にする (どちらか1つでも、その日1日)。読めなければ null */
export function parsePeriod(text: string): { startDate: string; endDate: string } | null {
  const iso = (s: string): string | null => {
    s = s.trim();
    if (isDateString(s)) return s;
    const m = /^(\d{1,2})\/(\d{1,2})$/.exec(s);
    if (!m) return null;
    const mon = Number(m[1]);
    const d = `${mon >= 10 ? 2026 : 2027}-${String(mon).padStart(2, '0')}-${String(Number(m[2])).padStart(2, '0')}`;
    return isDateString(d) ? d : null;
  };
  const parts = text.split(/[〜~－-]{1}(?=\s*(?:\d{4}-|\d{1,2}\/))/).map(iso);
  if (parts.length === 1 && parts[0]) return { startDate: parts[0], endDate: parts[0] };
  if (parts.length === 2 && parts[0] && parts[1]) return { startDate: parts[0], endDate: parts[1] };
  return null;
}
