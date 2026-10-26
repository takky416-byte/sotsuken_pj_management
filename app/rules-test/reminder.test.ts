import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { beforeEach, describe, expect, test } from 'vitest';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { parseBackup } from '../src/lib/restore';

// Apps Script のコード (core.js + Code.js) を、Apps Script の API を模した環境で実行し、
// Firestore エミュレータの REST API に対して、実際に読み書きの流れを通す。
// (トリガーと Gmail の実送信、OAuth は、Apps Script の中でしか確認できない)
const app = getApps().find((a) => a.name === 'reminder-it') ?? initializeApp({ projectId: 'demo-sotsuken' }, 'reminder-it');
const db = getFirestore(app);

const JST = 9 * 3600 * 1000;
const today = new Date(Date.now() + JST).toISOString().slice(0, 10);
const yesterday = new Date(Date.now() + JST - 86400000).toISOString().slice(0, 10);

type Mail = { to: string; subject: string; body: string };

// Drive の最小限の模擬 (フォルダ → ファイル名 → 中身)
const driveFolders = new Map<string, Map<string, { content: string; trashed: boolean }>>();
const driveFile = (m: Map<string, { content: string; trashed: boolean }>, name: string) => ({
  getName: () => name, setContent: (c: string) => { m.get(name)!.content = c; }, setTrashed: (t: boolean) => { m.get(name)!.trashed = t; },
});
const iter = <T,>(xs: T[]) => { let i = 0; return { hasNext: () => i < xs.length, next: () => xs[i++] }; };
let driveAccess = 'PRIVATE';
const folderApi = (m: Map<string, { content: string; trashed: boolean }>) => ({
  getSharingAccess: () => driveAccess,
  getFilesByName: (n: string) => iter(m.has(n) && !m.get(n)!.trashed ? [driveFile(m, n)] : []),
  createFile: (n: string, c: string) => { m.set(n, { content: c, trashed: false }); },
  getFiles: () => iter([...m.keys()].filter((n) => !m.get(n)!.trashed).map((n) => driveFile(m, n))),
});
const drive = {
  getFolderById: (id: string) => {
    if (!driveFolders.has(id)) driveFolders.set(id, new Map());
    return folderApi(driveFolders.get(id)!);
  },
};

function loadScript(props: Record<string, string>) {
  const sent: Mail[] = [];
  const logs: string[] = [];
  const store = { ...props };
  const ctx: Record<string, unknown> = {
    module: undefined, // Apps Script には module がない
    Logger: { log: (s: string) => logs.push(String(s)) },
    Session: { getEffectiveUser: () => ({ getEmail: () => 'teacher@trident.ac.jp' }) },
    ScriptApp: { getOAuthToken: () => 'owner' }, // エミュレータでは、'owner' でルールを通さずに読める
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k: string) => store[k] ?? null, setProperty: (k: string, v: string) => { store[k] = v; } }) },
    MailApp: { sendEmail: (m: Mail) => sent.push(m) },
    DriveApp: drive,
    UrlFetchApp: {
      // Apps Script の fetch は同期なので、curl を同期で呼んで模す
      fetch: (url: string, o: { method?: string; contentType?: string; payload?: string; headers?: Record<string, string> } = {}) => {
        const args = ['-s', '-X', (o.method ?? 'get').toUpperCase(), '-w', '\n__CODE__%{http_code}'];
        for (const [k, v] of Object.entries(o.headers ?? {})) args.push('-H', `${k}: ${v}`);
        if (o.contentType) args.push('-H', `Content-Type: ${o.contentType}`);
        if (o.payload) args.push('--data-binary', o.payload);
        const out = execFileSync('curl', [...args, url], { encoding: 'utf8' });
        const i = out.lastIndexOf('\n__CODE__');
        const code = Number(out.slice(i + 9));
        const text = out.slice(0, i);
        return { getResponseCode: () => code, getContentText: () => text };
      },
    },
  };
  vm.createContext(ctx);
  vm.runInContext(readFileSync('../apps-script/core.js', 'utf8'), ctx);
  vm.runInContext(readFileSync('../apps-script/Code.js', 'utf8'), ctx);
  return { ctx, sent, logs, store, call: (fn: string) => vm.runInContext(`${fn}()`, ctx) };
}

const baseProps = { PROJECT_ID: 'demo-sotsuken', FIRESTORE_BASE: 'http://127.0.0.1:8080' };

