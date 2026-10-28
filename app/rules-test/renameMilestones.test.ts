import { beforeEach, describe, expect, test } from 'vitest';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { renameMilestones } from '../scripts/rename-milestones.mjs';

const app = getApps().find((a) => a.name === 'rename-test') ?? initializeApp({ projectId: 'demo-sotsuken' }, 'rename-test');
const db = getFirestore(app);
const quiet = () => undefined;

describe('行事名の言い換え', () => {
  beforeEach(async () => {
    await db.recursiveDelete(db.collection('milestones'));
    await db.doc('milestones/m1').set({ title: '外部設計レビュー', date: '2026-11-25', teamId: null, note: '' });
    await db.doc('milestones/m2').set({ title: '最終レビュー', date: '2027-01-26', teamId: null, note: '' });
    await db.doc('milestones/m3').set({ title: '先生が付けた別の題名', date: '2026-12-01', teamId: null, note: '' });
    await db.doc('config/classDays').set({ days: [{ date: '2026-11-25', periods: '3-4', meeting: false, note: '外部設計レビュー' }, { date: '2026-11-26', periods: '3-4', meeting: false, note: '自分の備考' }] });
  });

  test('ドライランは書き換えない。実行すると、ちょうど一致する題名・備考だけを書き換え、再実行しても同じ', async () => {
    expect(await renameMilestones({ db, dryRun: true, log: quiet })).toEqual({ milestones: 2, classDays: 1 });
    expect((await db.doc('milestones/m1').get()).data()?.title).toBe('外部設計レビュー');
    expect(await renameMilestones({ db, dryRun: false, log: quiet })).toEqual({ milestones: 2, classDays: 1 });
    expect((await db.doc('milestones/m1').get()).data()?.title).toBe('中間報告');
    expect((await db.doc('milestones/m2').get()).data()?.title).toBe('最終発表');
    expect((await db.doc('milestones/m3').get()).data()?.title).toBe('先生が付けた別の題名');
    const days = (await db.doc('config/classDays').get()).data()?.days;
    expect(days.map((d: { note: string }) => d.note)).toEqual(['中間報告', '自分の備考']);
    expect(await renameMilestones({ db, dryRun: false, log: quiet })).toEqual({ milestones: 0, classDays: 0 });
  });
});
