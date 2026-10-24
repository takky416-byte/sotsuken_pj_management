// 学生のホームに出す「今日やること」「次にやること」を決める (画面に依存しない)。
import type { ClassDay, Task } from '../types';
import { addDays } from './dates';
import { statusOf, type Daily } from './daily';
import type { Meeting, MeetingAction } from './meeting';
import { isLeaf } from './meetingView';

export type PlanReason = 'overdue' | 'doing' | 'period';
export type PlanItem = { task: Task; reason: PlanReason };

/** 今日やること: 自分が担当の、子のないタスクのうち、期限を過ぎている・進行中・予定の期間に入っているもの。急ぎのものから。 */
export function doToday(tasks: Task[], sid: string, today: string): PlanItem[] {
  const live = tasks.filter((t) => !t.deleted);
  const reason = (t: Task): PlanReason | null => {
    if (t.endDate && t.endDate < today) return 'overdue';
    if (t.status === 'doing') return 'doing';
    if (t.startDate && t.startDate <= today && (!t.endDate || t.endDate >= today)) return 'period';
    return null;
  };
  const rank: Record<PlanReason, number> = { overdue: 0, doing: 1, period: 2 };
  return live
    .filter((t) => isLeaf(live, t) && (t.assignees ?? []).includes(sid) && t.status !== 'done' && t.status !== 'hold')
    .flatMap((t) => { const r = reason(t); return r ? [{ task: t, reason: r }] : []; })
    .sort((a, b) => rank[a.reason] - rank[b.reason] || (a.task.endDate ?? '9999').localeCompare(b.task.endDate ?? '9999') || a.task.order - b.task.order);
}

/** 次にやること: 自分が担当で、これから始まる (開始日が今日より後、days 日以内) 未着手のタスク。始まりが近い順。 */
export function upcoming(tasks: Task[], sid: string, today: string, days = 14): Task[] {
  const live = tasks.filter((t) => !t.deleted);
  const limit = addDays(today, days);
  return live
    .filter((t) => isLeaf(live, t) && (t.assignees ?? []).includes(sid) && t.status === 'todo' && t.startDate !== null && t.startDate > today && t.startDate <= limit)
    .sort((a, b) => (a.startDate ?? '').localeCompare(b.startDate ?? '') || a.order - b.order);
}

/** 担当がいないタスク (完了・保留を除く)。期限が近いものから n 件。「担当する」ボタンの対象。 */
export function unassigned(tasks: Task[], today: string, n = 3): Task[] {
  const live = tasks.filter((t) => !t.deleted);
  const rank = (t: Task) => (t.endDate && t.endDate < today ? 0 : t.startDate && t.startDate <= today ? 1 : 2);
  return live
    .filter((t) => isLeaf(live, t) && (t.assignees ?? []).length === 0 && t.status !== 'done' && t.status !== 'hold')
    .sort((a, b) => rank(a) - rank(b) || (a.endDate ?? '9999').localeCompare(b.endDate ?? '9999') || a.order - b.order)
    .slice(0, n);
}

export type MyPromise = { meetingId: string; index: number; action: MeetingAction };

/** 自分が約束した、まだ終わっていないこと (ミーティングで「次の1週間でやること」に担当を付けられたもの)。 */
export function myPromises(meetings: Meeting[], sid: string): MyPromise[] {
  return [...meetings].sort((a, b) => b.date.localeCompare(a.date))
    .flatMap((m) => m.actions.map((action, index) => ({ meetingId: m.id, index, action })))
    .filter((p) => p.action.owner === sid && !p.action.done);
}

export type TodayStatus = 'submitted' | 'missing' | 'absent' | 'free';

export type DayInfo = {
  /** 今日は授業日か */
  isClassDay: boolean;
  periods: ClassDay['periods'] | null;
  /** 作業レポートの運用が始まっているか (始まる前は、書いても未提出にならない) */
  started: boolean;
  status: TodayStatus;
  next: ClassDay | null;
};

/** 今日の状況: 授業日か、作業レポートは出したか、次の授業日はいつか。 */
export function dayInfo(classDays: ClassDay[], today: string, dailyStart: string, mineToday: Daily | undefined): DayInfo {
  const day = classDays.find((d) => d.date === today);
  const started = today >= dailyStart;
  const s = statusOf(mineToday);
  const status: TodayStatus = s === 'absent' ? 'absent' : s === 'submitted' ? 'submitted' : day && started ? 'missing' : 'free';
  const next = [...classDays].filter((d) => d.date > today).sort((a, b) => a.date.localeCompare(b.date))[0] ?? null;
  return { isClassDay: !!day, periods: day?.periods ?? null, started, status, next };
}

/** 直近の作業レポートの「次にやること」 (今日の作業レポートを含む。空は除く)。 */
export function lastNextPlan(mine: Daily[]): { date: string; text: string } | null {
  const d = [...mine].filter((x) => (x.next ?? '').trim() !== '').sort((a, b) => b.date.localeCompare(a.date))[0];
  return d ? { date: d.date, text: (d.next ?? '').trim() } : null;
}

export const periodsLabel = (p: ClassDay['periods']) => (p === '1-2' ? '1・2限' : '3・4限');
