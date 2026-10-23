// タスクの1行入力から、担当と期限を読み取る。
//   ログイン画面を作る @小林 〜10/30      → 担当: 小林、終了日: 10/30
//   ワイヤーフレーム @高瀬 @小林 11/5まで → 担当: 高瀬と小林、終了日: 11/5
// 読み取れなかった部分は、タスク名のまま残す。
import type { Member } from '../types';
import { addDays } from './dates';

export type QuickAdd = { title: string; assignees: string[]; endDate: string | null };

/** 月・日から、今日に近い年の日付を作る (今日より半年以上前なら、来年)。不正な日付は null。 */
const exists = (y: number, m: number, d: number) => {
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() + 1 === m && t.getUTCDate() === d; // 2/30 は、3/2 に繰り上がるので、はじく
};

export function guessDate(month: number, day: number, today: string): string | null {
  const year = Number(today.slice(0, 4));
  const pad = (n: number) => String(n).padStart(2, '0');
  const make = (y: number) => `${y}-${pad(month)}-${pad(day)}`;
  if (!exists(year, month, day)) return null;
  const date = make(year);
  if (date >= addDays(today, -180)) return date;
  return exists(year + 1, month, day) ? make(year + 1) : null;
}

export function parseQuickAdd(text: string, members: Member[], today: string): QuickAdd {
  let rest = text;
  const assignees: string[] = [];

  // @名前 (苗字の先頭が合う人。長い名前を先に探す)
  rest = rest.replace(/[@＠]([^\s@＠〜~]+)/g, (whole, name: string) => {
    const m = [...members].sort((a, b) => b.name.length - a.name.length).find((x) => x.name.startsWith(name) || name.startsWith(x.name));
    if (!m) return whole;
    if (!assignees.includes(m.sid)) assignees.push(m.sid);
    return ' ';
  });

  // 〜10/30 / ~10/30 / 10/30まで
  let endDate: string | null = null;
  rest = rest.replace(/(?:[〜~～]\s*(\d{1,2})\/(\d{1,2}))|(?:(\d{1,2})\/(\d{1,2})\s*まで)/, (whole, m1, d1, m2, d2) => {
    const d = guessDate(Number(m1 ?? m2), Number(d1 ?? d2), today);
    if (!d) return whole;
    endDate = d;
    return ' ';
  });

  const title = rest.replace(/\s+/g, ' ').trim();
  return title ? { title, assignees, endDate } : { title: text.trim(), assignees: [], endDate: null };
}
