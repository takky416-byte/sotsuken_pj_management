import type { Task } from '../types';

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
