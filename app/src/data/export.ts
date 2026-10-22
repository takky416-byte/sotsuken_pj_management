import { collection, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import { TEACHER_ONLY, TOP_COLLECTIONS, teamSubcollections, type Backup, type Doc } from '../lib/export';

const read = async (path: string): Promise<Doc[]> =>
  (await getDocs(collection(db, path))).docs.map((d) => ({ id: d.id, ...d.data() }) as Doc);

/** 全データを読み込む (読み取りは、ドキュメントの件数だけ発生する)。教員のみ。 */
export async function loadBackup(): Promise<Backup> {
  const top = await Promise.all(TOP_COLLECTIONS.map(async (p) => [p, await read(p)] as const));
  const collections: Record<string, Doc[]> = Object.fromEntries(top);
  const teamIds = collections.teams.map((t) => t.id);
  const sub = await Promise.all(teamSubcollections(teamIds).map(async (p) => [p, await read(p)] as const));
  for (const [p, docs] of sub) collections[p] = docs;
  return {
    meta: { app: 'sotsuken-pj', version: 1, exportedAt: new Date().toISOString(), includesTeacherNotes: TEACHER_ONLY.every((p) => p in collections) },
    collections,
  };
}

/** ブラウザの中でファイルを作って、ダウンロードさせる (外部には送らない)。 */
export function download(filename: string, mime: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: `${mime};charset=utf-8` }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
