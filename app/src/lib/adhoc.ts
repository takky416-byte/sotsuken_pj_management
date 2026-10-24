// 「WBSにない作業」を、作業ログの提出と同時に WBS のタスクにする。
// 学生が WBS にないことをやっても、誰が何をやったかが記録に残り、ガントチャートや進捗にも反映される。
import type { Task, TaskStatus } from '../types';
import type { DailyResult } from './daily';
import type { NewTask } from './importPlan';
import { appendOrder } from './wbs';

/** 親を選ばなかった「WBS外」の作業を入れる、大項目の id (チームに1つ) */
export const ADHOC_ROOT_ID = 'adhoc-root';
export const ADHOC_ROOT_TITLE = 'WBS外の作業(あとから追加)';
export const MIN_ADHOC_TITLE = 2;

export type AdhocInput = { key: string; title: string; result: DailyResult; parentId: string | null; /** やった日 (前回の作業ログのあと〜今日)。省略すると今日 */ date?: string };

export type AdhocPlan = {
  /** 「WBS外の作業」の大項目を新しく作る必要があるとき */
  root: NewTask | null;
  /** 削除されている「WBS外の作業」を戻す必要があるとき */
  restoreRoot: boolean;
  /** key → 作るタスク */
  tasks: { key: string; task: NewTask }[];
};

/** 結果から決まるタスクの状態 (完了した → 完了、それ以外 → 進行中)。 */
export const adhocStatus = (r: DailyResult): TaskStatus => (r === 'done' ? 'done' : 'doing');

/** 親にできるタスク (大項目・中項目)。3階層までなので、小項目の下には作れない。 */
export const adhocParents = (tasks: Task[]): Task[] => tasks.filter((t) => !t.deleted && t.depth <= 2 && t.id !== ADHOC_ROOT_ID);

/** 親が決まっていない作業は、「WBS外の作業」の下に作る。 */
export function planAdhoc(
  tasks: Task[], sid: string, today: string, inputs: AdhocInput[], newId: () => string,
): AdhocPlan {
  const live = tasks.filter((t) => !t.deleted);
  const rootDoc = tasks.find((t) => t.id === ADHOC_ROOT_ID);
  const needRoot = inputs.some((i) => !i.parentId || !live.some((t) => t.id === i.parentId && t.depth <= 2));
  const root: NewTask | null = needRoot && !rootDoc
    ? { id: ADHOC_ROOT_ID, parentId: null, depth: 1, title: ADHOC_ROOT_TITLE, detail: '作業ログで「WBSにない作業をした」と書かれた作業が、ここに入ります。担当やチームで整理して、WBSの正しい場所に移してください。', order: appendOrder(live, null) }
    : null;
  const restoreRoot = needRoot && !!rootDoc?.deleted;
  const pool: Task[] = [...live];
  const out: AdhocPlan['tasks'] = [];
  for (const i of inputs) {
    const parent = live.find((t) => t.id === i.parentId && t.depth <= 2);
    const parentId = parent ? parent.id : ADHOC_ROOT_ID;
    const depth = (parent ? parent.depth + 1 : 2) as 2 | 3;
    const order = appendOrder(pool, parentId);
    const task: NewTask = {
      id: newId(), parentId, depth, title: i.title.trim(), detail: '', order, assignees: [sid],
      startDate: i.date && i.date <= today ? i.date : today, endDate: i.result === 'done' ? (i.date && i.date <= today ? i.date : today) : null, status: adhocStatus(i.result),
    };
    out.push({ key: i.key, task });
    // 同じ親に続けて作るとき、順番が重ならないように
    pool.push({ ...(task as unknown as Task), createdBy: sid, deleted: false });
  }
  return { root, restoreRoot, tasks: out };
}
