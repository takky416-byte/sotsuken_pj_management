// 試運転のデータを消す。GitHub Actions (reset-pilot ワークフロー) から実行する。
// 消すのは、指定したチームのタスク・作業ログ・ミーティング記録・コメントだけ。
// 名簿・設定・マイルストーン・授業日・ほかのチームには触れない。
import { applicationDefault, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

import { DEFAULT_DAILY_START, DUMMY_NOTE } from './pilot-data.mjs';

const SUBCOLLECTIONS = ['tasks', 'dailyReports', 'meetings', 'comments', 'thanks', 'taskLogs', 'meetingDrafts', 'meetingSummaries'];
const VALID_TEAM = /^[A-H]$/;

export function parseTeams(text) {
  const teams = String(text ?? '').split(',').map((s) => s.trim().toUpperCase()).filter(Boolean);
  if (teams.length === 0) throw new Error('チームを指定してください (例: A,B)');
  const bad = teams.filter((t) => !VALID_TEAM.test(t));
  if (bad.length) throw new Error(`チームは A〜H で指定してください: ${bad.join(', ')}`);
  return [...new Set(teams)];
}

/**
 * @returns {Promise<Record<string, Record<string, number>>>} チームごとの、削除した (ドライランでは削除する) 件数
 */
export async function resetTeams({ db, teams, resetTeam = false, includeTeacherNotes = false, restoreCalendar = false, dryRun = true, log = console.log }) {
  const report = {};
  for (const id of teams) {
    const team = db.doc(`teams/${id}`);
    if (!(await team.get()).exists) {
      log(`チーム ${id}: 存在しないのでスキップ`);
      continue;
    }
    const counts = {};
    for (const name of SUBCOLLECTIONS) {
      const col = team.collection(name);
      counts[name] = (await col.count().get()).data().count;
      if (!dryRun && counts[name] > 0) await db.recursiveDelete(col);
    }
    if (includeTeacherNotes) {
      const notes = await db.collection('teacherNotes').where('teamId', '==', id).get();
      counts.teacherNotes = notes.size;
      if (!dryRun) await Promise.all(notes.docs.map((d) => d.ref.delete()));
    }
    // 試運転のアクセス履歴 (そのチームの学生の分) も消す
    const access = await db.collection('accessLogs').where('teamId', '==', id).get();
    counts.accessLogs = access.size;
    if (!dryRun) await Promise.all(access.docs.map((d) => d.ref.delete()));
    if (resetTeam) {
      counts.teamReset = 1;
      if (!dryRun) {
        await team.update({ status: 'planning', projectName: '', proposals: [], driveUrl: '', kickoffAt: null });
      }
    }
    report[id] = counts;
    log(`チーム ${id}: ${Object.entries(counts).map(([k, v]) => `${k}=${v}`).join(' ')}`);
  }
  if (restoreCalendar) {
    // pilot-data が足した授業日 (備考がダミー) を消し、作業ログの運用開始日を元に戻す
    const doc = await db.doc('config/classDays').get();
    const days = doc.exists ? doc.data().days ?? [] : [];
    const kept = days.filter((d) => d.note !== DUMMY_NOTE);
    report.calendar = { removedClassDays: days.length - kept.length };
    log(`カレンダー: ダミーの授業日 ${days.length - kept.length}日、作業ログの運用開始日 → ${DEFAULT_DAILY_START}`);
    if (!dryRun) {
      await db.doc('config/classDays').set({ days: kept });
      await db.doc('config/settings').set({ dailyStartDate: DEFAULT_DAILY_START }, { merge: true });
    }
  }
  log(dryRun ? '--- ドライラン: 何も削除していません ---' : '--- 削除しました ---');
  return report;
}

const isMain = process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href;
if (isMain) {
  const flag = (name, def) => (process.env[name] === undefined ? def : process.env[name] === 'true');
  const teams = parseTeams(process.env.TEAMS);
  initializeApp({ credential: applicationDefault(), projectId: 'sotsuken-pj' });
  await resetTeams({
    db: getFirestore(),
    teams,
    resetTeam: flag('RESET_TEAM', false),
    includeTeacherNotes: flag('INCLUDE_TEACHER_NOTES', false),
    restoreCalendar: flag('RESTORE_CALENDAR', false),
    dryRun: flag('DRY_RUN', true),
  });
}
