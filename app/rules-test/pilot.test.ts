import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { collection, doc, getDocs, setDoc } from 'firebase/firestore';
import { applyPilot, buildPilot, DUMMY_NOTE, pastClassDays } from '../scripts/pilot-data.mjs';
import { resetTeams } from '../scripts/reset-team-data.mjs';
import { engagement } from '../src/lib/engagement';
import { teamFlags } from '../src/lib/flags';

const app = getApps().find((a) => a.name === 'pilot-it') ?? initializeApp({ projectId: 'demo-sotsuken' }, 'pilot-it');
const db = getFirestore(app);
const quiet = () => undefined;
const NOW = Date.parse('2026-10-23T03:00:00Z'); // 金曜 (日本時間 12:00)
const TODAY = '2026-10-23';
const MEMBERS = [{ sid: 'D1', name: '小林' }, { sid: 'D2', name: '高瀬' }, { sid: 'D3', name: '徳松' }];

let env: RulesTestEnvironment;
beforeAll(async () => {
  env = await initializeTestEnvironment({ projectId: 'demo-sotsuken', firestore: { rules: readFileSync('firestore.rules', 'utf8'), host: '127.0.0.1', port: 8080 } });
});
afterAll(async () => { await env.cleanup(); });

async function seed() {
  for (const p of ['teams', 'roster', 'config']) await db.recursiveDelete(db.collection(p));
  await db.doc('teams/D').set({ members: MEMBERS, status: 'active', projectName: '', proposals: [], driveUrl: '', kickoffAt: Date.parse('2026-10-22T05:00:00Z'), teamMeetingInput: false });
  await db.doc('roster/teacher@trident.ac.jp').set({ name: '先生', role: 'teacher', teamId: null, sid: null });
  await db.doc('roster/d1@trident.ac.jp').set({ name: '小林', role: 'student', teamId: 'D', sid: 'D1' });
  await db.doc('config/settings').set({ peerDailyView: true, dailyStartDate: '2026-10-28' });
  await db.doc('config/classDays').set({ days: [{ date: '2026-10-28', periods: '3-4', meeting: false, note: '' }] });
  // キックオフ済みの雛形 (大項目) と、叩き台の1件
  const base = { detail: '', status: 'todo', assignees: [], startDate: null, endDate: null, links: [], source: 'draft', createdBy: 'teacher', updatedBy: 'teacher', createdAt: 1, updatedAt: 1, deleted: false, deletedAt: null };
  await db.doc('teams/D/tasks/big1').set({ ...base, title: '企画の具体化', parentId: null, depth: 1, order: 1024 });
  await db.doc('teams/D/tasks/big3').set({ ...base, title: '外部設計', parentId: null, depth: 1, order: 3072 });
  await db.doc('teams/D/tasks/draft1').set({ ...base, title: '画面の一覧を考える', parentId: 'big3', depth: 2, order: 1024 });
}

