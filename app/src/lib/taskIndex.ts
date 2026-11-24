// タスクの一覧から、親子の引き当て表を作る (同じ一覧には、1回だけ作って使い回す)。
// 「子がいるか」「子の一覧」「id から探す」を、毎回全件を探さずに済ませる (項目が多いと、描画のたびの計算が重くなるため)。
// 一覧 (配列) に push で足したときは、件数が変わるので作り直す。要素を差し替える書き換えはしないこと (しているところはない)。
import type { Task } from '../types';

type Index = {
  /** 作ったときの件数 (あとから push されたら、作り直す) */
  n: number;
  byId: Map<string, Task>;
  /** 削除されていない子 (並び順)。キーは親の id (大項目は null) */
  liveKids: Map<string | null, Task[]>;
  /** 削除済みも含めた子 */
  allKids: Map<string | null, Task[]>;
};

const cache = new WeakMap<Task[], Index>();

export function taskIndex(tasks: Task[]): Index {
  const hit = cache.get(tasks);
  if (hit && hit.n === tasks.length) return hit;
  const byId = new Map<string, Task>();
  const liveKids = new Map<string | null, Task[]>();
  const allKids = new Map<string | null, Task[]>();
  for (const t of tasks) {
    byId.set(t.id, t);
    const p = t.parentId ?? null;
    (allKids.get(p) ?? allKids.set(p, []).get(p)!).push(t);
    if (!t.deleted) (liveKids.get(p) ?? liveKids.set(p, []).get(p)!).push(t);
  }
  for (const list of liveKids.values()) list.sort((a, b) => a.order - b.order);
  const idx = { n: tasks.length, byId, liveKids, allKids };
  cache.set(tasks, idx);
  return idx;
}
