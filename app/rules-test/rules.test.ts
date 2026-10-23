import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, test } from 'vitest';
import {
  assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  addDoc, collection, deleteDoc, doc, getDoc, getDocs, query, setDoc, updateDoc, where,
} from 'firebase/firestore';

let env: RulesTestEnvironment;

const TEACHER = 'teacher@trident.ac.jp';
const A1 = 'a1@trident.ac.jp';
const A2 = 'a2@trident.ac.jp';
const B1 = 'b1@trident.ac.jp';

const jstDayKey = () => {
  const t = new Date(Date.now() + 9 * 3600 * 1000);
  return t.getUTCFullYear() * 10000 + (t.getUTCMonth() + 1) * 100 + t.getUTCDate();
};
const jstDate = () => {
  const k = jstDayKey();
  const s = String(k);
  return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
};

const as = (email: string, verified = true) =>
  env.authenticatedContext(email.split('@')[0], { email, email_verified: verified }).firestore();

const task = (by: string, over: Record<string, unknown> = {}) => ({
  title: '要件定義', detail: '', parentId: null, depth: 1, order: 1, status: 'todo',
  assignees: [], startDate: null, endDate: null, links: [], source: 'user',
  createdBy: by, updatedBy: by, createdAt: 1, updatedAt: 1, deleted: false, deletedAt: null,
  ...over,
});

const daily = (sid: string, over: Record<string, unknown> = {}) => ({
  sid, date: jstDate(), dayKey: jstDayKey(),
  entries: [{ kind: 'study', note: '調べた' }], blocker: '', absent: false,
  submittedAt: 1, updatedAt: 1, ...over,
});

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-sotsuken',
    firestore: { rules: readFileSync('firestore.rules', 'utf8'), host: '127.0.0.1', port: 8080 },
  });
});
afterAll(async () => { await env.cleanup(); });

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'roster', TEACHER), { name: '先生', role: 'teacher', teamId: null, sid: null });
    await setDoc(doc(db, 'roster', A1), { name: '岩田', role: 'student', teamId: 'A', sid: 'A1' });
    await setDoc(doc(db, 'roster', A2), { name: '近内', role: 'student', teamId: 'A', sid: 'A2' });
    await setDoc(doc(db, 'roster', B1), { name: '長田', role: 'student', teamId: 'B', sid: 'B1' });
    await setDoc(doc(db, 'teams', 'A'), { status: 'active', teamMeetingInput: false, members: [] });
    await setDoc(doc(db, 'teams', 'B'), { status: 'active', teamMeetingInput: false, members: [] });
    await setDoc(doc(db, 'config', 'settings'), { peerDailyView: true });
    await setDoc(doc(db, 'teams/A/tasks/t1'), task('A1'));
    await setDoc(doc(db, 'teams/B/tasks/t1'), task('B1'));
    await setDoc(doc(db, 'teacherNotes', 'n1'), { teamId: 'A', body: '要注意' });
    await setDoc(doc(db, 'milestones', 'common'), { title: '企画発表', date: '2026-10-27', teamId: null });
    await setDoc(doc(db, 'milestones', 'teamA'), { title: 'A固有', date: '2026-11-01', teamId: 'A' });
    await setDoc(doc(db, 'milestones', 'teamB'), { title: 'B固有', date: '2026-11-01', teamId: 'B' });
    await setDoc(doc(db, `teams/A/dailyReports/${jstDate()}_A2`), daily('A2'));
  });
});

describe('認証と名簿', () => {
  test('未ログインは何も読めない', async () => {
    await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), 'teams/A')));
  });
  test('学校以外のメールは拒否', async () => {
    await assertFails(getDoc(doc(as('x@gmail.com'), 'teams/A')));
  });
  test('メール未確認は拒否', async () => {
    await assertFails(getDoc(doc(as(A1, false), 'teams/A')));
  });
  test('名簿にない学校アカウントは拒否', async () => {
    await assertFails(getDoc(doc(as('other@trident.ac.jp'), 'teams/A')));
  });
  test('学生は自分の名簿だけ読め、一覧は読めない', async () => {
    await assertSucceeds(getDoc(doc(as(A1), 'roster', A1)));
    await assertFails(getDoc(doc(as(A1), 'roster', A2)));
    await assertFails(getDocs(collection(as(A1), 'roster')));
  });
  test('教員は名簿を読み書きできる', async () => {
    await assertSucceeds(getDocs(collection(as(TEACHER), 'roster')));
    await assertSucceeds(setDoc(doc(as(TEACHER), 'roster', 'new@trident.ac.jp'),
      { name: '新', role: 'student', teamId: 'C', sid: 'C1' }));
  });
  test('学生は名簿を書き換えられない', async () => {
    await assertFails(setDoc(doc(as(A1), 'roster', A1), { name: '岩田', role: 'teacher', teamId: 'A', sid: 'A1' }));
  });
});