async function seed(periods = '3-4') {
  for (const p of ['teams', 'roster', 'config']) await db.recursiveDelete(db.collection(p));
  const team = (status: string) => ({ status, members: [], projectName: 'x', proposals: [], driveUrl: '', kickoffAt: 1, teamMeetingInput: false });
  await db.doc('teams/A').set(team('active'));
  await db.doc('teams/B').set(team('planning'));
  const stu = (name: string, teamId: string, sid: string) => ({ name, role: 'student', teamId, sid });
  await db.doc('roster/a1@trident.ac.jp').set(stu('岩田', 'A', 'A1'));
  await db.doc('roster/a2@trident.ac.jp').set(stu('近内', 'A', 'A2'));
  await db.doc('roster/a3@trident.ac.jp').set(stu('森', 'A', 'A3'));
  await db.doc('roster/b1@trident.ac.jp').set(stu('長田', 'B', 'B1')); // キックオフ前のチーム
  await db.doc('roster/teacher@trident.ac.jp').set({ name: '先生', role: 'teacher', teamId: null, sid: null });
  await db.doc('config/settings').set({ peerDailyView: true, dailyStartDate: yesterday });
  await db.doc('config/classDays').set({ days: [{ date: yesterday, periods: '3-4', meeting: false, note: '' }, { date: today, periods, meeting: false, note: '' }] });
  const daily = (sid: string, over = {}) => ({ sid, date: today, dayKey: 0, entries: [{ kind: 'study', note: '調べた' }], blocker: '', absent: false, ...over });
  await db.doc(`teams/A/dailyReports/${today}_A1`).set(daily('A1')); // 提出済み
  await db.doc(`teams/A/dailyReports/${yesterday}_A2`).set({ ...daily('A2'), date: yesterday }); // 昨日の分だけ (今日は未提出)
  await db.doc(`teams/A/dailyReports/${today}_A3`).set(daily('A3', { entries: [], absent: true })); // 欠席
}

