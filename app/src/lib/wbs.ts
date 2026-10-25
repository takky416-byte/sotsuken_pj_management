import type { Task, TaskStatus } from '../types';

export type Patch = { id: string; changes: Partial<Pick<Task, 'parentId' | 'depth' | 'order'>> };

const ORDER_STEP = 1024;

export const isLive = (t: Task) => !t.deleted;

export function childrenOf(tasks: Task[], parentId: string | null): Task[] {
  return tasks.filter((t) => isLive(t) && t.parentId === parentId).sort((a, b) => a.order - b.order);
}

export type Row = { task: Task; depth: number; hasChildren: boolean };

/** 表示順 (親→子) に並べた行。collapsed に含まれる親の子孫は出さない。 */
export function flatten(tasks: Task[], collapsed: ReadonlySet<string> = new Set()): Row[] {
  const rows: Row[] = [];
  const walk = (parentId: string | null) => {
    for (const task of childrenOf(tasks, parentId)) {
      const kids = childrenOf(tasks, task.id);
      rows.push({ task, depth: task.depth, hasChildren: kids.length > 0 });
      if (kids.length && !collapsed.has(task.id)) walk(task.id);
    }
  };
  walk(null);
  return rows;
}

/** 指定した人が担当のタスクと、その上の階層 (親・祖父母) の id。「自分の担当だけ」の表示に使う。 */
export function ownedWithAncestors(tasks: Task[], sid: string): Set<string> {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const out = new Set<string>();
  for (const t of tasks) {
    if (t.deleted || !t.assignees.includes(sid)) continue;
    for (let cur: Task | undefined = t; cur && !out.has(cur.id); cur = cur.parentId ? byId.get(cur.parentId) : undefined) out.add(cur.id);
  }
  return out;
}

export function descendantsOf(tasks: Task[], id: string): Task[] {
  const out: Task[] = [];
  const walk = (pid: string) => {
    for (const c of tasks.filter((t) => t.parentId === pid)) { out.push(c); walk(c.id); }
  };
  walk(id);
  return out;
}

/** 葉タスクの完了数。保留は分母から除く。 */
export function progressOf(tasks: Task[], id: string): { done: number; total: number } {
  const self = tasks.find((t) => t.id === id);
  if (!self) return { done: 0, total: 0 };
  const kids = childrenOf(tasks, id);
  if (kids.length === 0) {
    if (self.status === 'hold') return { done: 0, total: 0 };
    return { done: self.status === 'done' ? 1 : 0, total: 1 };
  }
  return kids.reduce(
    (acc, k) => {
      const p = progressOf(tasks, k.id);
      return { done: acc.done + p.done, total: acc.total + p.total };
    },
    { done: 0, total: 0 },
  );
}

export function overallProgress(tasks: Task[]): { done: number; total: number } {
  return childrenOf(tasks, null).reduce(
    (acc, r) => {
      const p = progressOf(tasks, r.id);
      return { done: acc.done + p.done, total: acc.total + p.total };
    },
    { done: 0, total: 0 },
  );
}

export function orderBetween(prev: number | undefined, next: number | undefined): number {
  if (prev === undefined && next === undefined) return ORDER_STEP;
  if (prev === undefined) return (next as number) - ORDER_STEP;
  if (next === undefined) return prev + ORDER_STEP;
  return (prev + next) / 2;
}

/** 兄弟の末尾に追加するときの order */
export function appendOrder(tasks: Task[], parentId: string | null): number {
  const sibs = childrenOf(tasks, parentId);
  return orderBetween(sibs.at(-1)?.order, undefined);
}

/** afterId の直後 (同じ親) に入れるときの order */
export function orderAfter(tasks: Task[], afterId: string): number {
  const after = tasks.find((t) => t.id === afterId);
  if (!after) return appendOrder(tasks, null);
  const sibs = childrenOf(tasks, after.parentId);
  const i = sibs.findIndex((t) => t.id === afterId);
  return orderBetween(after.order, sibs[i + 1]?.order);
}

const maxDepthBelow = (tasks: Task[], id: string): number =>
  Math.max(0, ...descendantsOf(tasks, id).map((d) => d.depth - (tasks.find((t) => t.id === id)?.depth ?? 0)));

/** 直前の兄弟の子にする (Tab)。できないときは null。 */
export function planIndent(tasks: Task[], id: string): Patch[] | null {
  const t = tasks.find((x) => x.id === id);
  if (!t) return null;
  const sibs = childrenOf(tasks, t.parentId);
  const i = sibs.findIndex((s) => s.id === id);
  if (i <= 0) return null;
  if (t.depth + 1 + maxDepthBelow(tasks, id) > 3) return null;
  const newParent = sibs[i - 1];
  const patches: Patch[] = [{
    id,
    changes: { parentId: newParent.id, depth: (t.depth + 1) as 2 | 3, order: appendOrder(tasks, newParent.id) },
  }];
  for (const d of descendantsOf(tasks, id)) patches.push({ id: d.id, changes: { depth: (d.depth + 1) as 2 | 3 } });
  return patches;
}