describe('チームの分離', () => {
  test('自チームは読めて、他チームは読めない', async () => {
    await assertSucceeds(getDoc(doc(as(A1), 'teams/A')));
    await assertFails(getDoc(doc(as(A1), 'teams/B')));
    await assertFails(getDocs(collection(as(A1), 'teams/B/tasks')));
  });
  test('教員は全チームを読める', async () => {
    await assertSucceeds(getDoc(doc(as(TEACHER), 'teams/B')));
    await assertSucceeds(getDocs(collection(as(TEACHER), 'teams/B/tasks')));
  });
  test('学生はチーム情報を書き換えられない', async () => {
    await assertFails(updateDoc(doc(as(A1), 'teams/A'), { teamMeetingInput: true }));
  });
});

describe('教員専用データ', () => {
  test('学生は教員メモ・評価元データを読めない', async () => {
    await assertFails(getDoc(doc(as(A1), 'teacherNotes/n1')));
    await assertFails(getDocs(collection(as(A1), 'teacherNotes')));
    await assertFails(getDocs(collection(as(A1), 'evaluationsRaw')));
    await assertFails(getDocs(collection(as(A1), 'followups')));
  });
  test('教員は読み書きできる', async () => {
    await assertSucceeds(getDoc(doc(as(TEACHER), 'teacherNotes/n1')));
    await assertSucceeds(addDoc(collection(as(TEACHER), 'teacherNotes'), { teamId: 'A', body: 'x' }));
  });
});

describe('タスク', () => {
  test('自チームで作成できる', async () => {
    await assertSucceeds(setDoc(doc(as(A1), 'teams/A/tasks/t2'), task('A1')));
  });
  test('階層は3つまで。最上位だけが第1階層', async () => {
    await assertFails(setDoc(doc(as(A1), 'teams/A/tasks/d4'), task('A1', { depth: 4, parentId: 't1' })));
    await assertFails(setDoc(doc(as(A1), 'teams/A/tasks/d1x'), task('A1', { depth: 1, parentId: 't1' }))); // 親があるのに第1階層
    await assertFails(setDoc(doc(as(A1), 'teams/A/tasks/d2x'), task('A1', { depth: 2, parentId: null }))); // 親がないのに第2階層
    await assertSucceeds(setDoc(doc(as(A1), 'teams/A/tasks/d3'), task('A1', { depth: 3, parentId: 't1' })));
  });
  test('他チームには作成できない', async () => {
    await assertFails(setDoc(doc(as(A1), 'teams/B/tasks/t2'), task('A1')));
  });
  test('チームの誰でも他メンバーのタスクを編集できる', async () => {
    await assertSucceeds(updateDoc(doc(as(A2), 'teams/A/tasks/t1'), { title: '変更', updatedBy: 'A2' }));
  });
  test('教員は、復元のために、ほかの人が作った・更新した形のタスクを書ける。学生はできない', async () => {
    await assertSucceeds(setDoc(doc(as(TEACHER), 'teams/A/tasks/restored'), task('A1', { updatedBy: 'A2' })));
    await assertFails(setDoc(doc(as(A1), 'teams/A/tasks/forged'), task('A2')));
  });
  test('更新者を偽れない', async () => {
    await assertFails(updateDoc(doc(as(A2), 'teams/A/tasks/t1'), { updatedBy: 'A1' }));
  });
  test('作成者は書き換えられない', async () => {
    await assertFails(updateDoc(doc(as(A2), 'teams/A/tasks/t1'), { createdBy: 'A2', updatedBy: 'A2' }));
  });
  test('削除は deleted フラグで行い、物理削除はできない', async () => {
    await assertSucceeds(updateDoc(doc(as(A1), 'teams/A/tasks/t1'),
      { deleted: true, deletedAt: 2, updatedBy: 'A1' }));
    await assertFails(deleteDoc(doc(as(A1), 'teams/A/tasks/t1')));
    await assertFails(deleteDoc(doc(as(TEACHER), 'teams/A/tasks/t1')));
  });
  test('不正な値は拒否 (状態、階層、タイトル長、未知の項目)', async () => {
    const db = as(A1);
    await assertFails(setDoc(doc(db, 'teams/A/tasks/x1'), task('A1', { status: 'bogus' })));
    await assertFails(setDoc(doc(db, 'teams/A/tasks/x2'), task('A1', { depth: 4 })));
    await assertFails(setDoc(doc(db, 'teams/A/tasks/x3'), task('A1', { title: '' })));
    await assertFails(setDoc(doc(db, 'teams/A/tasks/x4'), task('A1', { title: 'a'.repeat(201) })));
    await assertFails(setDoc(doc(db, 'teams/A/tasks/x5'), task('A1', { hack: 1 })));
  });
  test('教員は teacher として作成できる', async () => {
    await assertSucceeds(setDoc(doc(as(TEACHER), 'teams/A/tasks/t3'), task('teacher')));
  });
});

