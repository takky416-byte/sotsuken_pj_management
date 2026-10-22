import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { addDays, today, yesterday } from './dates';

/** エミュレータに、テスト用の初期データを入れる。日付は、実行した日を基準にする。 */
export default async function globalSetup() {
  if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error('Firestore エミュレータの中で実行してください (npm run test:e2e)');
  const app = getApps()[0] ?? initializeApp({ projectId: 'demo-sotsuken' });
  const db = getFirestore(app);

  const roster: [string, string, 'teacher' | 'student', string | null, string | null][] = [
    ['teacher@trident.ac.jp', '先生', 'teacher', null, null],
    ['a1@trident.ac.jp', '岩田', 'student', 'A', 'A1'],
    ['a2@trident.ac.jp', '近内', 'student', 'A', 'A2'],
    ['b1@trident.ac.jp', '長田', 'student', 'B', 'B1'],
  ];
  for (const [email, name, role, teamId, sid] of roster) await db.doc(`roster/${email}`).set({ name, role, teamId, sid });

  const team = (members: { sid: string; name: string }[]) => ({
    members, status: 'planning', projectName: '', proposals: [], driveUrl: '', kickoffAt: null, teamMeetingInput: false,
  });
  await db.doc('teams/A').set(team([{ sid: 'A1', name: '岩田' }, { sid: 'A2', name: '近内' }]));
  await db.doc('teams/B').set(team([{ sid: 'B1', name: '長田' }]));

  const t = today();
  await db.doc('config/settings').set({ peerDailyView: true, rotateOrder: true, dailyStartDate: yesterday() });
  await db.doc('config/classDays').set({
    days: [
      { date: yesterday(), periods: '3-4', meeting: false, note: '' },
      { date: t, periods: '1-2', meeting: true, note: '' },
    ],
  });
  // 前回のミーティングの記録 (今日の「前回のアクション」に出る)
  await db.doc(`teams/A/meetings/${yesterday()}`).set({
    date: yesterday(), decided: '前回の決定', actions: [{ text: '設計を進める', done: false }], note: '', createdBy: 'teacher', updatedAt: 1,
  });
  await db.doc('milestones/common-test').set({ title: 'テスト用の予定', date: addDays(t, 3), endDate: null, teamId: null, note: '' });
}