describe('作業ログリマインド (Apps Script) × Firestore エミュレータ', () => {
  beforeEach(() => seed());

  test('予行演習: 誰に送るかをログに出すだけで、メールは送らない', async () => {
    const s = loadScript({ ...baseProps, MODE: 'live' });
    s.call('dryRunAfternoon');
    expect(s.sent).toEqual([]);
    expect(s.logs.join('\n')).toContain('対象: 1名');
    expect(s.logs.join('\n')).toContain('近内');
    expect(s.logs.join('\n')).not.toContain('岩田'); // 提出済み
    expect(s.logs.join('\n')).not.toContain('森'); // 欠席
    expect(s.logs.join('\n')).not.toContain('長田'); // キックオフ前のチーム
  });

  test('試験モード: 学生には送らず、先生にだけ、送る予定の内容を送る', async () => {
    const s = loadScript({ ...baseProps }); // MODE 未設定 = 試験モード
    s.call('remindAfternoon');
    expect(s.sent).toHaveLength(1);
    expect(s.sent[0].to).toBe('teacher@trident.ac.jp');
    expect(s.sent[0].subject).toContain('[試験]');
    expect(s.sent[0].body).toContain('近内 <a2@trident.ac.jp>');
  });

  test('本番モード: 未提出の学生にだけ送り、先生に結果を送る。同じ時間帯には、2回送らない', async () => {
    const s = loadScript({ ...baseProps, MODE: 'live' });
    s.call('remindAfternoon');
    expect(s.sent.map((m) => m.to)).toEqual(['a2@trident.ac.jp', 'teacher@trident.ac.jp']);
    expect(s.sent[0].subject).toContain('今日の作業ログをお願いします');
    expect(s.sent[0].body).toContain('近内 さん');
    expect(s.sent[1].subject).toContain('送信しました');
    s.call('remindAfternoon'); // もう一度 (トリガーの再実行など)
    expect(s.sent).toHaveLength(2);
    expect(s.logs.join('\n')).toContain('送信済み');
  });

  test('提出されたあとは、送らない', async () => {
    await db.doc(`teams/A/dailyReports/${today}_A2`).set({ sid: 'A2', date: today, dayKey: 0, entries: [{ kind: 'study', note: '調べた' }], blocker: '', absent: false });
    const s = loadScript({ ...baseProps, MODE: 'live' });
    const r = s.call('remindAfternoon');
    expect(s.sent).toEqual([]); // 先生にも、「0名に送りました」というメールは送らない
    expect(r.recipients).toHaveLength(0);
    expect(s.logs.join('\n')).toContain('未提出の学生はいません');
  });

  test('時間帯が違う・授業日でない・運用開始前は、送らない', async () => {
    const s = loadScript({ ...baseProps, MODE: 'live' });
    s.call('remindMorning'); // 今日は 3-4限の日なので、午前は対象外
    expect(s.sent).toEqual([]);
    expect(s.logs.join('\n')).toContain('この時間帯の対象ではありません');

    const s2 = loadScript({ ...baseProps, MODE: 'live', DATE_OVERRIDE: '2020-01-01' });
    s2.call('remindAfternoon');
    expect(s2.sent).toEqual([]);

    await db.doc('config/settings').set({ dailyStartDate: '2999-01-01' });
    const s3 = loadScript({ ...baseProps, MODE: 'live' });
    s3.call('remindAfternoon');
    expect(s3.sent).toEqual([]);
    expect(s3.logs.join('\n')).toContain('運用開始日');
  });

  test('木曜の午前 (1-2限の日) は、午前のトリガーで送る', async () => {
    await seed('1-2');
    const s = loadScript({ ...baseProps, MODE: 'live' });
    s.call('remindMorning');
    expect(s.sent.map((m) => m.to)).toContain('a2@trident.ac.jp');
    const s2 = loadScript({ ...baseProps, MODE: 'live' });
    s2.call('remindAfternoon');
    expect(s2.sent).toEqual([]);
  });

  test('MODE=off (当面やめる): 何も送らない (先生宛の試験メールも)。予行演習のログは出せる。setup で戻る', async () => {
    const s = loadScript({ ...baseProps, MODE: 'off' });
    const r = s.call('remindAfternoon');
    expect(r.skip).toBe('off');
    expect(s.sent).toEqual([]);
    expect(s.logs.join('\n')).toContain('止めています');
    const d = loadScript({ ...baseProps, MODE: 'off' });
    d.call('dryRunAfternoon');
    expect(d.logs.join('\n')).toContain('対象: 1名');
  });

  test('stopReminder: リマインドのトリガーだけを消し、MODE を off にする', async () => {
    const deleted: string[] = [];
    const triggers = ['remindMorning', 'remindAfternoon', 'backupDaily', 'exportProgressDaily'].map((h) => ({ getHandlerFunction: () => h }));
    const s = loadScript({ ...baseProps, MODE: 'live' });
    Object.assign(s.ctx.ScriptApp as object, { getProjectTriggers: () => triggers, deleteTrigger: (t: { getHandlerFunction: () => string }) => deleted.push(t.getHandlerFunction()) });
    s.call('stopReminder');
    expect(deleted).toEqual(['remindMorning', 'remindAfternoon']);
    expect(s.store.MODE).toBe('off');
  });

  test('Firestore に接続できないときは、エラーにして送らない', async () => {
    const s = loadScript({ ...baseProps, MODE: 'live', FIRESTORE_BASE: 'http://127.0.0.1:1' });
    expect(() => s.call('remindAfternoon')).toThrow();
    expect(s.sent).toEqual([]);
  });
});

describe('予行演習 (DATE_OVERRIDE): 学生には送らず、送信済みの記録を残さない', () => {
  test('本番モードでも、先生にだけ送る。本番の日に、送られなくならない', async () => {
    await seed();
    // 予行演習 (本番モードのまま、今日の日付を DATE_OVERRIDE に指定)
    const rehearsal = loadScript({ ...baseProps, MODE: 'live', DATE_OVERRIDE: today });
    rehearsal.call('remindAfternoon');
    expect(rehearsal.sent).toHaveLength(1);
    expect(rehearsal.sent[0].to).toBe('teacher@trident.ac.jp');
    expect(rehearsal.sent[0].subject).toContain('[試験]');
    expect(rehearsal.store.LAST_SENT).toBeUndefined(); // 送信済みの記録を残さない
    expect(rehearsal.logs.join('\n')).toContain('予行演習です');
    // 何度でも、予行演習できる
    rehearsal.call('remindAfternoon');
    expect(rehearsal.sent).toHaveLength(2);

    // 本番 (DATE_OVERRIDE を消した状態) は、ふつうに学生に送られる
    const live = loadScript({ ...baseProps, MODE: 'live', LAST_SENT: rehearsal.store.LAST_SENT as string });
    live.call('remindAfternoon');
    expect(live.sent.map((m) => m.to)).toContain('a2@trident.ac.jp');
  });
});

