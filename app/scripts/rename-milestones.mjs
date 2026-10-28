// 行事名の言い換え。GitHub Actions (rename-milestones ワークフロー) から実行する。
//  - 共通マイルストーン (milestones) の題名と、授業日 (config/classDays) の備考で、題名がちょうど一致するものだけを書き換える。
//  - 先生が自分で付けた別の題名・備考には触らない。
import { applicationDefault, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

export const RENAMES = { 外部設計レビュー: '中間報告', 最終レビュー: '最終発表' };

/** @returns {Promise<{ milestones: number, classDays: number }>} 書き換えた (ドライランでは書き換える) 件数 */
export async function renameMilestones({ db, dryRun = true, renames = RENAMES, log = console.log }) {
  let milestones = 0;
  for (const d of (await db.collection('milestones').get()).docs) {
    const to = renames[d.data().title];
    if (!to) continue;
    log(`マイルストーン ${d.id}: ${d.data().date} 「${d.data().title}」→「${to}」`);
    if (!dryRun) await d.ref.update({ title: to });
    milestones++;
  }
  let classDays = 0;
  const ref = db.doc('config/classDays');
  const snap = await ref.get();
  if (snap.exists) {
    const days = (snap.data().days ?? []).map((x) => {
      const to = renames[x.note];
      if (!to) return x;
      log(`授業日 ${x.date}: 備考「${x.note}」→「${to}」`);
      classDays++;
      return { ...x, note: to };
    });
    if (classDays > 0 && !dryRun) await ref.update({ days });
  }
  log(dryRun ? '--- ドライラン: 何も書き換えていません ---' : '--- 書き換えました ---');
  return { milestones, classDays };
}

const isMain = process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href;
if (isMain) {
  initializeApp({ credential: applicationDefault(), projectId: 'sotsuken-pj' });
  await renameMilestones({ db: getFirestore(), dryRun: process.env.DRY_RUN !== 'false' });
}