/** 親の兄弟にする (Shift+Tab)。できないときは null。 */
export function planOutdent(tasks: Task[], id: string): Patch[] | null {
  const t = tasks.find((x) => x.id === id);
  const parent = t?.parentId ? tasks.find((x) => x.id === t.parentId) : undefined;
  if (!t || !parent) return null;
  const patches: Patch[] = [{
    id,
    changes: { parentId: parent.parentId, depth: (t.depth - 1) as 1 | 2, order: orderAfter(tasks, parent.id) },
  }];
  for (const d of descendantsOf(tasks, id)) patches.push({ id: d.id, changes: { depth: (d.depth - 1) as 1 | 2 } });
  return patches;
}

/** 同じ親の中で1つ上/下へ。できないときは null。 */
export function planMove(tasks: Task[], id: string, dir: -1 | 1): Patch[] | null {
  const t = tasks.find((x) => x.id === id);
  if (!t) return null;
  const sibs = childrenOf(tasks, t.parentId);
  const i = sibs.findIndex((s) => s.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= sibs.length) return null;
  const a = sibs[Math.min(i, j)];
  const b = sibs[Math.max(i, j)];
  // 隣り合う2件の order を入れ替える
  return [{ id: a.id, changes: { order: b.order } }, { id: b.id, changes: { order: a.order } }];
}

/**
 * 迷子のタスク: 生きているのに、親が削除されている (または存在しない) タスク。
 * 誰かが親を削除している間に、別の人がその下にタスクを追加すると起こる。
 * 親から辿れないので、そのままでは画面に出ない。子孫は、迷子のタスクにぶら下がったまま。
 */
export function orphansOf(tasks: Task[]): Task[] {
  const live = new Map(tasks.filter(isLive).map((t) => [t.id, t]));
  return tasks.filter((t) => isLive(t) && t.parentId !== null && !live.has(t.parentId))
    .sort((a, b) => a.order - b.order);
}

/** 迷子のタスクを、最上位に移す。子孫の階層も、同じだけ上げる。 */
export function planRescue(tasks: Task[], id: string): Patch[] | null {
  const t = tasks.find((x) => x.id === id);
  if (!t || t.deleted) return null;
  const delta = 1 - t.depth; // 0 以下
  const patches: Patch[] = [{ id, changes: { parentId: null, depth: 1, order: appendOrder(tasks, null) } }];
  for (const d of descendantsOf(tasks, id).filter(isLive)) {
    patches.push({ id: d.id, changes: { depth: Math.min(3, Math.max(1, d.depth + delta)) as 1 | 2 | 3 } });
  }
  return patches;
}

/**
 * 子タスクの状態から、親タスクの状態を決める (保留の子は、判定から除く)。
 * すべて保留なら保留、残りがすべて完了なら完了、すべて未着手なら未着手、それ以外は進行中。
 */
export function rollupStatus(children: TaskStatus[]): TaskStatus {
  const active = children.filter((s) => s !== 'hold');
  if (active.length === 0) return 'hold';
  if (active.every((s) => s === 'done')) return 'done';
  if (active.every((s) => s === 'todo')) return 'todo';
  return 'doing';
}

/**
 * 画面や集計で使う、タスクの状態。子タスクがある (親の) タスクは、自分の状態ではなく、子から自動で決まる。
 * 子がない (葉の) タスクは、自分の状態のまま。
 */
export function effectiveStatuses(tasks: Task[]): Map<string, TaskStatus> {
  const out = new Map<string, TaskStatus>();
  const visit = (t: Task): TaskStatus => {
    const known = out.get(t.id);
    if (known) return known;
    const kids = tasks.filter((c) => isLive(c) && c.parentId === t.id);
    const s = kids.length === 0 ? t.status : rollupStatus(kids.map(visit));
    out.set(t.id, s);
    return s;
  };
  for (const t of tasks) if (isLive(t)) visit(t);
  return out;
}

/** 状態が変わって、親 (祖先) が「完了」になったタスク。お祝いに使う。 */
export function newlyCompletedParents(tasks: Task[], id: string, status: TaskStatus): Task[] {
  const before = effectiveStatuses(tasks);
  const after = effectiveStatuses(tasks.map((t) => (t.id === id ? { ...t, status } : t)));
  return tasks.filter((t) => isLive(t) && t.id !== id && before.get(t.id) !== 'done' && after.get(t.id) === 'done'
    && tasks.some((c) => isLive(c) && c.parentId === t.id));
}

/** タスクの期間。自分に日付がなければ、子孫の日付の最小・最大から求める (derived)。 */
export function periodOf(tasks: Task[], t: Task): { start: string | null; end: string | null; derived: boolean } {
  if (t.startDate || t.endDate) return { start: t.startDate, end: t.endDate, derived: false };
  const ds = descendantsOf(tasks.filter((x) => !x.deleted), t.id);
  const starts = ds.map((d) => d.startDate ?? d.endDate).filter((d): d is string => !!d).sort();
  const ends = ds.map((d) => d.endDate ?? d.startDate).filter((d): d is string => !!d).sort();
  return { start: starts[0] ?? null, end: ends.at(-1) ?? null, derived: starts.length > 0 };
}

/** '2026-10-05' → '10/5' */
export const shortDate = (date: string): string => `${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))}`;

/** 期間の表示: 10/1〜10/5、1日なら 10/5、片方だけなら 〜10/5 / 10/1〜 */
export function periodLabel(start: string | null, end: string | null): string {
  if (start && end) return start === end ? shortDate(start) : `${shortDate(start)}〜${shortDate(end)}`;
  if (end) return `〜${shortDate(end)}`;
  if (start) return `${shortDate(start)}〜`;
  return '';
}
