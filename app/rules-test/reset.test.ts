import { beforeEach, describe, expect, test } from 'vitest';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { parseTeams, resetTeams } from '../scripts/reset-team-data.mjs';

// firebase emulators:exec が FIRESTORE_EMULATOR_HOST を設定する
const app = getApps().find((a) => a.name === 'reset-test') ?? initializeApp({ projectId: 'demo-sotsuken' }, 'reset-test');
const db = getFirestore(app);
const quiet = () => undefined;

async function seed() {
  const clear = async () => {
    for (const p of ['teams', 'roster', 'config', 'milestones', 'teacherNotes']) await db.recursiveDelete(db.collection(p));
  };
  await clear();
  for (const t of ['A', 'B']) {
    await db.doc(`teams/${t}`).set({ status: 'active', projectName: `企画${t}`, proposals: [{ no: 1, title: 'x', adopted: true }], driveUrl: 'https://x', kickoffAt: 1, members: [{ sid: `${t}1`, name: 'x' }], teamMeetingInput: true });
    await db.doc(`teams/${t}/tasks/t1`).set({ title: 'x' });
    await db.doc(`teams/${t}/tasks/t2`).set({ title: 'y' });
    await db.doc(`teams/${t}/dailyReports/2026-10-26_${t}1`).set({ sid: `${t}1` });
    await db.doc(`teams/${t}/meetings/2026-10-29`).set({ date: '2026-10-29' });
    await db.doc(`teams/${t}/comments/c1`).set({ body: 'x' });
    await db.doc(`teacherNotes/n${t}`).set({ teamId: t, body: 'メモ' });
  }
  await db.doc('roster/a@trident.ac.jp').set({ name: '岩田', role: 'student', teamId: 'A', sid: 'A1' });
  await db.doc('config/settings').set({ peerDailyView: true });
  await db.doc('milestones/m1').set({ title: 'x', date: '2026-10-27', teamId: null });
}
const count = async (path: string) => (await db.collection(path).count().get()).data().count;

describe('試運転データの削除', () => {
  beforeEach(seed);

  test('チームの指定を検証する', () => {
    expect(parseTeams('a, B,a')).toEqual(['A', 'B']);
    expect(() => parseTeams('')).toThrow();
    expect(() => parseTeams('A,Z')).toThrow();
    expect(() => parseTeams('all')).toThrow();
  });

  test('ドライランは件数を数えるだけで、何も消さない', async () => {
    const r = await resetTeams({ db, teams: ['A'], dryRun: true, log: quiet });
    expect(r.A).toEqual({ tasks: 2, dailyReports: 1, meetings: 1, comments: 1, thanks: 0, taskLogs: 0, accessLogs: 0 });
    expect(await count('teams/A/tasks')).toBe(2);
  });

  test('指定したチームのタスク・作業ログ・記録・コメントだけを消す', async () => {
    await resetTeams({ db, teams: ['A'], dryRun: false, log: quiet });
    for (const sub of ['tasks', 'dailyReports', 'meetings', 'comments']) expect(await count(`teams/A/${sub}`)).toBe(0);
    // ほかのチーム、名簿、設定、マイルストーン、教員メモには触れない
    expect(await count('teams/B/tasks')).toBe(2);
    expect(await count('teams/B/dailyReports')).toBe(1);
    expect(await count('roster')).toBe(1);
    expect(await count('config')).toBe(1);
    expect(await count('milestones')).toBe(1);
    expect(await count('teacherNotes')).toBe(2);
    // チームの状態も、そのまま
    expect((await db.doc('teams/A').get()).data()?.status).toBe('active');
  });

  test('オプション: 教員メモと、チームの状態の初期化', async () => {
    await resetTeams({ db, teams: ['A'], includeTeacherNotes: true, resetTeam: true, dryRun: false, log: quiet });
    expect(await count('teacherNotes')).toBe(1);
    expect((await db.doc('teacherNotes/nB').get()).exists).toBe(true);
    const a = (await db.doc('teams/A').get()).data()!;
    expect(a).toMatchObject({ status: 'planning', projectName: '', proposals: [], driveUrl: '', kickoffAt: null });
    expect(a.members).toHaveLength(1); // メンバー表示は残す
    expect(a.teamMeetingInput).toBe(true);
  });

  test('存在しないチームはスキップする', async () => {
    const r = await resetTeams({ db, teams: ['H'], dryRun: false, log: quiet });
    expect(r).toEqual({});
  });
});