describe('日報', () => {
  test('自分の今日の分を作成・編集できる', async () => {
    const ref = doc(as(A1), `teams/A/dailyReports/${jstDate()}_A1`);
    await assertSucceeds(setDoc(ref, daily('A1')));
    await assertSucceeds(updateDoc(ref, { blocker: '困っている' }));
  });
  test('今日以外の日付は作成できない', async () => {
    await assertFails(setDoc(doc(as(A1), 'teams/A/dailyReports/2026-01-01_A1'),
      daily('A1', { date: '2026-01-01', dayKey: 20260101 })));
  });
  test('dayKey だけ今日にして、過去の日付の日報を後出しすることはできない', async () => {
    await assertFails(setDoc(doc(as(A1), 'teams/A/dailyReports/2026-01-01_A1'),
      daily('A1', { date: '2026-01-01', dayKey: jstDayKey() })));
  });
  test('結果つきの項目と、次にやることを保存できる。次にやることは1000字まで', async () => {
    const ref = doc(as(A1), `teams/A/dailyReports/${jstDate()}_A1`);
    const entries = [{ kind: 'task', taskId: 't1', note: '画面を作った', result: 'done' }];
    await assertSucceeds(setDoc(ref, daily('A1', { entries, next: '管理者画面のワイヤーフレームを描く' })));
    await assertFails(setDoc(ref, daily('A1', { entries, next: 'あ'.repeat(1001) })));
    await assertFails(setDoc(ref, daily('A1', { entries, next: 123 })));
  });
  test('他人の分は作成・編集できない', async () => {
    await assertFails(setDoc(doc(as(A1), `teams/A/dailyReports/${jstDate()}_A2`), daily('A2')));
    await assertFails(updateDoc(doc(as(A1), `teams/A/dailyReports/${jstDate()}_A2`), { blocker: 'x' }));
  });
  test('学生は欠席にできない', async () => {
    await assertFails(setDoc(doc(as(A1), `teams/A/dailyReports/${jstDate()}_A1`), daily('A1', { absent: true })));
  });
  test('教員は欠席にでき、学生はその後に編集できない', async () => {
    const path = `teams/A/dailyReports/${jstDate()}_A1`;
    await assertSucceeds(setDoc(doc(as(TEACHER), path), daily('A1', { absent: true, entries: [] })));
    await assertFails(updateDoc(doc(as(A1), path), { absent: false }));
  });
  test('チーム内の閲覧は設定に従う', async () => {
    const path = `teams/A/dailyReports/${jstDate()}_A2`;
    await assertSucceeds(getDoc(doc(as(A1), path)));
    await assertSucceeds(getDocs(collection(as(A1), 'teams/A/dailyReports')));
    await env.withSecurityRulesDisabled((ctx) =>
      setDoc(doc(ctx.firestore(), 'config/settings'), { peerDailyView: false }));
    await assertFails(getDoc(doc(as(A1), path)));
    await assertSucceeds(getDoc(doc(as(A2), path)));
    await assertSucceeds(getDoc(doc(as(TEACHER), path)));
  });
  test('他チームの日報は読めない', async () => {
    await assertFails(getDoc(doc(as(B1), `teams/A/dailyReports/${jstDate()}_A2`)));
  });
});

