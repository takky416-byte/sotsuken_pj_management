import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'node:fs';
import { addDays, today } from '../e2e/dates';
import { buildDigest } from '../src/lib/digest';
import type { Task } from '../src/types';

/** 操作マニュアル・デモ動画用の、架空のデータ (実在の学生・企画ではありません)。日付は、実行した日を基準にする。 */
export default async function seed() {
  if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error('Firestore エミュレータの中で実行してください (npm run manual)');
  const app = getApps()[0] ?? initializeApp({ projectId: 'demo-sotsuken' });
  const db = getFirestore(app);
  const t = today();

  const members = [
    { sid: 'A1', name: '氷室', email: 'a1@trident.ac.jp' },
    { sid: 'A2', name: '瀬戸口', email: 'a2@trident.ac.jp' },
    { sid: 'A3', name: '御子柴', email: 'a3@trident.ac.jp' },
    { sid: 'A4', name: '月島', email: 'a4@trident.ac.jp' },
  ];
  await db.doc('roster/teacher@trident.ac.jp').set({ name: '先生', role: 'teacher', teamId: null, sid: null });
  for (const m of members) await db.doc(`roster/${m.email}`).set({ name: m.name, role: 'student', teamId: 'A', sid: m.sid });

  await db.doc('teams/A').set({
    members: members.map(({ sid, name }) => ({ sid, name })), status: 'active', projectName: '学内イベント案内アプリ', proposals: [],
    driveUrl: 'https://drive.google.com/drive/folders/sample-shared', kickoffAt: Date.now() - 20 * 86400000, teamMeetingInput: false,
    message: { text: '来週は中間確認をします。WBSの期間を入れておいてください。', at: Date.now() - 3600000 },
    submitUrl: 'https://drive.google.com/drive/folders/sample-submit',
    // 初期WBSの見直しは済んでいる (見直しの画面は、撮影のときだけ、この記録を外す)
    wbsReview: { at: Date.now() - 15 * 86400000, by: 'A1' },
    reportNotes: {
      summary: 'Aチーム(4名)は、卒業研究制作として「学内イベント案内アプリ」に取り組みます。学内のイベントを、一覧・検索で見つけやすくすることを目指します。',
      issues: 'データの設計がやや遅れています。担当を増やして、来週中に取り戻します。今後は、イベント一覧と検索の実装を進めます。',
      by: 'A1', at: Date.now() - 86400000, summaryAt: Date.now() - 5 * 86400000, issuesAt: Date.now() - 86400000,
    },
  });

  await db.doc('config/settings').set({ peerDailyView: true, rotateOrder: true, dailyStartDate: addDays(t, -14) });
  await db.doc('config/classDays').set({
    days: [-14, -7, 0, 7, 14].map((n) => ({ date: addDays(t, n), periods: '3-4', meeting: n === 0, note: '' })),
  });
  await db.doc('milestones/m1').set({ title: '中間報告', date: addDays(t, 10), endDate: null, teamId: null, note: '' });
  await db.doc('milestones/m2').set({ title: '最終発表', date: addDays(t, 38), endDate: null, teamId: null, note: '' });

  // WBS (大項目5 + 子タスク)
  const base = { detail: '', links: [], source: 'user' as 'user' | 'draft', createdBy: 'teacher', updatedBy: 'teacher', createdAt: 1, updatedAt: 1, deleted: false, deletedAt: null };
  type T = { id: string; title: string; draft?: boolean; parent?: string; s?: 'todo' | 'doing' | 'done'; a?: string[]; from?: number; to?: number };
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
    { id: 't3c', title: '検索機能を作る', draft: true, parent: 't3', s: 'todo', a: [], from: 10, to: 24 },
    { id: 't4', title: '動作確認・改善', from: 20, to: 32 },
    { id: 't4a', title: '操作テストをする', draft: true, parent: 't4', s: 'todo', a: ['A2'], from: 20, to: 32 },
    { id: 't5', title: '発表準備', from: 28, to: 38 },
    { id: 't5a', title: 'スライドを作る', draft: true, parent: 't5', s: 'todo', a: ['A4'], from: 28, to: 38 },
  ];
  let order = 0;
  for (const k of tasks) {
    order += 1000;
    await db.doc(`teams/A/tasks/${k.id}`).set({
      ...base, source: k.draft ? 'draft' : 'user', title: k.title, parentId: k.parent ?? null, depth: k.parent ? 2 : 1, order, status: k.s ?? 'doing',
      assignees: k.a ?? [], startDate: k.from === undefined ? null : addDays(t, k.from), endDate: k.to === undefined ? null : addDays(t, k.to),
    });
  }

  // 前回の授業日の作業ログ (瀬戸口・御子柴・月島)。氷室の今日の分は、操作の中で書く
  const prev = addDays(t, -7);
  const log = (sid: string, taskId: string, note: string, result: string, next: string) => db.doc(`teams/A/dailyReports/${prev}_${sid}`).set({
    sid, date: prev, dayKey: Number(prev.replaceAll('-', '')), entries: [{ kind: 'task', taskId, note, result }], blocker: '', next, absent: false, submittedAt: 1, updatedAt: 1,
  });
  await log('A2', 't2b', 'データの項目を洗い出して、表にまとめた', 'progress', 'データの関係を図にする');
  await log('A3', 't2a', '画面の流れ図を完成させた', 'done', 'イベント一覧の実装を始める');
  await log('A4', 't3b', 'APIの使い方を調べて、サンプルを動かした', 'progress', 'イベント一覧の表示を作る');
  await log('A1', 't2a', '画面のワイヤーフレームを5枚描いた', 'done', 'トップ画面の実装を始める');

  // 先生が公開した、前回のミーティングの議事録
  await db.doc(`teams/A/meetingMinutes/${prev}`).set({
    date: prev, publishedAt: Date.now() - 6 * 86400000,
    text: '【決まったこと】\n・データの設計を、来週の授業までに終える(瀬戸口)\n・イベント一覧の実装を、2人で進める(御子柴・月島)\n【確認したこと】\n・中間報告に向けて、WBSの期間を入れておく',
  });

  await seedTeacherData(db, t, base, tasks.map((k, n) => ({ ...base, id: k.id, source: k.draft ? 'draft' : 'user', title: k.title, parentId: k.parent ?? null, depth: k.parent ? 2 : 1, order: (n + 1) * 1000, status: k.s ?? 'doing', assignees: k.a ?? [], startDate: k.from === undefined ? null : addDays(t, k.from), endDate: k.to === undefined ? null : addDays(t, k.to) }) as Task));
}


