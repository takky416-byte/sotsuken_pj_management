import type { Task } from '../types';
import type { OutlineNode } from './outline';
import { childrenOf } from './wbs';

export type NewTask = {
  id: string;
  parentId: string | null;
  depth: 1 | 2 | 3;
  title: string;
  detail: string;
  order: number;
  /** 1行入力 (@名前 〜10/30) から決まった担当・期限 */
  assignees?: string[];
  startDate?: string | null;
  endDate?: string | null;
  /** 省略すると未着手 */
  status?: Task['status'];
};

/**
 * アウトラインを既存の WBS にマージする計画を立てる。
 * 同じ親の下に同名の項目 (既存・今回追加分) があれば、それを使い回して重複を作らない。
 * これにより、キックオフや取り込みを何度実行しても項目が増えない。
 * baseDepth / rootParentId: 取り込み先の階層と親 (大項目の下に貼り付けるときなど)。
 * dedupe=false なら同名でも別の項目として作る (学生が貼り付けるとき)。
 */
export function planImport(
  existing: Task[],
  nodes: OutlineNode[],
  newId: () => string,
  baseDepth: 1 | 2 | 3 = 1,
  rootParentId: string | null = null,
  dedupe = true,
): { created: NewTask[]; reused: number } {
  const known: Task[] = existing.filter((t) => !t.deleted);
  const created: NewTask[] = [];
  let reused = 0;
  // stack[d] = 階層 d の直近の項目 (既存 or 新規) の id
  const stack: (string | null)[] = [];
  const asTask = (n: NewTask): Task => ({
    ...n, status: 'todo', assignees: [], startDate: null, endDate: null, links: [], source: 'draft',
    createdBy: '', updatedBy: '', createdAt: 0, updatedAt: 0, deleted: false, deletedAt: null,
  });

  for (const node of nodes) {
    const depth = Math.min(Math.max(node.depth, baseDepth), 3) as 1 | 2 | 3;
    const parentId = depth === baseDepth ? rootParentId : (stack[depth - 1] ?? rootParentId);
    const same = dedupe ? childrenOf(known, parentId).find((t) => t.title === node.title) : undefined;
    if (same) {
      reused++;
      stack[depth] = same.id;
    } else {
      const sibs = childrenOf(known, parentId);
      const n: NewTask = {
        id: newId(), parentId, depth, title: node.title, detail: node.detail,
        order: (sibs.at(-1)?.order ?? 0) + 1024,
      };
      created.push(n);
      known.push(asTask(n));
      stack[depth] = n.id;
    }
    stack.length = depth + 1;
  }
  return { created, reused };
}