describe('ありがとう', () => {
  const thank = (from: string, to: string, over: Record<string, unknown> = {}) =>
    ({ from, to, note: '助かった', date: jstDate(), createdAt: 1, ...over });
  test('チームの仲間に、自分の名前で送れる。内容は変えられない', async () => {
    const ref = doc(as(A1), 'teams/A/thanks/x1');
    await assertSucceeds(setDoc(ref, thank('A1', 'A2')));
    await assertFails(updateDoc(ref, { note: '変更' }));
  });
  test('送り主を偽れない・自分には送れない・長すぎる・過去の日付・余計な項目は不可', async () => {
    await assertFails(setDoc(doc(as(A1), 'teams/A/thanks/x2'), thank('A2', 'A1')));
    await assertFails(setDoc(doc(as(A1), 'teams/A/thanks/x3'), thank('A1', 'A1')));
    await assertFails(setDoc(doc(as(A1), 'teams/A/thanks/x4'), thank('A1', 'A2', { note: 'あ'.repeat(101) })));
    await assertFails(setDoc(doc(as(A1), 'teams/A/thanks/x5'), thank('A1', 'A2', { date: '2026-01-01' })));
    await assertFails(setDoc(doc(as(A1), 'teams/A/thanks/x6'), thank('A1', 'A2', { points: 100 })));
  });
  test('他のチームには送れない・読めない', async () => {
    await assertFails(setDoc(doc(as(B1), 'teams/A/thanks/x7'), thank('B1', 'A1')));
    await assertSucceeds(setDoc(doc(as(A1), 'teams/A/thanks/x8'), thank('A1', 'A2')));
    await assertFails(getDoc(doc(as(B1), 'teams/A/thanks/x8')));
    await assertSucceeds(getDoc(doc(as(A2), 'teams/A/thanks/x8')));
  });
  test('取り消せるのは、送った本人と教員だけ', async () => {
    await assertSucceeds(setDoc(doc(as(A1), 'teams/A/thanks/x9'), thank('A1', 'A2')));
    await assertFails(deleteDoc(doc(as(A2), 'teams/A/thanks/x9')));
    await assertSucceeds(deleteDoc(doc(as(A1), 'teams/A/thanks/x9')));
    await assertSucceeds(setDoc(doc(as(A1), 'teams/A/thanks/x10'), thank('A1', 'A2')));
    await assertSucceeds(deleteDoc(doc(as(TEACHER), 'teams/A/thanks/x10')));
  });
  test('教員も送れる (from は teacher)', async () => {
    await assertSucceeds(setDoc(doc(as(TEACHER), 'teams/A/thanks/x11'), thank('teacher', 'A1')));
  });
});

describe('ミーティング記録・コメント・設定', () => {
  test('学生は、チームの設定が許可しているときだけ記録を書ける', async () => {
    const ref = doc(as(A1), 'teams/A/meetings/2026-10-29');
    await assertFails(setDoc(ref, { decided: 'x', actions: [], note: '' }));
    await env.withSecurityRulesDisabled((ctx) => updateDoc(doc(ctx.firestore(), 'teams/A'), { teamMeetingInput: true }));
    await assertSucceeds(setDoc(ref, { decided: 'x', actions: [], note: '' }));
    await assertFails(setDoc(doc(as(B1), 'teams/B/meetings/2026-10-29'), { decided: 'x', actions: [], note: '' }));
  });
  test('教員は記録を書ける。コメントは教員のみ書ける', async () => {
    await assertSucceeds(setDoc(doc(as(TEACHER), 'teams/A/meetings/2026-10-29'), { decided: 'x', actions: [], note: '' }));
    await assertSucceeds(addDoc(collection(as(TEACHER), 'teams/A/comments'), { body: 'よい' }));
    await assertFails(addDoc(collection(as(A1), 'teams/A/comments'), { body: 'x' }));
    await assertSucceeds(getDocs(collection(as(A1), 'teams/A/comments')));
  });
  test('設定とマイルストーンは教員のみ書ける', async () => {
    await assertFails(setDoc(doc(as(A1), 'config/settings'), { peerDailyView: false }));
    await assertFails(setDoc(doc(as(A1), 'milestones/new'), { title: 'x', date: '2026-11-01', teamId: null }));
    await assertSucceeds(setDoc(doc(as(TEACHER), 'config/settings'), { peerDailyView: false }));
  });
  test('マイルストーンは共通と自チームだけ読める', async () => {
    const db = as(A1);
    await assertSucceeds(getDocs(query(collection(db, 'milestones'), where('teamId', '==', null))));
    await assertSucceeds(getDocs(query(collection(db, 'milestones'), where('teamId', '==', 'A'))));
    await assertFails(getDocs(query(collection(db, 'milestones'), where('teamId', '==', 'B'))));
    await assertFails(getDocs(collection(db, 'milestones')));
    await assertSucceeds(getDocs(collection(as(TEACHER), 'milestones')));
  });
});

