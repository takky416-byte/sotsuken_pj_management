import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { addDays, today } from '../e2e/dates';

/** 操作マニュアル・デモ動画用の、架空のデータ (実在の学生・企画ではありません)。日付は、実行した日を基準にする。 */
export default async function seed() {
  if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error('Firestore エミュレータの中で実行してください (npm run manual)');
  const app = getApps()[0] ?? initializeApp({ projectId: 'demo-sotsuken' });
  const db = getFirestore(app);
  const t = today();

  const members = [
    { sid: 'A1', name: '岩田', email: 'a1@trident.ac.jp' },
    { sid: 'A2', name: '近内', email: 'a2@trident.ac.jp' },
    { sid: 'A3', name: '小林', email: 'a3@trident.ac.jp' },
    { sid: 'A4', name: '佐藤', email: 'a4@trident.ac.jp' },
  ];
  await db.doc('roster/teacher@trident.ac.jp').set({ name: '先生', role: 'teacher', teamId: null, sid: null });
  for (const m of members) await db.doc(`roster/${m.email}`).set({ name: m.name, role: 'student', teamId: 'A', sid: m.sid });

  await db.doc('teams/A').set({
    members: members.map(({ sid, name }) => ({ sid, name })), status: 'active', projectName: '学内イベント案内アプリ', proposals: [],
    driveUrl: 'https://drive.google.com/drive/folders/sample-shared', kickoffAt: Date.now() - 20 * 86400000, teamMeetingInput: false,
    message: { text: '来週は中間確認をします。WBSの期間を入れておいてください。', at: Date.now() - 3600000 },
    submitUrl: 'https://drive.google.com/drive/folders/sample-submit',
  });

  await db.doc('config/settings').set({ peerDailyView: true, rotateOrder: true, dailyStartDate: addDays(t, -14) });
  await db.doc('config/classDays').set({
    days: [-14, -7, 0, 7, 14].map((n) => ({ date: addDays(t, n), periods: '3-4', meeting: n === 0, note: '' })),
  });
  await db.doc('milestones/m1').set({ title: '中間報告', date: addDays(t, 10), endDate: null, teamId: null, note: '' });
  await db.doc('milestones/m2').set({ title: '最終発表', date: addDays(t, 38), endDate: null, teamId: null, note: '' });

  // WBS (大項目5 + 子タスク)
  const base = { detail: '', links: [], source: 'user', createdBy: 'teacher', updatedBy: 'teacher', createdAt: 1, updatedAt: 1, deleted: false, deletedAt: null };
  type T = { id: string; title: string; parent?: string; s?: 'todo' | 'doing' | 'done'; a?: string[]; from?: number; to?: number };
  const tasks: T[] = [
    { id: 't1', title: '企画・要件定義', from: -28, to: -12 },
    { id: 't1a', title: '要件を整理する', parent: 't1', s: 'done', a: ['A1'], from: -28, to: -21 },
    { id: 't1b', title: '類似アプリを調べる', parent: 't1', s: 'done', a: ['A2'], from: -24, to: -12 },
    { id: 't2', title: '設計', from: -14, to: 2 },
    { id: 't2a', title: '画面の設計', parent: 't2', s: 'done', a: ['A1', 'A3'], from: -14, to: -4 },
    { id: 't2b', title: 'データの設計', parent: 't2', s: 'doing', a: ['A2'], from: -8, to: 2 },
    { id: 't3', title: '実装', from: -4, to: 24 },
    { id: 't3a', title: 'トップ画面を作る', parent: 't3', s: 'doing', a: ['A1'], from: -4, to: 8 },
    { id: 't3b', title: 'イベント一覧を作る', parent: 't3', s: 'doing', a: ['A3', 'A4'], from: 0, to: 14 },
    { id: 't3c', title: '検索機能を作る', parent: 't3', s: 'todo', a: [], from: 10, to: 24 },
    { id: 't4', title: 'テスト・検証', from: 20, to: 32 },
    { id: 't4a', title: '操作テストをする', parent: 't4', s: 'todo', a: ['A2'], from: 20, to: 32 },
    { id: 't5', title: '発表準備', from: 28, to: 38 },
    { id: 't5a', title: 'スライドを作る', parent: 't5', s: 'todo', a: ['A4'], from: 28, to: 38 },
  ];
  let order = 0;
  for (const k of tasks) {
    order += 1000;
    await db.doc(`teams/A/tasks/${k.id}`).set({
      ...base, title: k.title, parentId: k.parent ?? null, depth: k.parent ? 2 : 1, order, status: k.s ?? 'doing',
      assignees: k.a ?? [], startDate: k.from === undefined ? null : addDays(t, k.from), endDate: k.to === undefined ? null : addDays(t, k.to),
    });
  }

  // 前回の授業日の作業ログ (近内・小林・佐藤)。岩田の今日の分は、操作の中で書く
  const prev = addDays(t, -7);
  const log = (sid: string, taskId: string, note: string, result: string, next: string) => db.doc(`teams/A/dailyReports/${prev}_${sid}`).set({
    sid, date: prev, dayKey: Number(prev.replaceAll('-', '')), entries: [{ kind: 'task', taskId, note, result }], blocker: '', next, absent: false, submittedAt: 1, updatedAt: 1,
  });
  await log('A2', 't2b', 'データの項目を洗い出して、表にまとめた', 'progress', 'データの関係を図にする');
  await log('A3', 't2a', '画面の流れ図を完成させた', 'done', 'イベント一覧の実装を始める');
  await log('A4', 't3b', 'APIの使い方を調べて、サンプルを動かした', 'progress', 'イベント一覧の表示を作る');
  await log('A1', 't2a', '画面のワイヤーフレームを5枚描いた', 'done', 'トップ画面の実装を始める');
}
