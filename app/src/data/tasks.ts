import { arrayRemove, arrayUnion, collection, doc, query, writeBatch } from 'firebase/firestore';
import { db } from '../firebase';
import type { Task, TaskLink } from '../types';
import type { Patch } from '../lib/wbs';
import type { NewTask } from '../lib/importPlan';
import { taskDoc } from '../lib/taskDoc';
import { useQuery } from './util';
import { diffArray, diffTask, type TaskLog } from '../lib/taskLog';

const col = (teamId: string) => collection(db, 'teams', teamId, 'tasks');

const logCol = (teamId: string) => collection(db, 'teams', teamId, 'taskLogs');
/** 変更履歴に「変更前」を残すための、画面が読んでいる最新のタスク */
const latest = new Map<string, Task[]>();
const before = (teamId: string, id: string) => latest.get(teamId)?.find((t) => t.id === id);

export function useTasks(teamId: string | null) {
  const r = useQuery<Task>(teamId ? query(col(teamId)) : null, `tasks:${teamId}`);
  if (teamId && r.data) latest.set(teamId, r.data);
  return r;
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

type Batch = ReturnType<typeof writeBatch>;
const addLog = (b: Batch, teamId: string, log: TaskLog) => b.set(doc(logCol(teamId)), log);
/** 多くを一度に追加・削除するとき (取り込みなど) は、1件ずつではなく、まとめて1件の履歴にする */
const MANY = 20;

export async function createTasks(teamId: string, actor: Actor, plan: NewTask[], source: Task['source'] = 'user') {
  const now = Date.now();
  const ops: ((b: Batch) => void)[] = plan.map((n) => (b) => b.set(doc(col(teamId), n.id), taskDoc(n, actor, source)));
  if (plan.length > MANY) ops.push((b) => addLog(b, teamId, { taskId: '', title: `${plan.length}件のタスクをまとめて追加`, by: actor, at: now, kind: 'create', changes: [] }));
  else plan.forEach((n) => ops.push((b) => addLog(b, teamId, { taskId: n.id, title: n.title, by: actor, at: now, kind: 'create', changes: [], ...(source === 'adhoc' ? { via: '作業レポート(WBSにない作業)' } : {}) })));
  await commitAll(ops);
}

export async function updateTask(teamId: string, actor: Actor, id: string, changes: Partial<Omit<Task, 'id'>>, via?: string) {
  const prev = before(teamId, id);
  const diff = diffTask(prev, changes);
  const now = Date.now();
  const batch = writeBatch(db);
  batch.update(doc(col(teamId), id), { ...changes, updatedBy: actor, updatedAt: now });
  if (diff.length > 0) addLog(batch, teamId, { taskId: id, title: changes.title ?? prev?.title ?? '', by: actor, at: now, kind: 'update', changes: diff, ...(via ? { via } : {}) });
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
  const prev = before(teamId, id);
  const diff = diffArray(prev, field, op, value);
  const now = Date.now();
  const batch = writeBatch(db);
  batch.update(doc(col(teamId), id), { [field]: change, updatedBy: actor, updatedAt: now });
  if (diff.length > 0) addLog(batch, teamId, { taskId: id, title: prev?.title ?? '', by: actor, at: now, kind: 'update', changes: diff });
  await batch.commit();
}

export async function applyPatches(teamId: string, actor: Actor, patches: Patch[]) {
  const now = Date.now();
  const ops: ((b: Batch) => void)[] = patches.map((p) => (b) =>
    b.update(doc(col(teamId), p.id), { ...p.changes, updatedBy: actor, updatedAt: now }));
  // 並べ替え・階層の変更。動かしたタスクだけを、履歴に残す (多いときは、まとめて1件)
  const moved = patches.filter((p) => diffTask(before(teamId, p.id), p.changes).length > 0);
  if (moved.length > MANY) ops.push((b) => addLog(b, teamId, { taskId: '', title: `${moved.length}件のタスクの場所・並び順を変更`, by: actor, at: now, kind: 'update', changes: [{ field: 'move', from: '', to: '' }] }));
  else moved.forEach((p) => ops.push((b) => addLog(b, teamId, { taskId: p.id, title: before(teamId, p.id)?.title ?? '', by: actor, at: now, kind: 'update', changes: [{ field: 'move', from: '', to: '' }] })));
  await commitAll(ops);
}

export async function setDeleted(teamId: string, actor: Actor, ids: string[], deleted: boolean) {
  const now = Date.now();
  const ops: ((b: Batch) => void)[] = ids.map((id) => (b) =>
    b.update(doc(col(teamId), id), { deleted, deletedAt: deleted ? now : null, updatedBy: actor, updatedAt: now }));
  const kind = deleted ? 'delete' : 'restore';
  if (ids.length > MANY) ops.push((b) => addLog(b, teamId, { taskId: '', title: `${ids.length}件のタスクを${deleted ? '削除' : '元に戻した'}`, by: actor, at: now, kind, changes: [] }));
  else ids.forEach((id) => ops.push((b) => addLog(b, teamId, { taskId: id, title: before(teamId, id)?.title ?? '', by: actor, at: now, kind, changes: [] })));
  await commitAll(ops);
}
