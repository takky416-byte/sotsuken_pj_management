import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { beforeEach, describe, expect, test } from 'vitest';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

// 毎日の進捗報告 (apps-script/Report.js) を、Apps Script の API を模した環境で実行し、Firestore エミュレータから読んで、
// ドライブに保存する流れを通す。(トリガー・Google スプレッドシートの実際の書き出し・OAuth は、Apps Script の中でしか確認できない)
const app = getApps().find((a) => a.name === 'progress-it') ?? initializeApp({ projectId: 'demo-sotsuken' }, 'progress-it');
const db = getFirestore(app);
const JST = 9 * 3600 * 1000;
const today = new Date(Date.now() + JST).toISOString().slice(0, 10);

type Blob = { name: string; kind: string };
type FileRec = { blob: Blob; trashed: boolean };
type Folder = { name: string; files: Map<string, FileRec>; folders: Map<string, Folder>; trashed: boolean };

const mkFolder = (name: string): Folder => ({ name, files: new Map(), folders: new Map(), trashed: false });
const iter = <T,>(xs: T[]) => { let i = 0; return { hasNext: () => i < xs.length, next: () => xs[i++] }; };

function folderApi(f: Folder, all: Map<string, Folder>): unknown {
  return {
    getId: () => f.name, getName: () => f.name, getUrl: () => `https://drive/${f.name}`, setTrashed: (t: boolean) => { f.trashed = t; },
    getFoldersByName: (n: string) => iter([...f.folders.values()].filter((x) => x.name === n && !x.trashed).map((x) => folderApi(x, all))),
    createFolder: (n: string) => { const x = mkFolder(n); f.folders.set(n, x); all.set(n, x); return folderApi(x, all); },
    getFolders: () => iter([...f.folders.values()].filter((x) => !x.trashed).map((x) => folderApi(x, all))),
    getFilesByName: (n: string) => iter(f.files.has(n) && !f.files.get(n)!.trashed ? [{ setTrashed: (t: boolean) => { f.files.get(n)!.trashed = t; } }] : []),
    createFile: (b: Blob) => { f.files.set(b.name, { blob: b, trashed: false }); },
  };
}

// スプレッドシートの模擬: setValues の中身だけを記録し、そのほかの書式の呼び出しは、何もせず自分を返す
function sheetMock() {
  const values = new Map<string, unknown[][]>();
  const chain: unknown = new Proxy({}, { get: (_t, k) => (k === 'setValues' ? undefined : () => chain) });
  const sheet: Record<string, unknown> = {
    name: '', values,
    setName(n: string) { sheet.name = n; return sheet; },
    getRange: (r: number, c: number) => ({
      setValues: (v: unknown[][]) => { values.set(`${r},${c}`, v); return chain; },
      setBackgrounds: () => chain, setBackground: () => chain, setFontWeight: () => chain, setFontColor: () => chain,
      setNumberFormat: () => chain, setFontSize: () => chain, setHorizontalAlignment: () => chain, setVerticalAlignment: () => chain, merge: () => chain,
    }),
    setColumnWidth: () => undefined, setRowHeight: () => undefined, setFrozenRows: () => undefined, setFrozenColumns: () => undefined,
  };
  return sheet;
}

function loadScript(props: Record<string, string>, failExportFor?: string) {
  const sent: { to: string; subject: string; body: string }[] = [];
  const logs: string[] = [];
  const store = { ...props };
  const root = mkFolder('(マイドライブ)');
  const all = new Map<string, Folder>();
  const sheets: Record<string, ReturnType<typeof sheetMock>[]> = {};
  const trashedTemp: string[] = [];
  let seq = 0;
  const ctx: Record<string, unknown> = {
    module: undefined,
    Logger: { log: (s: string) => logs.push(String(s)) },
    Session: { getEffectiveUser: () => ({ getEmail: () => 'teacher@trident.ac.jp' }) },
    ScriptApp: { getOAuthToken: () => 'owner', getProjectTriggers: () => [], deleteTrigger: () => undefined },
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k: string) => store[k] ?? null, setProperty: (k: string, v: string) => { store[k] = v; } }) },
    MailApp: { sendEmail: (m: { to: string; subject: string; body: string }) => sent.push(m) },
    DriveApp: {
      createFolder: (n: string) => { const x = mkFolder(n); root.folders.set(n, x); all.set(n, x); return folderApi(x, all); },
      getFolderById: (id: string) => folderApi(all.get(id)!, all),
      getFileById: (id: string) => ({ setTrashed: () => trashedTemp.push(id) }),
    },
    SpreadsheetApp: {
      BorderStyle: { SOLID_MEDIUM: 'm' },
      flush: () => undefined,
      create: (name: string) => {
        const id = `ss${++seq}-${name}`;
        const made = [sheetMock()];
        sheets[id] = made;
        return {
          getId: () => id,
          getSheets: () => made,
          insertSheet: (n: string) => { const s = sheetMock(); s.name = n; made.push(s); return s; },
        };
      },
    },
    UrlFetchApp: {
      fetch: (url: string, o: { method?: string; contentType?: string; payload?: string; headers?: Record<string, string> } = {}) => {
        if (url.startsWith('https://docs.google.com/spreadsheets/')) {
          const id = decodeURIComponent(url.split('/d/')[1].split('/')[0]);
          const fmt = /format=(\w+)/.exec(url)![1];
          const code = failExportFor && id.includes(failExportFor) ? 500 : 200;
          const blob = { name: '', kind: fmt, copyBlob() { return { ...blob, setName(n: string) { return { name: n, kind: fmt }; } }; } };
          return { getResponseCode: () => code, getContentText: () => '', getBlob: () => blob };
        }
        const args = ['-s', '-X', (o.method ?? 'get').toUpperCase(), '-w', '\n__CODE__%{http_code}'];
        for (const [k, v] of Object.entries(o.headers ?? {})) args.push('-H', `${k}: ${v}`);
        if (o.contentType) args.push('-H', `Content-Type: ${o.contentType}`);
        if (o.payload) args.push('--data-binary', o.payload);
        const out = execFileSync('curl', [...args, url], { encoding: 'utf8' });
        const i = out.lastIndexOf('\n__CODE__');
        const text = out.slice(0, i);
        return { getResponseCode: () => Number(out.slice(i + 9)), getContentText: () => text };
      },
    },
  };
  vm.createContext(ctx);
  for (const f of ['core.js', 'Code.js', 'report-core.js', 'Report.js']) vm.runInContext(readFileSync(`../apps-script/${f}`, 'utf8'), ctx);
  return { ctx, sent, logs, store, root, sheets, trashedTemp, call: (fn: string) => vm.runInContext(`${fn}()`, ctx) };
}

