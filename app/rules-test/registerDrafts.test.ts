import { beforeEach, describe, expect, test } from 'vitest';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { registerDrafts, sampleDrafts } from '../scripts/register-kickoff-drafts.mjs';
import { parseDraftBundle } from '../src/lib/draftBundle';
import { checkDraft } from '../src/lib/draftCheck';
import { fillPeriods } from '../src/lib/draftSchedule';

const app = getApps().find((a) => a.name === 'register-test') ?? initializeApp({ projectId: 'demo-sotsuken' }, 'register-test');
const db = getFirestore(app);
const quiet = () => undefined;

describe('試運転の叩き台の登録', () => {
  beforeEach(async () => {
    await db.recursiveDelete(db.collection('teams'));
    for (const t of ['C', 'D']) await db.doc(`teams/${t}`).set({ status: 'planning', projectName: '', proposals: [], driveUrl: 'https://x', kickoffAt: null, members: [], teamMeetingInput: false });
  });

  test('見本の2案は、アプリの登録画面と同じ読み方で読めて、点検を通る', () => {
    const drafts = sampleDrafts();
    expect(drafts.map((d) => d.no)).toEqual([1, 2]);
    const bundle = drafts.map((d) => `@@ チームC 案${d.no}\n${d.outline}`).join('\n\n');
    const r = parseDraftBundle(bundle);
    expect(r.errors).toEqual([]);
    expect(r.entries.map((e) => e.title)).toEqual(['試運転用の見本(ソフト系)', '試運転用の見本(ハード系)']);
    expect(checkDraft(fillPeriods(drafts[0].outline), 'ソフト').issues.filter((i) => i.level === 'error')).toEqual([]);
    expect(checkDraft(fillPeriods(drafts[1].outline), 'ハード').issues.filter((i) => i.level === 'error')).toEqual([]);
  });

  test('ドライランは書かない。実行すると、チームごとに2案が入り、チームの情報には触れない。再実行しても増えない', async () => {
    await registerDrafts({ db, teams: ['C', 'D'], dryRun: true, log: quiet });
    expect((await db.collection('teams/C/kickoffDrafts').get()).size).toBe(0);
    const r = await registerDrafts({ db, teams: ['C', 'D', 'Z'], dryRun: false, log: quiet });
    expect(r).toEqual({ C: [1, 2], D: [1, 2] });
    await registerDrafts({ db, teams: ['C'], dryRun: false, log: quiet });
    const docs = (await db.collection('teams/C/kickoffDrafts').get()).docs;
    expect(docs.map((d) => d.id).sort()).toEqual(['1', '2']);
    expect(docs[0].data()).toMatchObject({ no: 1, title: '試運転用の見本(ソフト系)' });
    expect(docs[0].data().outline.startsWith('企画名: 試運転用の見本(ソフト系)\n# 要件定義')).toBe(true);
    expect((await db.doc('teams/C').get()).data()).toMatchObject({ status: 'planning', driveUrl: 'https://x' });
  });
});
