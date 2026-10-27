// 試運転のチームに、キックオフの叩き台 (2案) を登録する。GitHub Actions (register-drafts ワークフロー) から実行する。
// 公開リポジトリにある見本 (docs/wbs-drafts/example-soft.md・example-hard.md) だけを使う。企画の資料から作った叩き台は、リポジトリに置かない
// (先生が、設定 > 叩き台の登録 から登録する)。
import { readFileSync } from 'node:fs';
import { applicationDefault, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

import { parseTeams } from './reset-team-data.mjs';

const SAMPLES = [
  { no: 1, title: '試運転用の見本(ソフト系)', file: '../../docs/wbs-drafts/example-soft.md' },
  { no: 2, title: '試運転用の見本(ハード系)', file: '../../docs/wbs-drafts/example-hard.md' },
];

export function sampleDrafts(read = (f) => readFileSync(new URL(f, import.meta.url), 'utf8')) {
  return SAMPLES.map((s) => ({ no: s.no, title: s.title, outline: `企画名: ${s.title}\n${read(s.file).trim()}` }));
}

/**
 * @returns {Promise<Record<string, number[]>>} チームごとの、登録した (ドライランでは登録する) 案の番号
 */
export async function registerDrafts({ db, teams, drafts = sampleDrafts(), dryRun = true, log = console.log }) {
  const report = {};
  for (const id of teams) {
    if (!(await db.doc(`teams/${id}`).get()).exists) {
      log(`チーム ${id}: 存在しないのでスキップ`);
      continue;
    }
    for (const d of drafts) {
      if (d.outline.length > 30000 || d.title.length > 100) throw new Error(`${id}チーム 案${d.no}: 大きすぎます`);
      if (!dryRun) await db.doc(`teams/${id}/kickoffDrafts/${d.no}`).set({ no: d.no, title: d.title, outline: d.outline, updatedAt: Date.now() });
    }
    report[id] = drafts.map((d) => d.no);
    log(`チーム ${id}: 案 ${drafts.map((d) => `${d.no}「${d.title}」`).join('・')}`);
  }
  log(dryRun ? '--- ドライラン: 何も登録していません ---' : '--- 登録しました ---');
  return report;
}

const isMain = process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href;
if (isMain) {
  const teams = parseTeams(process.env.TEAMS);
  initializeApp({ credential: applicationDefault(), projectId: 'sotsuken-pj' });
  await registerDrafts({ db: getFirestore(), teams, dryRun: process.env.DRY_RUN !== 'false' });
}
