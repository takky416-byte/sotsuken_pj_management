import type { Task } from '../types';
import type { Daily } from './daily';
import { statusOf } from './daily';

/** 葉のタスク (生きている子を持たないタスク) */
export const isLeaf = (tasks: Task[], t: Task) => !tasks.some((c) => !c.deleted && c.parentId === t.id);

/** 期限を過ぎていて、完了も保留もしていないタスク。 */
export function delayedTasks(tasks: Task[], today: string): Task[] {
  return tasks.filter((t) => !t.deleted && isLeaf(tasks, t) && t.status !== 'done' && t.status !== 'hold'
    && t.endDate !== null && t.endDate < today)
    .sort((a, b) => (a.endDate ?? '').localeCompare(b.endDate ?? ''));
}

/** 担当者がいないタスク (完了・保留を除く)。 */
export function unassignedTasks(tasks: Task[]): Task[] {
  return tasks.filter((t) => !t.deleted && isLeaf(tasks, t) && t.status !== 'done' && t.status !== 'hold' && t.assignees.length === 0);
}

/**
 * 進行中、または予定の期間に入っているのに、期間内の日報で一度も触れられていないタスク。
 * 「止まっていないか」を一緒に見るための目安。
 */
export function untouchedTasks(tasks: Task[], dailies: Daily[], today: string): Task[] {
  const touched = new Set(dailies.flatMap((d) => d.entries.map((e) => e.taskId).filter((x): x is string => !!x)));
  return tasks.filter((t) => !t.deleted && isLeaf(tasks, t) && t.status !== 'done' && t.status !== 'hold'
    && (t.status === 'doing' || (t.startDate !== null && t.startDate <= today && (t.endDate === null || t.endDate >= today)))
    && !touched.has(t.id));
}

export type Concern = { date: string; sid: string; text: string };

/** 日報の「困っていること」。新しい順。 */
export function concerns(dailies: Daily[]): Concern[] {
  return dailies.filter((d) => statusOf(d) !== 'absent' && d.blocker.trim() !== '')
    .map((d) => ({ date: d.date, sid: d.sid, text: d.blocker.trim() }))
    .sort((a, b) => b.date.localeCompare(a.date) || a.sid.localeCompare(b.sid, 'en', { numeric: true }));
}

/** メンバーごとに、期間内に日報で触れたタスク名 (重複なし)。 */
export function touchedByMember(tasks: Task[], dailies: Daily[]): Map<string, string[]> {
  const title = new Map(tasks.map((t) => [t.id, t.title]));
  const out = new Map<string, string[]>();
  for (const d of dailies) {
    for (const e of d.entries) {
      if (!e.taskId) continue;
      const name = title.get(e.taskId);
      if (!name) continue;
      const list = out.get(d.sid) ?? [];
      if (!list.includes(name)) out.set(d.sid, [...list, name]);
    }
  }
  return out;
}
