// タスクの「集計メモ」: 教員のダッシュボードが必要とする数だけを、チームごとに小さな1件にまとめたもの。
// ダッシュボードは、全チームのタスク全件 (約500回の読み取り) の代わりに、このメモ (チームごとに1回) だけを読む。
// タスクを変えるたびに、同じ書き込みの中で更新する (data/tasks.ts)。2人が同時に書いてずれたときは、
// 教員がチーム詳細を開いたとき・ダッシュボードの「最新にする」で、タスクから作り直して直す。
import type { Task } from '../types';
import { isLeaf } from './meetingView';
import { overallProgress } from './wbs';

export type Digest = {
  /** WBSの進捗 (完了した、いちばん下のタスク / 全体。保留は除く) */
  done: number;
  total: number;
  /**
   * 完了・保留でない、期限 (終了日) のあるタスク。'2026-11-05' + L(いちばん下)/P(親) + U(担当なし)/A(担当あり)。
   * 期限超過は、今日の日付と照らして、見るときに数える (日が変わっても、メモの更新は要らない)
   */
  due: string[];
  /** 削除されていないタスクの数 */
  n: number;
  at: number;
};

export function buildDigest(tasks: Task[], at = Date.now()): Digest {
  const live = tasks.filter((t) => !t.deleted);
  const p = overallProgress(tasks);
  return {
    done: p.done, total: p.total,
    due: live
      .filter((t) => t.status !== 'done' && t.status !== 'hold' && t.endDate)
      .map((t) => `${t.endDate}${isLeaf(live, t) ? 'L' : 'P'}${(t.assignees ?? []).length === 0 ? 'U' : 'A'}`)
      .sort(),
    n: live.length, at,
  };
}

/** 期限超過の件数。overdue: 終了日が今日より前のタスク全部 / unassigned: そのうち、いちばん下で、担当のいないもの */
export function digestOverdue(d: Digest, today: string): { overdue: number; unassigned: number } {
  let overdue = 0, unassigned = 0;
  for (const s of d.due) {
    if (s.slice(0, 10) >= today) continue;
    overdue++;
    if (s.endsWith('LU')) unassigned++;
  }
  return { overdue, unassigned };
}

/** 中身が同じか (更新時刻 at は比べない) */
export const sameDigest = (a: Digest, b: Digest): boolean =>
  a.done === b.done && a.total === b.total && a.n === b.n && a.due.length === b.due.length && a.due.every((s, i) => s === b.due[i]);

/** 書き込む前の、タスクの変更を、手元の一覧に当てはめる (集計メモを作るため) */
export function applyChanges(tasks: Task[], changes: Map<string, Partial<Task>>): Task[] {
  return tasks.map((t) => (changes.has(t.id) ? { ...t, ...changes.get(t.id) } : t));
}
