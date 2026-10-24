// 作業ログの入力画面の下ごしらえ (画面に依存しない)。
// 「今日やったこと」は、タスクごとのカード。結果 (進んだ/完了した/詰まった) を押すと、そのカードが作業ログに入る。
import type { Task } from '../types';
import type { Daily, DailyEntry, DailyKind, DailyResult } from './daily';
import { addDays } from './dates';
import { isLeaf } from './meetingView';

export type DraftItem = {
  /** タスクなら taskId、それ以外は kind:study など */
  id: string;
  kind: DailyKind;
  taskId?: string;
  /** null: 今日は、やっていない (作業ログに入れない)。タスク以外 (調査・勉強など) は、常に入る */
  result: DailyResult | null;
  note: string;
  /** WBSにない作業。提出のときにタスクとして作る (それまでは taskId なし) */
  adhoc?: { title: string; parentId: string | null; /** やった日 (YYYY-MM-DD)。空なら今日 */ date?: string };
};

export const ADHOC_PREFIX = 'adhoc:';
export const isAdhocItem = (i: DraftItem) => !!i.adhoc;

export const kindItemId = (kind: DailyKind) => `kind:${kind}`;

/** 作業ログの候補にするタスク: 自分が担当の、子のないタスク。完了・保留は除く。急ぎのものから (期限超過 → 進行中 → 予定の期間内 → ほか)。 */
export function candidateTasks(tasks: Task[], sid: string, today: string): Task[] {
  const live = tasks.filter((t) => !t.deleted);
  const rank = (t: Task) => (t.endDate && t.endDate < today ? 0 : t.status === 'doing' ? 1 : t.startDate && t.startDate <= today ? 2 : 3);
  return live
    .filter((t) => isLeaf(live, t) && (t.assignees ?? []).includes(sid) && t.status !== 'done' && t.status !== 'hold')
    .sort((a, b) => rank(a) - rank(b) || (a.endDate ?? '9999').localeCompare(b.endDate ?? '9999') || a.order - b.order);
}

/**
 * 入力画面の最初の状態。
 * - すでに今日の作業ログがあれば、その内容 (編集)
 * - なければ、前回の作業ログのあと (since 以降) に自分が更新したタスクを、「進んだ」(完了していれば「完了した」) で先に入れておく
 * どちらの場合も、候補のタスクは、結果が未選択のカードとして並べる。
 */
export function initialItems(prev: Daily | undefined, tasks: Task[], sid: string, today: string, since?: number): DraftItem[] {
  const from = since ?? Date.parse(`${today}T00:00:00+09:00`);
  const live = tasks.filter((t) => !t.deleted);
  const byId = new Map(live.map((t) => [t.id, t]));
  const items: DraftItem[] = [];
  const has = (id: string) => items.some((i) => i.id === id);

  if (prev) {
    for (const e of prev.entries) {
      if (e.kind === 'task' && e.taskId) items.push({ id: e.taskId, kind: 'task', taskId: e.taskId, result: e.result ?? 'progress', note: e.note });
      else if (e.kind !== 'task') items.push({ id: kindItemId(e.kind), kind: e.kind, result: null, note: e.note });
    }
  } else {
    for (const t of live) {
      if (isLeaf(live, t) && t.updatedBy === sid && Number.isFinite(t.updatedAt) && t.updatedAt > from) {
        items.push({ id: t.id, kind: 'task', taskId: t.id, result: t.status === 'done' ? 'done' : 'progress', note: '' });
      }
    }
  }
  for (const t of candidateTasks(tasks, sid, today)) {
    if (!has(t.id)) items.push({ id: t.id, kind: 'task', taskId: t.id, result: null, note: '' });
  }
  // 作業ログに入っているタスクが、削除されている場合も、そのまま残す (内容を失わない)
  return items.filter((i) => i.kind !== 'task' || byId.has(i.taskId ?? '') || i.result !== null);
}

/** 作業ログに入れる項目 (タスクは結果を選んだもの。調査・勉強などは、追加したもの)。 */
export function itemsToEntries(items: DraftItem[]): DailyEntry[] {
  return items
    .filter((i) => i.kind !== 'task' || i.result !== null)
    .map((i) => ({
      // WBSにない作業は、提出のときにタスクができるまで、仮の id (adhoc:…) を入れておく
      kind: i.kind, ...(i.taskId ? { taskId: i.taskId } : i.adhoc ? { taskId: i.id } : {}), note: i.note.trim(), ...(i.kind === 'task' && i.result ? { result: i.result } : {}),
    }));
}

/** 「次にやること」の候補: 今日完了にしなかった、自分のタスク (急ぎのもの) 上位 n 件。 */
export function nextCandidates(tasks: Task[], sid: string, today: string, items: DraftItem[], n = 3): Task[] {
  const done = new Set(items.filter((i) => i.result === 'done').map((i) => i.id));
  return candidateTasks(tasks, sid, today).filter((t) => !done.has(t.id)).slice(0, n);
}

/** 作業ログの提出に合わせて、タスクの状態を更新する (完了した → 完了、進んだ → 未着手なら進行中)。 */
export function statusChanges(items: DraftItem[], tasks: Task[]): { taskId: string; status: Task['status'] }[] {
  const out: { taskId: string; status: Task['status'] }[] = [];
  for (const i of items) {
    const t = tasks.find((x) => x.id === i.taskId);
    if (!t || t.deleted) continue;
    if (i.result === 'done' && t.status !== 'done') out.push({ taskId: t.id, status: 'done' });
    else if ((i.result === 'progress' || i.result === 'stuck') && t.status === 'todo') out.push({ taskId: t.id, status: 'doing' });
  }
  return out;
}

/**
 * 作業ログがカバーする期間の始まり (ミリ秒)。前回の作業ログを出した時刻。
 * 作業ログは授業のときにだけ書き、作業は授業時間外にもするので、作業ログには、前回の作業ログのあとの作業をまとめて書く。
 * 前回の作業ログがなければ、7日前の0時 (日本時間) から。
 */
export const SUBMIT_GRACE_MS = 60_000;

export function sinceOf(dailies: Daily[], sid: string, today: string): { since: number; prevDate: string | null } {
  const prev = dailies
    .filter((d) => d.sid === sid && d.date < today && !d.absent && d.entries.some((e) => e.note.trim() !== ''))
    .sort((a, b) => b.date.localeCompare(a.date))[0];
  if (prev) {
    const at = Math.max(Number.isFinite(prev.submittedAt) ? (prev.submittedAt as number) : 0, Number.isFinite(prev.updatedAt) ? (prev.updatedAt as number) : 0);
    // 提出のあとに、タスクの状態が更新される (完了した→完了など)。その更新を、次の作業ログで「新しい作業」と数えないよう、少し余裕を見る
    return { since: at > 0 ? at + SUBMIT_GRACE_MS : Date.parse(`${prev.date}T23:59:59+09:00`), prevDate: prev.date };
  }
  return { since: Date.parse(`${addDays(today, -7)}T00:00:00+09:00`), prevDate: null };
}
