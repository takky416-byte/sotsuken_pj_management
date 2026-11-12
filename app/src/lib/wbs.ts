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

/** 担当が決まっていない (完了していない) いちばん下のタスクと、その上の階層の id。「担当が決まっていない項目だけ」の表示に使う。 */
export function unassignedWithAncestors(tasks: Task[]): Set<string> {
  const live = tasks.filter((t) => !t.deleted);
  const byId = new Map(live.map((t) => [t.id, t]));
  const out = new Set<string>();
  for (const t of live) {
    if (live.some((c) => c.parentId === t.id) || t.assignees.length > 0 || t.status === 'done') continue;
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

/** 親を選び直すときの候補。自分と自分の子孫は選べない。移したあとの深さが3を超える場所も選べない (id は null=大項目にする) */
export function parentChoices(tasks: Task[], id: string): { id: string | null; label: string; current: boolean }[] {
  const t = tasks.find((x) => x.id === id);
  if (!t) return [];
  const live = tasks.filter(isLive);
  const below = new Set(descendantsOf(tasks, id).map((d) => d.id));
  const byId = new Map(live.map((x) => [x.id, x]));
  const pathOf = (x: Task): string => { const names: string[] = []; for (let p: Task | undefined = x; p; p = p.parentId ? byId.get(p.parentId) : undefined) names.unshift(p.title); return names.join(' › '); };
  const h = maxDepthBelow(tasks, id);
  const out: { id: string | null; label: string; current: boolean }[] = [{ id: null, label: '(なし・大項目にする)', current: t.parentId === null }];
  for (const r of flatten(live)) {
    const p = r.task;
    if (p.id === id || below.has(p.id) || p.depth + 1 + h > 3) continue;
    out.push({ id: p.id, label: pathOf(p), current: t.parentId === p.id });
  }
  return out;
}

/** 親を選び直す (大項目にするときは null)。子タスクも、深さを合わせて一緒に移る。移し先の最後に入る。できないとき (自分・子孫が親、3階層を超える) は null。 */
export function planReparent(tasks: Task[], id: string, newParentId: string | null): Patch[] | null {
  const t = tasks.find((x) => x.id === id && isLive(x));
  if (!t || (t.parentId ?? null) === newParentId) return null;
  const parent = newParentId === null ? null : tasks.find((x) => x.id === newParentId && isLive(x)) ?? null;
  if (newParentId !== null && !parent) return null;
  if (parent && (parent.id === id || descendantsOf(tasks, id).some((d) => d.id === parent.id))) return null;
  const depth = parent ? parent.depth + 1 : 1;
  if (depth + maxDepthBelow(tasks, id) > 3) return null;
  const delta = depth - t.depth;
  const patches: Patch[] = [{ id, changes: { parentId: newParentId, depth: depth as 1 | 2 | 3, order: appendOrder(tasks.filter((x) => x.id !== id), newParentId) } }];
  if (delta !== 0) for (const d of descendantsOf(tasks, id)) patches.push({ id: d.id, changes: { depth: (d.depth + delta) as 1 | 2 | 3 } });
  return patches;
}

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

/**
 * 子 (子孫) がいて、日付のある子がいる親の期間: 子の期間の最小の開始〜最大の終了。子の期間も、さらにその子から求める (3階層でも同じ)。
 * 親に日付が入っていても、子から求めた期間を使う (親の期間は、子に依存する)。日付のある子がいなければ null。
 */
export function childSpan(live: Task[], t: Task): { start: string; end: string } | null {
  const spans: { start: string; end: string }[] = [];
  for (const c of live) {
    if (c.parentId !== t.id || c.deleted) continue;
    const s = childSpan(live, c);
    if (s) spans.push(s);
    else if (c.startDate || c.endDate) spans.push({ start: (c.startDate ?? c.endDate) as string, end: (c.endDate ?? c.startDate) as string });
  }
  if (spans.length === 0) return null;
  return { start: spans.map((x) => x.start).sort()[0], end: spans.map((x) => x.end).sort().reverse()[0] };
}

/** タスクの期間。子に日付があれば、子の期間の最小・最大から求める (derived)。なければ、自分の日付。 */
export function periodOf(tasks: Task[], t: Task): { start: string | null; end: string | null; derived: boolean } {
  const s = childSpan(tasks.filter((x) => !x.deleted), t);
  if (s) return { ...s, derived: true };
  return { start: t.startDate, end: t.endDate, derived: false };
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