/** 教員編のマニュアル・動画用: ほかのチーム・アクセス履歴・変更履歴・集計メモ・叩き台 (すべて架空) */
async function seedTeacherData(db: FirebaseFirestore.Firestore, t: string, base: Record<string, unknown>, aTasks: Task[]) {
  const classBefore = [addDays(t, -14), addDays(t, -7)];
  const mk = (sid: string, name: string, email: string, teamId: string) => ({ sid, name, email, teamId });
  const teams = {
    B: { name: '会話練習アプリ', members: [mk('B1', '倉田', 'b1@trident.ac.jp', 'B'), mk('B2', '柏木', 'b2@trident.ac.jp', 'B'), mk('B3', '久我', 'b3@trident.ac.jp', 'B')] },
    C: { name: '部活動の備品管理', members: [mk('C1', '桐生', 'c1@trident.ac.jp', 'C'), mk('C2', '神楽', 'c2@trident.ac.jp', 'C'), mk('C3', '黒川', 'c3@trident.ac.jp', 'C')] },
    D: { name: '', members: [mk('D1', '坂本', 'd1@trident.ac.jp', 'D'), mk('D2', '白石', 'd2@trident.ac.jp', 'D'), mk('D3', '須藤', 'd3@trident.ac.jp', 'D')] },
    E: { name: '', members: [mk('E1', '園田', 'e1@trident.ac.jp', 'E'), mk('E2', '高梨', 'e2@trident.ac.jp', 'E'), mk('E3', '千葉', 'e3@trident.ac.jp', 'E')] },
  };
  for (const [id, tm] of Object.entries(teams)) {
    const active = id === 'B' || id === 'C';
    for (const m of tm.members) await db.doc(`roster/${m.email}`).set({ name: m.name, role: 'student', teamId: id, sid: m.sid });
    await db.doc(`teams/${id}`).set({
      members: tm.members.map(({ sid, name }) => ({ sid, name })), status: active ? 'active' : 'planning', projectName: tm.name, proposals: [],
      driveUrl: '', kickoffAt: active ? Date.now() - 20 * 86400000 : null, teamMeetingInput: false,
      ...(active ? { wbsReview: { at: Date.now() - 15 * 86400000, by: `${id}1` }, ...(id === 'B' ? { submitUrl: 'https://drive.google.com/drive/folders/sample-b' } : {}) } : {}),
    });
  }
  // B・C のタスク (B は担当なしの期限超過が1件。C は順調)
  const mkTasks = (team: string, rows: [string, string | null, string, string[], number, number][]) => {
    let order = 0;
    return rows.map(([id, parent, title, status, assignees, from, to]: never) => {
      order += 1000;
      return { ...base, id, title, parentId: parent, depth: parent ? 2 : 1, order, status, assignees, startDate: addDays(t, from), endDate: addDays(t, to), source: 'user' } as unknown as Task;
    }).map((x) => ({ ...x, team }));
  };
  const bRows = [
    ['b1', null, '企画・要件定義', 'doing', [], -28, -6], ['b1a', 'b1', '想定ユーザーを決める', 'done', ['B1'], -28, -20], ['b1b', 'b1', '機能を絞る', 'done', ['B2'], -20, -12],
    ['b1c', 'b1', '競合を調べる', 'todo', [], -14, -6], ['b2', null, '設計', 'doing', [], -10, 6], ['b2a', 'b2', '画面の設計', 'doing', ['B1', 'B3'], -10, 4], ['b2b', 'b2', 'データの設計', 'todo', ['B2'], -4, 6],
  ] as never;
  const cRows = [
    ['c1', null, '企画・要件定義', 'done', [], -28, -12], ['c1a', 'c1', '備品の種類を洗い出す', 'done', ['C1'], -28, -18], ['c1b', 'c1', '管理の流れを決める', 'done', ['C2'], -20, -12],
    ['c2', null, '設計', 'doing', [], -12, 8], ['c2a', 'c2', '画面の設計', 'doing', ['C1', 'C3'], -12, 4], ['c2b', 'c2', 'データの設計', 'doing', ['C2'], -6, 8],
  ] as never;
  for (const [team, rows] of [['B', bRows], ['C', cRows]] as const) {
    const ts = mkTasks(team, rows);
    for (const k of ts) { const { id, team: _t, ...rest } = k as Task & { team: string }; await db.doc(`teams/${team}/tasks/${id}`).set(rest); }
    await db.doc(`teams/${team}/digest/tasks`).set(buildDigest(ts));
  }
  await db.doc('teams/A/digest/tasks').set(buildDigest(aTasks));
  // 作業ログ: B は 柏木 が2回続けて未提出 (要確認)、C は全員提出
  const sub = (team: string, sid: string, date: string, taskId: string, note: string) => db.doc(`teams/${team}/dailyReports/${date}_${sid}`).set({
    sid, date, dayKey: Number(date.replaceAll('-', '')), entries: [{ kind: 'task', taskId, note, result: 'progress' }], blocker: '', next: '次の作業を進める', absent: false, submittedAt: 1, updatedAt: 1,
  });
  for (const d of classBefore) {
    await sub('B', 'B1', d, 'b2a', '画面の下書きを作った'); await sub('B', 'B3', d, 'b2a', 'ワイヤーフレームを描いた');
    for (const m of teams.C.members) await sub('C', m.sid, d, 'c2a', '画面の設計を進めた');
  }
  // アクセス履歴
  for (let n = 1; n <= 12; n++) {
    const date = addDays(t, -n);
    const all = [...['A1', 'A2', 'A3', 'A4'].map((s) => ['A', s]), ...teams.B.members.map((m) => ['B', m.sid]), ...teams.C.members.map((m) => ['C', m.sid])];
    for (const [team, sid] of all) {
      if (sid === 'B2' && n < 11) continue; // 柏木 は、しばらく来ていない
      if ((n + sid.charCodeAt(1)) % 3 === 0) continue;
      await db.doc(`accessLogs/${date}_${sid}`).set({ sid, teamId: team, date, firstAt: Date.parse(`${date}T05:10:00Z`), lastAt: Date.parse(`${date}T07:40:00Z`), visits: 1 + (n % 3), views: 8 + ((n * 7) % 25), screens: { home: 4, wbs: 6, daily: 3 + (n % 4), gantt: 2, report: 1 } });
    }
  }
  // 変更履歴 (WBSを変えた記録)
  let at = Date.now() - 12 * 86400000;
  for (const [by, tid, title] of [['A1', 't1a', '要件を整理する'], ['A2', 't1b', '類似アプリを調べる'], ['A3', 't2a', '画面の設計'], ['A1', 't2a', '画面の設計'], ['A4', 't3b', 'イベント一覧を作る'], ['A2', 't2b', 'データの設計'], ['A1', 't3a', 'トップ画面を作る']] as const) {
    at += 86400000;
    await db.collection('teams/A/taskLogs').add({ taskId: tid, title, by, at, kind: 'update', changes: [{ field: 'status', from: 'todo', to: tid === 't1a' || tid === 't1b' ? 'done' : 'doing' }] });
  }
  // キックオフ前のチーム (D・E) の叩き台 (見本。実在の企画ではありません)
  const sample = readFileSync('../docs/wbs-drafts/example-soft.md', 'utf8');
  const draft = (name: string) => `企画名: ${name}\n種別: ソフト\n${sample}`;
  for (const [id, a, b] of [['D', '図書館の本さがしアプリ(仮)', '研究室の備品予約(仮)'], ['E', '駅構内の案内アプリ(仮)', '学内イベントのカレンダー(仮)']] as const) {
    await db.doc(`teams/${id}/kickoffDrafts/1`).set({ no: 1, title: a, outline: draft(a), updatedAt: Date.now() });
    await db.doc(`teams/${id}/kickoffDrafts/2`).set({ no: 2, title: b, outline: draft(b), updatedAt: Date.now() });
  }
  await db.doc('teams/A/meetings/' + addDays(t, -7)).set({ date: addDays(t, -7), decided: 'データの設計を、来週までに終える', actions: [{ text: 'データの設計を終える', owner: 'A2', done: false }, { text: 'イベント一覧の実装を進める', owner: 'A3', done: true }], note: '', createdBy: 'teacher', updatedAt: Date.now() - 6 * 86400000 });
}