const baseProps = { PROJECT_ID: 'demo-sotsuken', FIRESTORE_BASE: 'http://127.0.0.1:8080' };

async function seed() {
  for (const p of ['teams', 'milestones']) await db.recursiveDelete(db.collection(p));
  const team = (status: string, members: object[]) => ({ status, members, projectName: `企画${status}`, proposals: [], driveUrl: '', kickoffAt: Date.parse('2026-10-28T00:00:00Z'), teamMeetingInput: false });
  await db.doc('teams/A').set({ ...team('active', [{ sid: 'A1', name: '岩田' }, { sid: 'A2', name: '近内' }]), reportNotes: { summary: 'Aチームの概要です。', issues: '課題はありません。', by: 'A1', at: Date.parse('2026-11-01T00:00:00Z'), summaryAt: Date.parse('2026-11-01T00:00:00Z') } });
  await db.doc('teams/B').set(team('planning', [{ sid: 'B1', name: '長田' }]));
  await db.doc('teams/C').set(team('active', [{ sid: 'C1', name: '浅野' }]));
  const t = (id: string, over: object) => ({ parentId: null, depth: 1, title: id, detail: '', order: 1024, assignees: [], startDate: null, endDate: null, status: 'todo', links: [], source: 'user', createdBy: 'x', updatedBy: 'x', createdAt: 1, updatedAt: 1, deleted: false, deletedAt: null, ...over });
  await db.doc('teams/A/tasks/p1').set(t('p1', { title: '要件定義' }));
  await db.doc('teams/A/tasks/c1').set(t('c1', { parentId: 'p1', depth: 2, title: '機能一覧を作る', assignees: ['A1'], startDate: '2026-11-02', endDate: '2026-11-06', status: 'done', updatedAt: Date.now() }));
  await db.doc('teams/A/tasks/c2').set(t('c2', { parentId: 'p1', depth: 2, title: '画面を決める', assignees: ['A2'], startDate: '2026-11-07', endDate: '2026-11-20', order: 2048 }));
  await db.doc('teams/C/tasks/p1').set(t('p1', { title: '企画の具体化' }));
}

