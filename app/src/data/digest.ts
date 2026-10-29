import { collection, doc, getDocs, query, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { buildDigest, sameDigest, type Digest } from '../lib/digest';
import type { Task } from '../types';
import { useQuery } from './util';

const col = (teamId: string) => collection(db, 'teams', teamId, 'digest');
/** 集計メモの置き場所 (チームごとに1件)。firestore.rules の digest と対応している */
export const digestRef = (teamId: string) => doc(db, 'teams', teamId, 'digest', 'tasks');

/** チームの集計メモ。null: 読み込み中 / 空の配列: まだない (最初の1回は、タスクから作る) */
export function useDigest(teamId: string | null) {
  return useQuery<Digest & { id: string }>(teamId ? query(col(teamId)) : null, `digest:${teamId}`);
}

/** タスクから作り直して書く (教員が、チーム詳細・ダッシュボードで、ずれを直すとき) */
export const saveDigest = (teamId: string, tasks: Task[]) => setDoc(digestRef(teamId), buildDigest(tasks));

/** メモがなかった・ずれていたときだけ書く。書いたら true */
export async function healDigest(teamId: string, tasks: Task[], current: Digest | null): Promise<boolean> {
  const next = buildDigest(tasks);
  if (current && sameDigest(current, next)) return false;
  await setDoc(digestRef(teamId), next);
  return true;
}

/** ダッシュボードの「最新にする」: 全チームのタスクを読み直して、メモを作り直す */
export async function rebuildAllDigests(teamIds: string[]): Promise<void> {
  for (const id of teamIds) {
    const snap = await getDocs(collection(db, 'teams', id, 'tasks'));
    await saveDigest(id, snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Task));
  }
}