describe('試験モードは、送る相手がいなくても先生に送る (仕組みが動いていることの確認)', () => {
  test('0名でも、先生に1通', async () => {
    await seed();
    await db.doc(`teams/A/dailyReports/${today}_A2`).set({ sid: 'A2', date: today, dayKey: 0, entries: [{ kind: 'study', note: 'x' }], blocker: '', absent: false });
    const s = loadScript({ ...baseProps });
    s.call('remindAfternoon');
    expect(s.sent).toHaveLength(1);
    expect(s.sent[0].body).toContain('送る相手はいません');
  });

  describe('毎日のバックアップ (Drive)', () => {
    const FOLDER = '1hTPJorv8aCJbtXjj5hrR2TPgj4GU4ksP'; // 保存先のフォルダ ID
    beforeEach(() => { driveFolders.clear(); driveAccess = 'PRIVATE'; });

    test('全データを、アプリの書き出しと同じ形式の JSON で保存する (復元に使える)', async () => {
      await db.doc('teams/A/tasks/t1').set({ title: '要件定義', deleted: false, assignees: ['A1'], order: 1.5 });
      await db.doc('teacherNotes/n1').set({ teamId: 'A', body: '教員メモ' });
      const s = loadScript({ ...baseProps });
      const r = s.call('backupDaily');
      const file = driveFolders.get(FOLDER)!.get(`sotsuken-backup-${today}.json`)!;
      expect(file).toBeTruthy();
      const b = parseBackup(file.content); // 復元画面と同じ検査を通る
      expect(b.meta.includesTeacherNotes).toBe(true);
      expect(b.collections.roster.map((d) => d.id)).toContain('a1@trident.ac.jp');
      expect(b.collections['teams/A/tasks']).toEqual([{ id: 't1', title: '要件定義', deleted: false, assignees: ['A1'], order: 1.5 }]);
      expect(b.collections.teacherNotes[0]).toMatchObject({ id: 'n1', body: '教員メモ' });
      expect(b.collections['teams/A/dailyReports'].length).toBeGreaterThanOrEqual(3);
      expect(r.docs).toBeGreaterThan(10);
      expect(s.store.LAST_BACKUP).toBe(today);
    });

    test('同じ日に 2 回実行しても、ファイルは 1 つ。古いものは、指定した日数ぶんだけ残す', async () => {
      const m = new Map<string, { content: string; trashed: boolean }>();
      for (const d of ['2026-01-01', '2026-01-02', '2026-01-03']) m.set(`sotsuken-backup-${d}.json`, { content: '{}', trashed: false });
      m.set('メモ.txt', { content: 'x', trashed: false }); // 無関係のファイルには触れない
      driveFolders.set(FOLDER, m);
      const s = loadScript({ ...baseProps, BACKUP_KEEP: '2' });
      s.call('backupDaily');
      s.call('backupDaily');
      const live = [...m.entries()].filter(([, v]) => !v.trashed).map(([k]) => k).sort();
      expect(live).toEqual(['sotsuken-backup-' + today + '.json', 'sotsuken-backup-2026-01-03.json', 'メモ.txt'].sort());
    });

    test('保存先が、リンクやドメインで共有されていたら、保存せずに先生に知らせる', async () => {
      for (const access of ['ANYONE', 'ANYONE_WITH_LINK', 'DOMAIN', 'DOMAIN_WITH_LINK']) {
        driveAccess = access; driveFolders.clear();
        const s = loadScript({ ...baseProps });
        expect(() => s.call('backupDaily')).toThrow('共有されています');
        expect([...(driveFolders.get(FOLDER)?.keys() ?? [])]).toEqual([]);
        expect(s.sent[0].subject).toContain('バックアップに失敗');
      }
      driveAccess = 'DOMAIN';
      const ok = loadScript({ ...baseProps, BACKUP_ALLOW_SHARED: 'true' }); // 明示的に許可したときだけ
      ok.call('backupDaily');
      expect(driveFolders.get(FOLDER)!.size).toBe(1);
    });

    test('失敗したら、先生にメールで知らせる', async () => {
      const s = loadScript({ ...baseProps, PROJECT_ID: 'no-such-project', FIRESTORE_BASE: 'http://127.0.0.1:1' });
      expect(() => s.call('backupDaily')).toThrow();
      expect(s.sent[0].subject).toContain('バックアップに失敗');
      expect(s.sent[0].to).toBe('teacher@trident.ac.jp');
    });
  });
});