// ---- アプリが実際に書き込むデータの形が、ルールに拒否されないこと ----
import { taskDoc } from '../src/lib/taskDoc';
import { dailyDoc, dailyId } from '../src/lib/daily';

describe('アクセス履歴', () => {
  const log = (sid: string, over: Record<string, unknown> = {}) => ({
    sid, teamId: 'A', date: jstDate(), firstAt: 1000, lastAt: 1000, visits: 1, views: 1, screens: { home: 1 }, ...over,
  });
  const id = (sid: string) => `${jstDate()}_${sid}`;

  test('学生: 自分の今日の分を作り、増える方向にだけ更新できる。読めるのは教員だけ', async () => {
    const db = as(A1);
    const ref = doc(db, 'accessLogs', id('A1'));
    await assertSucceeds(setDoc(ref, log('A1')));
    await assertSucceeds(updateDoc(ref, { lastAt: 2000, visits: 2, views: 5, 'screens.home': 4, 'screens.wbs': 1 }));
    await assertFails(updateDoc(ref, { views: 1 })); // 減らせない
    await assertFails(updateDoc(ref, { firstAt: 5 })); // 初回は変えられない
    await assertFails(updateDoc(ref, { extra: 1 })); // 余計な項目
    await assertFails(getDoc(ref)); // 学生は、自分の分も読めない
    await assertSucceeds(getDoc(doc(as(TEACHER), 'accessLogs', id('A1'))));
  });

  test('学生: 他人の分・過去の日・別のID・教員の書き込みは拒否', async () => {
    await assertFails(setDoc(doc(as(A1), 'accessLogs', id('A2')), log('A2')));
    await assertFails(setDoc(doc(as(A1), 'accessLogs', '2020-01-01_A1'), log('A1', { date: '2020-01-01' })));
    await assertFails(setDoc(doc(as(A1), 'accessLogs', 'x_A1'), log('A1')));
    await assertFails(setDoc(doc(as(TEACHER), 'accessLogs', id('A1')), log('A1')));
    await assertFails(deleteDoc(doc(as(A1), 'accessLogs', id('A1'))));
  });
});