describe('試運転データ (pilot-data)', () => {
  beforeEach(seed);

  test('授業日は、今日より前の4週間の火・水・木', () => {
    const d = pastClassDays(TODAY);
    expect(d).toHaveLength(12);
    expect(d[0].date).toBe('2026-09-29');
    expect(d.at(-1)).toMatchObject({ date: '2026-10-22', periods: '1-2', meeting: true });
    expect(d.every((x) => x.note === DUMMY_NOTE && x.date < TODAY)).toBe(true);
    expect(pastClassDays('2026-10-27').some((x) => x.date >= '2026-10-27')).toBe(false); // 授業日の当日は含めない
  });

  test('ドライランは何も書かない', async () => {
    const before = (await db.collection('teams/D/tasks').count().get()).data().count;
    await applyPilot({ db, teamId: 'D', dryRun: true, now: NOW, log: quiet });
    expect((await db.collection('teams/D/tasks').count().get()).data().count).toBe(before);
    expect((await db.doc('config/settings').get()).data()?.dailyStartDate).toBe('2026-10-28');
  });

  test('書き込むと、キックオフ済みで途中まで進んだ状態になる。再実行しても増えない。既存の叩き台は重複しない', async () => {
    await applyPilot({ db, teamId: 'D', dryRun: false, now: NOW, log: quiet });
    const count = async (p: string) => (await db.collection(p).count().get()).data().count;
    const after1 = { tasks: await count('teams/D/tasks'), dailies: await count('teams/D/dailyReports'), meetings: await count('teams/D/meetings') };
    expect(after1.tasks).toBeGreaterThan(25);
    expect(after1.meetings).toBe(4);
    const titles = (await db.collection('teams/D/tasks').get()).docs.map((d) => d.data().title);
    expect(titles.filter((t) => t === '画面の一覧を考える')).toHaveLength(1); // 叩き台と重複しない
    expect(titles.filter((t) => t === '企画の具体化')).toHaveLength(1); // 雛形の大項目を使う

    await applyPilot({ db, teamId: 'D', dryRun: false, now: NOW, log: quiet });
    expect({ tasks: await count('teams/D/tasks'), dailies: await count('teams/D/dailyReports'), meetings: await count('teams/D/meetings') }).toEqual(after1);

    const team = (await db.doc('teams/D').get()).data()!;
    expect(team).toMatchObject({ status: 'active', kickoffAt: Date.parse('2026-09-29T10:00:00+09:00') });
    expect(team.projectName).toContain('試運転');
    expect((await db.doc('config/settings').get()).data()?.dailyStartDate).toBe('2026-09-29');
    const days = (await db.doc('config/classDays').get()).data()!.days as { date: string; note: string }[];
    expect(days.filter((d) => d.note === DUMMY_NOTE)).toHaveLength(12);
    expect(days.some((d) => d.date === '2026-10-28')).toBe(true); // 既存の授業日は残る
  });

  test('作ったデータは、ルールを通る形 (教員が書けて、学生が読める)', async () => {
    const p = buildPilot({ teamId: 'D', members: MEMBERS, today: TODAY });
    const t = env.authenticatedContext('teacher', { email: 'teacher@trident.ac.jp', email_verified: true }).firestore();
    await env.withSecurityRulesDisabled(async (ctx) => {
      const d = ctx.firestore();
      await setDoc(doc(d, 'roster/teacher@trident.ac.jp'), { name: '先生', role: 'teacher', teamId: null, sid: null });
      await setDoc(doc(d, 'roster/d1@trident.ac.jp'), { name: '小林', role: 'student', teamId: 'D', sid: 'D1' });
      await setDoc(doc(d, 'config/settings'), { peerDailyView: true });
      await setDoc(doc(d, 'teams/D'), { members: MEMBERS, status: 'active', teamMeetingInput: false });
    });
    for (const [sub, docs] of [['tasks', p.tasks], ['dailyReports', p.dailies], ['meetings', p.meetings], ['comments', p.comments], ['thanks', p.thanks]] as const) {
      for (const x of docs) await assertSucceeds(setDoc(doc(t, `teams/D/${sub}/${x.id}`), x.data));
    }
    const s = env.authenticatedContext('d1', { email: 'd1@trident.ac.jp', email_verified: true }).firestore();
    expect((await assertSucceeds(getDocs(collection(s, 'teams/D/tasks')))).size).toBe(p.tasks.length + 3); // 試験の準備で作った3件を含む
  });

  test('WBS外の作業 (後追い) とアクセス履歴が、型どおりに入る', () => {
    const p = buildPilot({ teamId: 'D', members: MEMBERS, today: TODAY });
    expect(p.tasks.filter((t) => t.data.source === 'adhoc').length).toBe(3); // 大項目 + 2件
    const kids = p.tasks.filter((t) => t.data.parentId === 'adhoc-root');
    expect(kids).toHaveLength(2);
    expect(p.tasks.find((t) => t.id === 'adhoc-root')?.data.assignees).toEqual([]); // 親は担当なし
    const by = (sid: string) => p.accessLogs.filter((x) => x.data.sid === sid);
    expect(by(MEMBERS[0].sid).length).toBe(p.days.length); // 主力は、毎授業日
    expect(by(MEMBERS[2].sid).length).toBeLessThan(by(MEMBERS[0].sid).length / 2); // 消極的な人は、少ない
    const recent = p.days.slice(-3).map((d) => d.date);
    expect(by(MEMBERS[2].sid).some((x) => recent.includes(x.data.date as string))).toBe(false); // 直近は来ていない
    for (const x of p.accessLogs) expect(x.id).toBe(`${x.data.date}_${x.data.sid}`);
  });

  test('画面に出る指標が、狙いどおりになる (主力・ふつう・消極的)', async () => {
    const p = buildPilot({ teamId: 'D', members: MEMBERS, today: TODAY });
    const tasks = p.tasks.map((x) => ({ id: x.id, ...x.data })) as never[];
    const dailies = p.dailies.map((x) => ({ id: x.id, ...x.data })) as never[];
    const meetings = p.meetings.map((x) => ({ id: x.id, ...x.data })) as never[];
    const thanks = p.thanks.map((x) => ({ id: x.id, ...x.data })) as never[];
    const classDays = p.days.map((d) => ({ ...d, periods: d.periods as '1-2' | '3-4' }));
    const stats = engagement({
      members: MEMBERS, tasks, dailies, meetings, thanks, classDays, today: TODAY, dailyStart: p.start, windowFrom: '2026-10-02', kickoffDate: p.start,
    });
    const [a, b, c] = stats;
    expect(a.daily!.submitted / a.daily!.days).toBe(1); // 主力: 全部提出
    expect(b.daily!.submitted).toBeLessThan(b.daily!.days);
    expect(c.daily!.submitted / c.daily!.days).toBeLessThan(0.7); // 消極的: 提出が少ない
    expect(a.assigned).toBeGreaterThan(c.assigned); // 担当の偏り
    expect(stats.some((s) => s.overdue > 0)).toBe(true);
    expect(stats.some((s) => s.promises.total > 0 && s.promises.done < s.promises.total)).toBe(true);

    const flags = teamFlags(
      { id: 'D', members: MEMBERS, status: 'active', projectName: 'x', proposals: [], driveUrl: '', kickoffAt: Date.parse('2026-09-29T10:00:00+09:00'), teamMeetingInput: false },
      tasks, dailies, classDays, TODAY, p.start,
    );
    expect(flags.missing).toEqual(['徳松']); // 2回連続未提出
    expect(flags.unassignedOverdue).toBeGreaterThan(0); // 担当なしの期限超過
  });

  test('メンバーごとの型を指定できる (4人目を「ふつう」にする)', () => {
    const four = [...MEMBERS, { sid: 'D4', name: 'テスト' }];
    const sub = (pe: number[] | null) => buildPilot({ teamId: 'D', members: four, today: TODAY, personas: pe });
    const count = (p: ReturnType<typeof buildPilot>, sid: string) => p.dailies.filter((d) => d.data.sid === sid && !d.data.absent).length;
    expect(count(sub(null), 'D4')).toBeLessThan(7); // 既定: 4人目は、消極的
    expect(count(sub([0, 1, 2, 1]), 'D4')).toBe(10); // ふつう: 12日のうち2日休む
    expect(sub(null).thanks.some((t) => t.data.to === 'D4' || t.data.from === 'D4')).toBe(true); // 4人目にも、ありがとうがある
  });

  test('リセット: カレンダーも元に戻る (ダミーの授業日だけを消し、運用開始日を戻す)', async () => {
    await applyPilot({ db, teamId: 'D', dryRun: false, now: NOW, log: quiet });
    const r = await resetTeams({ db, teams: ['D'], resetTeam: true, restoreCalendar: true, dryRun: false, log: quiet });
    expect(r.calendar).toEqual({ removedClassDays: 12 });
    expect((await db.doc('config/settings').get()).data()?.dailyStartDate).toBe('2026-10-28');
    expect(((await db.doc('config/classDays').get()).data()!.days as unknown[]).length).toBe(1);
    expect((await db.collection('teams/D/tasks').count().get()).data().count).toBe(0);
    expect((await db.doc('teams/D').get()).data()).toMatchObject({ status: 'planning', kickoffAt: null });
  });
});
