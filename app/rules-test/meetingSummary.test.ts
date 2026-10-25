import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { beforeEach, describe, expect, test } from 'vitest';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

// 録音 → 要旨の下書き (apps-script/Code.js の summarizeRecordings) を、Apps Script の API を模した環境で実行し、
// Firestore エミュレータに書き込むところまで通す。Gemini の呼び出しは、決まった返事を返す模擬。
// (本物の Gemini・ドライブ・トリガー・メールは、Apps Script の中でしか確認できない)
const app = getApps().find((a) => a.name === 'summary-it') ?? initializeApp({ projectId: 'demo-sotsuken' }, 'summary-it');
const db = getFirestore(app);

type FakeFile = { name: string; mime: string; size: number; description: string; created: number; folder: string };
let files: FakeFile[] = [];
let access = 'PRIVATE';
type Mail = { to: string; subject: string; body: string };

const GEMINI_OK = { candidates: [{ content: { parts: [{ text: JSON.stringify({ summary: '設計を進める方針を確認した。', decided: ['画面を先に作る'], actions: ['氷室: ワイヤーフレームを描く'], concerns: [], unclear: ['最後の数秒が聞き取れない'] }) }] } }] };
let geminiReply: unknown = GEMINI_OK;
let geminiCalls: { url: string; body: string; key: string | undefined }[] = [];

const iter = <T,>(xs: T[]) => { let i = 0; return { hasNext: () => i < xs.length, next: () => xs[i++] }; };

function load(props: Record<string, string>) {
  const sent: Mail[] = [];
  const logs: string[] = [];
  const store = { ...props };
  const fileApi = (f: FakeFile) => ({
    getName: () => f.name, getMimeType: () => f.mime, getSize: () => f.size, getDescription: () => f.description, setDescription: (d: string) => { f.description = d; },
    getDateCreated: () => new Date(f.created), getBlob: () => ({ getBytes: () => [1, 2, 3] }),
  });
  const processed = { addFile: (file: { getName: () => string }) => { files.find((x) => x.name === file.getName())!.folder = '処理済み'; } };
  const folder = {
    getSharingAccess: () => access,
    getFiles: () => iter(files.filter((f) => f.folder === 'root').map(fileApi)),
    removeFile: () => undefined,
    getFoldersByName: () => iter([]),
    createFolder: () => processed,
  };
  const ctx: Record<string, unknown> = {
    module: undefined,
    Logger: { log: (s: string) => logs.push(String(s)) },
    Utilities: { base64Encode: () => 'AAAA' },
    Session: { getEffectiveUser: () => ({ getEmail: () => 'teacher@trident.ac.jp' }) },
    ScriptApp: { getOAuthToken: () => 'owner' },
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k: string) => store[k] ?? null, setProperty: (k: string, v: string) => { store[k] = v; } }) },
    MailApp: { sendEmail: (m: Mail) => sent.push(m) },
    DriveApp: { getFolderById: () => folder },
    UrlFetchApp: {
      fetch: (url: string, o: { method?: string; contentType?: string; payload?: string; headers?: Record<string, string> } = {}) => {
        if (url.startsWith('http://gemini.test')) {
          geminiCalls.push({ url, body: String(o.payload), key: o.headers?.['x-goog-api-key'] });
          return { getResponseCode: () => 200, getContentText: () => JSON.stringify(geminiReply) };
        }
        const args = ['-s', '-X', (o.method ?? 'get').toUpperCase(), '-w', '\n__CODE__%{http_code}'];
        for (const [k, v] of Object.entries(o.headers ?? {})) args.push('-H', `${k}: ${v}`);
        if (o.contentType) args.push('-H', `Content-Type: ${o.contentType}`);
        if (o.payload) args.push('--data-binary', o.payload);
        const out = execFileSync('curl', [...args, url], { encoding: 'utf8' });
        const i = out.lastIndexOf('\n__CODE__');
        return { getResponseCode: () => Number(out.slice(i + 9)), getContentText: () => out.slice(0, i) };
      },
    },
  };
  vm.createContext(ctx);
  for (const f of ['core.js', 'summary.js', 'Code.js']) vm.runInContext(readFileSync(`../apps-script/${f}`, 'utf8'), ctx);
  return { sent, logs, run: () => vm.runInContext('summarizeRecordings()', ctx) };
}

const props = { PROJECT_ID: 'demo-sotsuken', FIRESTORE_BASE: 'http://127.0.0.1:8080', MEETING_AUDIO_FOLDER_ID: 'f1', GEMINI_API_KEY: 'k', GEMINI_BASE: 'http://gemini.test' };
const rec = (name: string, over: Partial<FakeFile> = {}): FakeFile => ({ name, mime: 'audio/mp4', size: 1000, description: '', created: Date.UTC(2026, 10, 4, 3), folder: 'root', ...over });