describe('アプリの書き込みの形', () => {
  const nt = (id: string, over = {}) => ({ id, parentId: null, depth: 1 as const, title: 'タスク', detail: '', order: 1024, ...over });

  test('学生: 日報の「WBSにない作業」を、後追いのタスクとして作れる (完了済み・自分が担当)', async () => {
    const db = as(A1);
    await assertSucceeds(setDoc(doc(db, 'teams/A/tasks/adhoc-root'), taskDoc(nt('adhoc-root', { title: 'WBS外の作業(あとから追加)' }), 'A1', 'adhoc')));
    await assertSucceeds(setDoc(doc(db, 'teams/A/tasks/ad1'),
      taskDoc({ ...nt('ad1', { parentId: 'adhoc-root', depth: 2 }), assignees: ['A1'], startDate: '2026-11-04', endDate: '2026-11-04', status: 'done' }, 'A1', 'adhoc')));
    // 知らない種類は作れない
    await assertFails(setDoc(doc(db, 'teams/A/tasks/ad2'), taskDoc(nt('ad2'), 'A1', 'other' as never)));
  });

  test('学生: 新規作成・状態変更・並べ替え・担当/日付/リンク・削除と復元', async () => {
    const db = as(A1);
    const ref = doc(db, 'teams/A/tasks/new1');
    await assertSucceeds(setDoc(ref, taskDoc(nt('new1'), 'A1', 'user')));
    await assertSucceeds(updateDoc(ref, { status: 'doing', updatedBy: 'A1', updatedAt: 2 }));
    await assertSucceeds(updateDoc(ref, { parentId: 't1', depth: 2, order: 5, updatedBy: 'A1', updatedAt: 3 }));
    await assertSucceeds(updateDoc(ref, {
      assignees: ['A1', 'A2'], startDate: '2026-10-28', endDate: '2026-11-05', detail: 'メモ',
      links: [{ url: 'https://example.com', label: '' }], updatedBy: 'A1', updatedAt: 4,
    }));
    await assertSucceeds(updateDoc(ref, { deleted: true, deletedAt: 5, updatedBy: 'A1', updatedAt: 5 }));
    await assertSucceeds(updateDoc(ref, { deleted: false, deletedAt: null, updatedBy: 'A1', updatedAt: 6 }));
  });

  test('教員: キックオフ (雛形・叩き台・チーム更新) と、名簿・チーム・カレンダーの書き込み', async () => {
    const db = as(TEACHER);
    await assertSucceeds(setDoc(doc(db, 'teams/A/tasks/k1'), taskDoc(nt('k1'), 'teacher', 'user')));
    await assertSucceeds(setDoc(doc(db, 'teams/A/tasks/k2'), taskDoc(nt('k2', { parentId: 'k1', depth: 2 }), 'teacher', 'draft')));
    await assertSucceeds(updateDoc(doc(db, 'teams/A'), {
      status: 'active', projectName: '企画', proposals: [{ no: 1, title: '企画', adopted: true }], driveUrl: '', kickoffAt: 1,
    }));
    await assertSucceeds(setDoc(doc(db, 'teams/A'), { members: [{ sid: 'A1', name: '岩田' }] }, { merge: true }));
    await assertSucceeds(setDoc(doc(db, 'roster/new@trident.ac.jp'), { name: '森', role: 'student', teamId: 'A', sid: 'A3' }));
    await assertSucceeds(setDoc(doc(db, 'milestones/m1'), { title: 'x', date: '2026-11-01', endDate: null, teamId: null, note: '' }));
    await assertSucceeds(setDoc(doc(db, 'config/classDays'), { days: [{ date: '2026-10-29', periods: '1-2', meeting: true, note: '' }] }));
  });

  test('学生は、教員が作った叩き台も編集できる', async () => {
    await assertSucceeds(setDoc(doc(as(TEACHER), 'teams/A/tasks/k2'), taskDoc(nt('k2'), 'teacher', 'draft')));
    await assertSucceeds(updateDoc(doc(as(A1), 'teams/A/tasks/k2'), { title: '直した', updatedBy: 'A1', updatedAt: 9 }));
  });

  test('学生は、更新者を教員と偽って書き込めない', async () => {
    await assertFails(setDoc(doc(as(A1), 'teams/A/tasks/z'), taskDoc(nt('z'), 'teacher', 'user')));
  });
});

describe('日報: アプリの書き込みの形', () => {
  const d = jstDate();
  test('学生: 提出 → 当日中の更新。教員: 欠席にする・取り消す', async () => {
    const mk = (sid: string, over: object = {}) =>
      dailyDoc({ sid, date: d, entries: [{ kind: 'task', taskId: 't1', note: '進めた' }, { kind: 'study', note: '' }], blocker: '', absent: false, ...over }, undefined);
    const ref = doc(as(A1), `teams/A/dailyReports/${dailyId(d, 'A1')}`);
    await assertSucceeds(setDoc(ref, mk('A1')));
    await assertSucceeds(setDoc(ref, dailyDoc({ sid: 'A1', date: d, entries: [], blocker: '相談したい', absent: false }, { submittedAt: 1 })));
    // 教員: 欠席にする → 学生は直せない → 教員が取り消す
    const t = doc(as(TEACHER), `teams/A/dailyReports/${dailyId(d, 'A1')}`);
    await assertSucceeds(setDoc(t, dailyDoc({ sid: 'A1', date: d, entries: [], blocker: '', absent: true }, { submittedAt: 1 })));
    await assertFails(setDoc(ref, mk('A1')));
    await assertSucceeds(setDoc(t, dailyDoc({ sid: 'A1', date: d, entries: [], blocker: '', absent: false }, { submittedAt: 1 })));
    await assertSucceeds(setDoc(ref, mk('A1')));
  });
  test('学生: 自分の日報を読むクエリと、設定ONのときのチーム全体のクエリ', async () => {
    const db = as(A1);
    await assertSucceeds(getDocs(query(collection(db, 'teams/A/dailyReports'), where('sid', '==', 'A1'), where('date', '>=', '2026-10-01'))));
    await assertSucceeds(getDocs(query(collection(db, 'teams/A/dailyReports'), where('date', '>=', '2026-10-01'))));
    await env.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), 'config/settings'), { peerDailyView: false }));
    await assertFails(getDocs(query(collection(db, 'teams/A/dailyReports'), where('date', '>=', '2026-10-01'))));
    await assertSucceeds(getDocs(query(collection(db, 'teams/A/dailyReports'), where('sid', '==', 'A1'), where('date', '>=', '2026-10-01'))));
  });
  test('教員: 日付での絞り込みクエリ', async () => {
    await assertSucceeds(getDocs(query(collection(as(TEACHER), 'teams/A/dailyReports'), where('date', '>=', '2026-10-01'))));
  });
});

