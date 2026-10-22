// 関与の集計 (学生ごと)。直近の期間 (日報の読み込み期間) だけが対象。
// 目安であり、点数や成績には換算しない。「数字を稼ぐ」行動を誘発しないよう、順位や合計点は出さない。
import type { ClassDay, Member, Task } from '../types';
import { classDatesBetween, fromDailyStart, statusOf, type Daily, type DayStatus } from './daily';
import type { Meeting } from './meeting';

export type Thank = { id: string; from: string; to: string; note: string; date: string; createdAt: number };

export type MemberStat = {
  sid: string;
  name: string;
  /** 日報を読めないとき (チーム内の閲覧がオフで、他の人の分) は null */
  daily: { submitted: number; days: number; streak: number } | null;
  /** 日報で触れたタスクの数 (種類) */
  touched: number | null;
  /** 担当しているタスク (保留を除く) */
  assigned: number;
  done: number;
  overdue: number;
  promises: { done: number; total: number };
  thanks: { received: number; sent: number };
};

export type EngagementInput = {
  members: Member[];
  tasks: Task[];
  /** null: 日報を読めない */
  dailies: Daily[] | null;
  meetings: Meeting[];
  thanks: Thank[];
  classDays: ClassDay[];
  today: string;
  dailyStart: string;
  windowFrom: string;
  /** キックオフの日 (YYYY-MM-DD)。これより前の授業日は対象にしない */
  kickoffDate: string | null;
};

/** 連続して提出した授業日の数。今日が未提出でも、まだ途切れさせない。欠席の日は数えず、途切れさせもしない。 */
export function streakOf(statusByDate: ReadonlyMap<string, DayStatus>, dates: string[], today: string): number {
  let n = 0;
  for (const date of [...dates].reverse()) {
    const s = statusByDate.get(date) ?? 'missing';
    if (s === 'absent') continue;
    if (s === 'submitted') { n++; continue; }
    if (date === today) continue; // 今日は、まだ終わっていない
    break;
  }
  return n;
}

export function engagement(input: EngagementInput): MemberStat[] {
  const { tasks, dailies, meetings, thanks, today } = input;
  const live = tasks.filter((t) => !t.deleted);
  const from = [input.windowFrom, input.dailyStart, input.kickoffDate ?? ''].sort().at(-1) as string;
  const dates = classDatesBetween(fromDailyStart(input.classDays, input.dailyStart), from, `${today}~`); // 今日を含む
  const byKey = new Map((dailies ?? []).map((d) => [`${d.date}_${d.sid}`, d]));

  return input.members.map((m) => {
    let daily: MemberStat['daily'] = null;
    let touched: number | null = null;
    if (dailies) {
      const st = new Map<string, DayStatus>(dates.map((d) => [d, statusOf(byKey.get(`${d}_${m.sid}`))]));
      // 数えるのは、過ぎた授業日と、提出済みの今日。欠席は、数えない
      const counted = dates.filter((d) => st.get(d) !== 'absent' && (d < today || st.get(d) === 'submitted'));
      daily = {
        submitted: counted.filter((d) => st.get(d) === 'submitted').length,
        days: counted.length,
        streak: streakOf(st, dates, today),
      };
      const ids = new Set<string>();
      for (const d of dailies) if (d.sid === m.sid && d.date >= from) for (const e of d.entries) if (e.taskId && e.note.trim()) ids.add(e.taskId);
      touched = ids.size;
    }
    const mine = live.filter((t) => (t.assignees ?? []).includes(m.sid) && t.status !== 'hold');
    const promises = meetings.flatMap((x) => x.actions).filter((a) => a.owner === m.sid);
    return {
      sid: m.sid, name: m.name, daily, touched,
      assigned: mine.length,
      done: mine.filter((t) => t.status === 'done').length,
      overdue: mine.filter((t) => t.status !== 'done' && t.endDate !== null && t.endDate < today).length,
      promises: { done: promises.filter((a) => a.done).length, total: promises.length },
      thanks: { received: thanks.filter((t) => t.to === m.sid).length, sent: thanks.filter((t) => t.from === m.sid).length },
    };
  });
}

/** 教員向けの注意 (目安)。学生には出さない。 */
export function attention(s: MemberStat): string[] {
  const out: string[] = [];
  if (s.daily && s.daily.days >= 2 && s.daily.submitted / s.daily.days < 0.5) out.push('日報の提出が半分未満');
  if (s.assigned === 0) out.push('担当タスクがない');
  if (s.overdue > 0) out.push(`期限超過 ${s.overdue}件`);
  if (s.assigned > 0 && s.done === 0 && s.daily && s.daily.days >= 3) out.push('担当は あるが完了がない');
  if (s.promises.total > 0 && s.promises.done === 0) out.push('約束が1件も果たされていない');
  return out;
}

/** 今日の日報を提出したとして、自分の連続提出日数 (提出した直後のお祝い用)。 */
export function streakIfSubmitted(
  mine: Daily[], sid: string, classDays: ClassDay[], dailyStart: string, windowFrom: string, today: string,
): number {
  const dates = classDatesBetween(fromDailyStart(classDays, dailyStart), windowFrom, `${today}~`);
  if (!dates.includes(today)) return 0; // 授業日でない日は、連続には数えない
  const st = new Map<string, DayStatus>(dates.map((d) => [d, statusOf(mine.find((x) => x.sid === sid && x.date === d))]));
  st.set(today, 'submitted');
  return streakOf(st, dates, today);
}
