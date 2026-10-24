// 日報の間があいたときの、やさしい促し (強い警告ではない)。学生本人の画面にだけ出す。
import type { ClassDay } from '../types';
import { statusOf, type Daily } from './daily';
import { sinceOf } from './dailyDraft';
import { addDays } from './dates';
import { daysBetween } from './gantt';

export type Nudge = {
  /** 0: 出さない / 1: 少し間があいている / 2: しばらく出ていない */
  level: 0 | 1 | 2;
  /** 前回の日報から今日まで (日)。前回がなければ null */
  daysSince: number | null;
  /** 前回の日報のあと、日報が出ていない授業日の数 (欠席を除く。今日は含まない) */
  missed: number;
  prevDate: string | null;
};

/** 目安: 授業日2回ぶん出ていなければ、やさしく促す。4回ぶん以上なら、少し丁寧に。 */
export const NUDGE_AT = 2;
export const NUDGE_STRONG_AT = 4;

export function nudgeOf(
  mine: Daily[], sid: string, today: string, classDays: ClassDay[], dailyStart: string, windowFrom: string,
): Nudge {
  const todayDoc = mine.find((d) => d.sid === sid && d.date === today);
  if (todayDoc && statusOf(todayDoc) !== 'missing') return { level: 0, daysSince: null, missed: 0, prevDate: null }; // 今日は、出し済み・欠席
  const { prevDate } = sinceOf(mine, sid, today);
  const from = [dailyStart, windowFrom, prevDate ? addDays(prevDate, 1) : ''].sort().at(-1) as string;
  const absent = new Set(mine.filter((d) => d.sid === sid && d.absent).map((d) => d.date));
  const missed = classDays.filter((d) => d.date >= from && d.date < today && !absent.has(d.date)).length;
  const level = missed >= NUDGE_STRONG_AT ? 2 : missed >= NUDGE_AT ? 1 : 0;
  return { level, daysSince: prevDate ? daysBetween(prevDate, today) : null, missed, prevDate };
}

export function nudgeMessage(n: Nudge, isClassDay: boolean): { title: string; body: string } | null {
  if (n.level === 0) return null;
  const when = n.prevDate ? `前回の日報(${Number(n.prevDate.slice(5, 7))}/${Number(n.prevDate.slice(8, 10))})から、${n.daysSince}日たちました。` : 'まだ日報が出ていません。';
  const go = isClassDay ? '今日の授業で、' : '次の授業日に、';
  if (n.level === 1) {
    return { title: '日報の間が、少しあいています', body: `${when}${go}授業時間外にやったことも含めて、まとめて書きましょう。` };
  }
  return {
    title: '日報を、そろそろ書いてみませんか',
    body: `${when}授業日${n.missed}回ぶんが、たまっています。${go}思い出せる範囲で、やったことをまとめて書いてみましょう。書きにくいことは、チームのメンバーに相談してみてください。`,
  };
}
