import { doc, writeBatch } from 'firebase/firestore';
import { db } from '../firebase';
import type { Write } from '../lib/restore';
import { rebuildAllDigests } from './digest';

const CHUNK = 200;

/** 復元の書き込み (教員のみ)。同じ id の文書は、バックアップの内容で置き換える。 */
export async function applyRestore(writes: Write[], onProgress: (done: number) => void): Promise<void> {
  for (let i = 0; i < writes.length; i += CHUNK) {
    const batch = writeBatch(db);
    for (const w of writes.slice(i, i + CHUNK)) batch.set(doc(db, w.path, w.id), w.data);
    await batch.commit();
    onProgress(Math.min(writes.length, i + CHUNK));
  }
  // タスクを書き戻したチームは、ダッシュボードの集計メモも、作り直す
  const teams = [...new Set(writes.map((w) => /^teams\/([^/]+)\/tasks$/.exec(w.path)?.[1]).filter((x): x is string => !!x))];
  if (teams.length > 0) await rebuildAllDigests(teams);
}
