import type { Task } from '../types';
import type { NewTask } from './importPlan';

/** 新規タスクとして Firestore に書き込む形。firestore.rules の validTask と対応している。 */
export function taskDoc(n: NewTask, actor: string, source: Task['source'], now = Date.now()): Omit<Task, 'id'> {
  return {
    title: n.title, detail: n.detail, parentId: n.parentId, depth: n.depth, order: n.order,
    status: 'todo', assignees: n.assignees ?? [], startDate: n.startDate ?? null, endDate: n.endDate ?? null, links: [], source,
    createdBy: actor, updatedBy: actor, createdAt: now, updatedAt: now, deleted: false, deletedAt: null,
  };
}
