// 手待ちのメンバーを見つけ、ほかのメンバーのタスクや、担当がいないタスクを振り分ける案を出す。
// 案は提案にすぎない。ミーティングで話し合って、担当を決める。
import type { Task } from '../types';
import { addDays } from './dates';
import { isLeaf, isPlaceholder } from './meetingView';

export type IdleSuggestion = {
  task: Task;
  /** 今の担当 (いなければ空) */
  owners: string[];
  reason: string;
};
export type IdleMember = { sid: string; name: string; suggestions: IdleSuggestion[] };

const open = (t: Task) => t.status !== 'done' && t.status !== 'hold';

/** いま取り組める (進行中、または開始日が近い・日付なし) の未完了タスク */
const workable = (t: Task, today: string) => open(t) && (t.status === 'doing' || !t.startDate || t.startDate <= addDays(today, 2));

/** 手待ち: いま取り組めるタスクがない人。 */
export function idleMembers(
  tasks: Task[], members: { sid: string; name: string }[], today: string, perPerson = 3,
): IdleMember[] {
  const live = tasks.filter((t) => !t.deleted);
  const leaves = live.filter((t) => isLeaf(live, t) && !isPlaceholder(live, t) && t.id !== 'adhoc-root');
  const load = new Map(members.map((m) => [m.sid, leaves.filter((t) => (t.assignees ?? []).includes(m.sid) && workable(t, today)).length]));
  const idle = members.filter((m) => (load.get(m.sid) ?? 0) === 0);
  if (idle.length === 0) return [];

  // 振り分け候補: 担当がいない未完了タスク → 抱えすぎの人 (取り組めるタスクが3件以上) の、まだ手を付けていないタスク
  const heavy = new Set(members.filter((m) => (load.get(m.sid) ?? 0) >= 3).map((m) => m.sid));
  const nameOf = (sid: string) => members.find((m) => m.sid === sid)?.name ?? sid;
  const rank = (t: Task) => (t.endDate && t.endDate < today ? 0 : 1);
  const cands: IdleSuggestion[] = leaves
    .filter((t) => open(t) && (t.assignees ?? []).length === 0)
    .map((t) => ({ task: t, owners: [], reason: '担当がいません' }));
  for (const t of leaves) {
    const owners = (t.assignees ?? []).filter((s) => heavy.has(s));
    if (open(t) && t.status === 'todo' && owners.length > 0 && owners.length === (t.assignees ?? []).length) {
      cands.push({ task: t, owners, reason: `${owners.map(nameOf).join('・')}さんが${load.get(owners[0])}件抱えています` });
    }
  }
  cands.sort((a, b) => rank(a.task) - rank(b.task) || (a.task.endDate ?? '9999').localeCompare(b.task.endDate ?? '9999') || a.task.order - b.task.order);

  const out: IdleMember[] = idle.map((m) => ({ sid: m.sid, name: m.name, suggestions: [] }));
  const used = new Set<string>();
  // 1つのタスクは1人にだけ案を出す。手待ちの人に順番に配る
  for (let round = 0; round < perPerson; round++) {
    for (const p of out) {
      const c = cands.find((x) => !used.has(x.task.id));
      if (!c) break;
      used.add(c.task.id);
      p.suggestions.push(c);
    }
  }
  return out;
}
