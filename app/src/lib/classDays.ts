import type { ClassDay } from '../types';
import { parseCsv } from './csv';
import { isDateString } from './dates';

export const PERIODS: { value: ClassDay['periods']; label: string }[] = [
  { value: '3-4', label: '3-4限(火・水)' },
  { value: '1-2', label: '1-2限(木)' },
];

export const sortDays = (days: ClassDay[]): ClassDay[] => [...days].sort((a, b) => a.date.localeCompare(b.date));

/** 同じ日付があれば置き換え、なければ追加する。日付順に並べる。 */
export function upsertDay(days: ClassDay[], day: ClassDay): ClassDay[] {
  return sortDays([...days.filter((d) => d.date !== day.date), day]);
}

export const removeDay = (days: ClassDay[], date: string): ClassDay[] => days.filter((d) => d.date !== date);

/** 授業日として正しいか。正しければ null、そうでなければ、画面に出す理由。 */
export function validateDay(d: Partial<ClassDay>): string | null {
  if (!isDateString(d.date)) return '日付は YYYY-MM-DD の形で入力してください';
  if (d.periods !== '1-2' && d.periods !== '3-4') return '時限は 1-2限 か 3-4限 を選んでください';
  if ((d.note ?? '').length > 100) return '備考は100文字以内にしてください';
  return null;
}

const normPeriods = (s: string): ClassDay['periods'] | null => {
  const m = /^([13])\s*[-・~〜～]\s*([24])\s*限?$/.exec(s.trim());
  if (!m) return null;
  const p = `${m[1]}-${m[2]}`;
  return p === '1-2' || p === '3-4' ? p : null;
};

const truthy = (s: string) => /^(1|true|yes|y|○|〇|あり|有|実施)$/i.test(s.trim());

/**
 * 「日付,時限,備考,ミーティング」の CSV を読む (備考・ミーティングは省略可)。1行目が見出しなら読み飛ばす。
 * ミーティングを省略したときは、木曜 (1-2限) の日だけ「あり」とする。
 */
export function parseClassDaysCsv(text: string): { days: ClassDay[]; errors: { line: number; message: string }[] } {
  const days: ClassDay[] = [];
  const errors: { line: number; message: string }[] = [];
  const seen = new Set<string>();
  parseCsv(text).forEach((cols, i) => {
    const line = i + 1;
    const [date = '', period = '', note = '', meeting] = cols;
    if (i === 0 && !isDateString(date) && /日付|date/i.test(date)) return;
    const periods = normPeriods(period);
    if (!isDateString(date)) errors.push({ line, message: `日付が正しくありません: ${date}` });
    else if (!periods) errors.push({ line, message: `時限は 1-2 か 3-4 で指定してください: ${period}` });
    else if (seen.has(date)) errors.push({ line, message: `日付が重複しています: ${date}` });
    else {
      seen.add(date);
      const isThursday = new Date(`${date}T00:00:00Z`).getUTCDay() === 4;
      days.push({ date, periods, note: note.slice(0, 100), meeting: meeting === undefined || meeting === '' ? isThursday && periods === '1-2' : truthy(meeting) });
    }
  });
  return { days: sortDays(days), errors };
}