beforeEach(async () => {
  for (const p of ['teams', 'roster', 'config']) await db.recursiveDelete(db.collection(p));
  await db.doc('teams/A').set({ status: 'active', members: [{ sid: 'A1', name: '氷室' }, { sid: 'A2', name: '瀬戸口' }], projectName: 'x', proposals: [], driveUrl: '', kickoffAt: 1, teamMeetingInput: false });
  files = []; access = 'PRIVATE'; geminiReply = GEMINI_OK; geminiCalls = [];
});

describe('録音から要旨の下書きを作る (Apps Script)', () => {
  test('録音を処理して、下書きを書き、録音を「処理済み」に移し、先生にメールを送る', async () => {
    files = [rec('A_2026-10-28.m4a')];
    const s = load(props);
    expect(s.run()).toBe(1);
    const d = (await db.doc('teams/A/meetingDrafts/2026-10-28').get()).data()!;
    expect(d.summary).toBe('設計を進める方針を確認した。');
    expect(d.decided).toEqual(['画面を先に作る']);
    expect(d.unclear).toEqual(['最後の数秒が聞き取れない']);
    expect(d.source).toBe('recording');
    expect(d.file).toBe('A_2026-10-28.m4a');
    expect(files[0].folder).toBe('処理済み');
    expect(files[0].description).toContain('要旨づくり済み');
    expect(s.sent).toHaveLength(1);
    expect(s.sent[0].to).toBe('teacher@trident.ac.jp');
    expect(s.sent[0].subject).toContain('要旨の下書きができました');
    // Gemini には、チームのメンバー名と、キーがヘッダーで渡る (URL には入れない)
    expect(geminiCalls[0].key).toBe('k');
    expect(geminiCalls[0].url).not.toContain('key=');
    expect(geminiCalls[0].body).toContain('氷室、瀬戸口');
    // 学生に見える「公開した要旨」は、作らない
    expect((await db.doc('teams/A/meetingSummaries/2026-10-28').get()).exists).toBe(false);
  });

  test('ファイル名からチームが分からない録音は、失敗として1回だけ知らせ、そのままにする', async () => {
    files = [rec('録音1.m4a')];
    const s = load(props);
    expect(s.run()).toBe(0);
    expect(files[0].description).toContain('要旨づくり失敗');
    expect(files[0].folder).toBe('root');
    expect(s.sent).toHaveLength(1);
    expect(s.sent[0].subject).toContain('失敗');
    expect(s.run()).toBe(0); // もう一度動いても、同じ録音は、もう試さない・知らせない
    expect(s.sent).toHaveLength(1);
    expect(geminiCalls).toHaveLength(0);
  });

  test('その日の下書き・公開済みの要旨があるときは、上書きしない', async () => {
    await db.doc('teams/A/meetingDrafts/2026-10-28').set({ date: '2026-10-28', summary: '先生が直した下書き' });
    files = [rec('A_2026-10-28.m4a')];
    const s = load(props);
    s.run();
    expect((await db.doc('teams/A/meetingDrafts/2026-10-28').get()).data()!.summary).toBe('先生が直した下書き');
    expect(geminiCalls).toHaveLength(0);
    expect(files[0].description).toContain('要旨づくり失敗');
  });

  test('音声でないファイル・大きすぎるファイル・AIの返事が不正なとき', async () => {
    files = [rec('メモ.txt', { mime: 'text/plain' }), rec('B_2026-10-28.m4a'), rec('A_2026-10-29.m4a', { size: 20 * 1048576 })];
    const s = load(props);
    expect(s.run()).toBe(0);
    expect(files[0].description).toBe(''); // 音声でないものは、触らない
    expect(files[1].description).toContain('チーム B がありません');
    expect(files[2].description).toContain('大きすぎます');
    geminiReply = { candidates: [{ content: { parts: [{ text: 'こんにちは' }] } }] };
    files = [rec('A_2026-10-30.m4a')];
    const s2 = load(props);
    s2.run();
    expect(files[0].description).toContain('AIの返事を読み取れませんでした');
    expect((await db.doc('teams/A/meetingDrafts/2026-10-30').get()).exists).toBe(false);
  });

  test('共有されているフォルダと、APIキーがないときは、動かない', () => {
    files = [rec('A_2026-10-28.m4a')];
    access = 'ANYONE_WITH_LINK';
    expect(() => load(props).run()).toThrow(/共有されています/);
    access = 'PRIVATE';
    expect(() => load({ ...props, GEMINI_API_KEY: '' }).run()).toThrow(/GEMINI_API_KEY/);
    expect(geminiCalls).toHaveLength(0);
  });

  test('日付のない名前は、ファイルを作った日 (日本時間) を使う', async () => {
    files = [rec('A.m4a')];
    load(props).run();
    expect((await db.doc('teams/A/meetingDrafts/2026-11-04').get()).exists).toBe(true);
  });
});
