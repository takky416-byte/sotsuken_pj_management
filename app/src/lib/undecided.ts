import { isLeaf, isPlaceholder } from './meetingView';
import { statusOf, type Daily } from './daily';
import { ADHOC_ROOT_ID } from './adhoc';
import type { Task } from '../types';

/** いま担当している、完了も保留もしていないタスク (いちばん下の階層) */
export function activeAssigned(tasks: Task[], sid: string): Task[] {
  const live = tasks.filter((t) => !t.deleted);
  return live.filter((t) => isLeaf(live, t) && !isPlaceholder(live, t) && t.id !== ADHOC_ROOT_ID && t.status !== 'done' && t.status !== 'hold' && (t.assignees ?? []).includes(sid));
}

/**
 * 前回の作業ログで「次にやること」を未定にして、いま担当のタスクもない人への、確認の促し。
 * 今日の作業ログを出したあとは出さない。前回の記録が未定でなければ出さない。
 */
export function undecidedNudge(mine: Daily[], tasks: Task[], sid: string, today: string): { date: string } | null {
  if (mine.some((d) => d.sid === sid && d.date === today && statusOf(d) === 'submitted')) return null;
  const last = mine.filter((d) => d.sid === sid && d.date < today && statusOf(d) === 'submitted').sort((a, b) => b.date.localeCompare(a.date))[0];
  if (!last || !last.nextUndecided) return null;
  return activeAssigned(tasks, sid).length === 0 ? { date: last.date } : null;
}