describe('毎日の進捗報告 (Apps Script) × Firestore エミュレータ', () => {
  beforeEach(() => seed());

  test('キックオフ済みのチームだけ、日付と「最新」のフォルダに、xlsx と pdf を保存する。作業用のシートは、ごみ箱へ', async () => {
    const s = loadScript(baseProps);
    const r = s.call('exportProgressDaily');
    expect(r.teams).toBe(2);
    const folder = [...s.root.folders.values()].find((f) => f.name === '卒研PJ 進捗報告(日次)')!;
    expect(folder).toBeTruthy();
    const day = folder.folders.get(today)!;
    const latest = folder.folders.get('最新')!;
    expect([...day.files.keys()].sort()).toEqual([
      `Aチーム_進捗報告_${today}.pdf`, `Aチーム_進捗報告_${today}.xlsx`, `Cチーム_進捗報告_${today}.pdf`, `Cチーム_進捗報告_${today}.xlsx`,
    ]);
    expect([...latest.files.keys()].sort()).toEqual(['Aチーム_進捗報告(最新).pdf', 'Aチーム_進捗報告(最新).xlsx', 'Cチーム_進捗報告(最新).pdf', 'Cチーム_進捗報告(最新).xlsx']);
    expect(day.files.get(`Aチーム_進捗報告_${today}.pdf`)!.blob.kind).toBe('pdf');
    expect(s.trashedTemp).toHaveLength(2); // 作業用のスプレッドシート (チームごと)
    expect(s.store.LAST_PROGRESS).toBe(today);
    expect([...s.root.folders.keys()].join()).not.toContain('B'); // キックオフ前のBチームは出さない
  });

  test('報告書シートの中身: 概要・記入日・進捗・工程・タスク。WBS・ガントチャートも作る', async () => {
    const s = loadScript(baseProps);
    s.call('exportProgressDaily');
    const a = Object.entries(s.sheets).find(([id]) => id.includes(`進捗報告 A ${today}`))![1];
    expect(a.map((x) => x.name)).toEqual(['報告書', 'WBS', 'ガントチャート']);
    const rep = (a[0].values as Map<string, unknown[][]>).get('1,1')!.map((r) => r.join('|')).join('\n');
    expect(rep).toContain('卒業研究制作 プロジェクト進捗報告書');
    expect(rep).toContain('Aチーム|');
    expect(rep).toContain('岩田・近内');
    expect(rep).toContain('Aチームの概要です。');
    expect(rep).toContain('記入日: 2026/11/01');
    expect(rep).toContain('要件定義');
    expect(rep).toContain('課題はありません。');
    const wbs = (a[1].values as Map<string, unknown[][]>).get('1,1')!;
    expect(wbs[0]).toEqual(['番号', 'タスク', '担当', '状態', '開始', '終了', '進捗']);
    expect(wbs.map((r) => String(r[1]).trim())).toEqual(['タスク', '要件定義', '機能一覧を作る', '画面を決める']);
    expect(wbs[2][2]).toBe('岩田');
    const gantt = (a[2].values as Map<string, unknown[][]>).get('1,1')!;
    expect(gantt[0].slice(0, 3)).toEqual(['番号', 'タスク', '担当']);
    expect(gantt.length).toBeGreaterThan(5);
  });

  test('担当者名を載せない設定', async () => {
    const s = loadScript({ ...baseProps, PROGRESS_SHOW_ASSIGNEES: 'false' });
    s.call('exportProgressDaily');
    const a = Object.entries(s.sheets).find(([id]) => id.includes(`進捗報告 A ${today}`))![1];
    const wbs = (a[1].values as Map<string, unknown[][]>).get('1,1')!;
    expect(wbs[0]).toEqual(['番号', 'タスク', '状態', '開始', '終了', '進捗']);
  });

  test('同じ日にもう一度実行しても、ファイルは増えない (置き換える)。古い日付のフォルダは、残す日数を超えたらごみ箱へ', async () => {
    const s = loadScript({ ...baseProps, PROGRESS_KEEP: '2' });
    s.call('exportProgressDaily');
    const folder = [...s.root.folders.values()][0];
    for (const d of ['2026-01-01', '2026-01-02', '2026-01-03']) { const f = mkFolder(d); folder.folders.set(d, f); }
    s.call('exportProgressDaily');
    const day = folder.folders.get(today)!;
    expect([...day.files.values()].filter((f) => !f.trashed)).toHaveLength(4);
    // 日付のフォルダは、新しい順に2つだけ残る (今日と 2026-01-03)
    const alive = [...folder.folders.values()].filter((f) => /^\d{4}-/.test(f.name) && !f.trashed).map((f) => f.name).sort();
    expect(alive).toEqual(['2026-01-03', today].sort());
    expect(folder.folders.get('最新')!.trashed).toBe(false);
  });

  test('1チームの書き出しに失敗しても、ほかのチームは保存し、先生にメールで知らせる (失敗は例外にもなる)', async () => {
    const s = loadScript(baseProps, '進捗報告 A ');
    expect(() => s.call('exportProgressDaily')).toThrow();
    const folder = [...s.root.folders.values()][0];
    expect([...folder.folders.get(today)!.files.keys()].some((n) => n.startsWith('Cチーム'))).toBe(true);
    expect([...folder.folders.get(today)!.files.keys()].some((n) => n.startsWith('Aチーム'))).toBe(false);
    expect(s.sent).toHaveLength(1);
    expect(s.sent[0].to).toBe('teacher@trident.ac.jp');
    expect(s.sent[0].subject).toContain('進捗報告の保存に失敗');
    expect(s.trashedTemp).toHaveLength(2); // 失敗しても、作業用のシートは消す
  });

  test('キックオフ済みのチームがないときは、何も作らない', async () => {
    await db.doc('teams/A').update({ status: 'planning' });
    await db.doc('teams/C').update({ status: 'planning' });
    const s = loadScript(baseProps);
    const r = s.call('exportProgressDaily');
    expect(r.teams).toBe(0);
    expect(s.root.folders.size).toBe(0);
  });

  test('保存先のフォルダは、プロパティで指定できる。自動で作ったフォルダの ID は覚えて、使い回す', async () => {
    const s = loadScript(baseProps);
    s.call('exportProgressDaily');
    expect(s.store.PROGRESS_FOLDER_ID_AUTO).toBe('卒研PJ 進捗報告(日次)');
    s.call('exportProgressDaily');
    expect(s.root.folders.size).toBe(1); // 2回目は、フォルダを作り直さない
  });
});