describe('ミーティング・コメント・教員メモ: アプリの書き込みの形', () => {
  const rec = { date: '2026-10-29', createdBy: 'teacher', decided: 'x', actions: [{ text: 'やる', done: false }], note: '', updatedAt: 1 };
  test('教員: 記録の作成・一部の更新 (前回のアクションのチェック)、コメント、メモ', async () => {
    const db = as(TEACHER);
    await assertSucceeds(setDoc(doc(db, 'teams/A/meetings/2026-10-29'), rec, { merge: true }));
    await assertSucceeds(setDoc(doc(db, 'teams/A/meetings/2026-10-29'), { date: '2026-10-29', actions: [{ text: 'やる', done: true }], updatedAt: 2 }, { merge: true }));
    await assertSucceeds(addDoc(collection(db, 'teams/A/comments'), { body: 'よい', target: { type: 'meeting', id: '2026-10-29' }, createdAt: 1 }));
    await assertSucceeds(addDoc(collection(db, 'teacherNotes'), { teamId: 'A', body: '要フォロー', createdAt: 1 }));
    await assertSucceeds(getDocs(query(collection(db, 'teacherNotes'), where('teamId', '==', 'A'))));
  });
  test('学生: 設定が許可されたチームだけ記録を書ける。教員メモは読めない', async () => {
    const ref = doc(as(A1), 'teams/A/meetings/2026-10-29');
    await assertFails(setDoc(ref, { ...rec, createdBy: 'A1' }, { merge: true }));
    await env.withSecurityRulesDisabled((ctx) => updateDoc(doc(ctx.firestore(), 'teams/A'), { teamMeetingInput: true }));
    await assertSucceeds(setDoc(ref, { ...rec, createdBy: 'A1' }, { merge: true }));
    await assertFails(getDocs(query(collection(as(A1), 'teacherNotes'), where('teamId', '==', 'A'))));
    await assertSucceeds(getDocs(collection(as(A1), 'teams/A/meetings')));
    await assertFails(getDocs(collection(as(A1), 'teams/B/meetings')));
  });
});

describe('名簿の修正: アプリの書き込みの形', () => {
  test('教員: 名前の変更、チームの変更 (名簿とメンバー表のバッチ)、削除、自分の表示名の変更', async () => {
    const db = as(TEACHER);
    await assertSucceeds(updateDoc(doc(db, `roster/${A2}`), { name: '近内改' }));
    await assertSucceeds(updateDoc(doc(db, `roster/${A2}`), { teamId: 'B', sid: 'B2' }));
    await assertSucceeds(setDoc(doc(db, 'teams/B'), { members: [{ sid: 'B1', name: '長田' }, { sid: 'B2', name: '近内改' }] }, { merge: true }));
    await assertSucceeds(deleteDoc(doc(db, `roster/${A2}`)));
    await assertSucceeds(updateDoc(doc(db, `roster/${TEACHER}`), { name: '先生(改)' }));
  });
  test('学生: 自分の名簿を書き換えられない。名簿から外されると、読めなくなる', async () => {
    await assertFails(updateDoc(doc(as(A1), `roster/${A1}`), { name: '偽名' }));
    await assertFails(updateDoc(doc(as(A1), `roster/${A1}`), { teamId: 'B', sid: 'B9' }));
    await assertSucceeds(getDoc(doc(as(A1), 'teams/A')));
    await env.withSecurityRulesDisabled((ctx) => deleteDoc(doc(ctx.firestore(), `roster/${A1}`)));
    await assertFails(getDoc(doc(as(A1), 'teams/A')));
    await assertSucceeds(getDoc(doc(as(A1), `roster/${A1}`))); // 自分の名簿は「ない」と読める (アプリは「名簿に登録されていません」と表示する)
  });
});
