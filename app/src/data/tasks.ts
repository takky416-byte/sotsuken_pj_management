import { arrayRemove, arrayUnion, collection, doc, query, writeBatch } from 'firebase/firestore';
import { db } from '../firebase';
import type { Task, TaskLink } from '../types';
import type { Patch } from '../lib/wbs';
import type { NewTask } from '../lib/importPlan';
import { taskDoc } from '../lib/taskDoc';
import { useQuery } from './util';

const col = (teamId: string) => collection(db, 'teams', teamId, 'tasks');

export function useTasks(teamId: string | null) {
  return useQuery<Task>(teamId ? query(col(teamId)) : null, [teamId]);
}

/** 書き込みの updatedBy。教員は 'teacher'、学生は sid (ルールで検証される)。 */
export type Actor = string;

export const newTaskId = (teamId: string) => doc(col(teamId)).id;

const CHUNK = 400;

async function commitAll(ops: ((b: ReturnType<typeof writeBatch>) => void)[]) {
  for (let i = 0; i < ops.length; i += CHUNK) {
    const batch = writeBatch(db);
    ops.slice(i, i + CHUNK).forEach((op) => op(batch));
    await batch.commit();
  }
}

export async function createTasks(teamId: string, actor: Actor, plan: NewTask[], source: Task['source'] = 'user') {
  await commitAll(plan.map((n) => (b) => b.set(doc(col(teamId), n.id), taskDoc(n, actor, source))));
}

export async function updateTask(teamId: string, actor: Actor, id: string, changes: Partial<Omit<Task, 'id'>>) {
  const batch = writeBatch(db);
  batch.update(doc(col(teamId), id), { ...changes, updatedBy: actor, updatedAt: Date.now() });
  await batch.commit();
}

/**
 * 担当・リンクの追加/削除。配列全体を書き換えず、「この要素を足す/外す」としてサーバーに送る。
 * 2人がほぼ同時に別の人を担当に付けても、どちらの変更も残る。
 */
export async function updateTaskArray(
  teamId: string, actor: Actor, id: string, field: 'assignees' | 'links', op: 'add' | 'remove', value: string | TaskLink,
) {
  const change = op === 'add' ? arrayUnion(value) : arrayRemove(value);
  const batch = writeBatch(db);
  batch.update(doc(col(teamId), id), { [field]: change, updatedBy: actor, updatedAt: Date.now() });
  await batch.commit();
}

export async function applyPatches(teamId: string, actor: Actor, patches: Patch[]) {
  const now = Date.now();
  await commitAll(patches.map((p) => (b) =>
    b.update(doc(col(teamId), p.id), { ...p.changes, updatedBy: actor, updatedAt: now })));
}

export async function setDeleted(teamId: string, actor: Actor, ids: string[], deleted: boolean) {
  const now = Date.now();
  await commitAll(ids.map((id) => (b) =>
    b.update(doc(col(teamId), id), { deleted, deletedAt: deleted ? now : null, updatedBy: actor, updatedAt: now })));
}
