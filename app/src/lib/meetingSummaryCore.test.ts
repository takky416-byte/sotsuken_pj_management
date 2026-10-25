import { createRequire } from 'node:module';
import { describe, expect, test } from 'vitest';

// Apps Script の、録音 → 要旨の下書きのロジック (apps-script/summary.js) のテスト
const M = createRequire(import.meta.url)('../../../apps-script/summary.js');

describe('録音のファイル名', () => {
  test('チームと日付を取り出す', () => {
    expect(M.parseRecordingName('A_2026-10-28.m4a', '2026-01-01')).toEqual({ teamId: 'A', date: '2026-10-28' });
    expect(M.parseRecordingName('b 2026-10-28 録音.mp3', '2026-01-01')).toEqual({ teamId: 'B', date: '2026-10-28' });
    expect(M.parseRecordingName('C_20261028.wav', '2026-01-01')).toEqual({ teamId: 'C', date: '2026-10-28' });
  });
  test('日付がなければ、ファイルを作った日を使う。チームが分からなければ null', () => {
    expect(M.parseRecordingName('D.m4a', '2026-11-04')).toEqual({ teamId: 'D', date: '2026-11-04' });
    expect(M.parseRecordingName('録音1.m4a', '2026-11-04')).toBeNull();
    expect(M.parseRecordingName('Z_2026-10-28.m4a', '2026-11-04')).toBeNull();
    expect(M.parseRecordingName('Audio 2026.m4a', '2026-11-04')).toBeNull(); // 英単語の頭文字を、チームと取り違えない
    expect(M.parseRecordingName('A_2026-13-99.m4a', '2026-11-04')).toBeNull();
  });
});

describe('音声の判定', () => {
  test('拡張子か mimeType で、音声と分かるもの', () => {
    expect(M.audioMime('A_x.m4a', 'application/octet-stream')).toBe('audio/mp4');
    expect(M.audioMime('A_x.MP3', '')).toBe('audio/mp3');
    expect(M.audioMime('A_x', 'audio/x-m4a')).toBe('audio/mp4');
    expect(M.audioMime('A_x.txt', 'text/plain')).toBeNull();
  });
});

describe('AIの返事', () => {
  const ok = JSON.stringify({ summary: ' 要旨です ', decided: ['a', ' '], actions: ['氷室: 画面を作る'], concerns: [], unclear: ['聞き取れない所'] });
  test('JSON を、下書きの項目にする (空の項目・長すぎる項目は整える)', () => {
    const p = M.parseModelText(ok);
    expect(p).toEqual({ summary: '要旨です', decided: ['a'], actions: ['氷室: 画面を作る'], concerns: [], unclear: ['聞き取れない所'] });
    expect(M.parseModelText('```json\n' + ok + '\n```').summary).toBe('要旨です');
    expect(M.parseModelText(JSON.stringify({ summary: 'あ'.repeat(3000), decided: Array(30).fill('x') })).summary).toHaveLength(1200);
    expect(M.parseModelText(JSON.stringify({ summary: 's', decided: Array(30).fill('x') })).decided).toHaveLength(12);
  });
  test('形が違う返事は、例外', () => {
    expect(() => M.parseModelText('こんにちは')).toThrow();
    expect(() => M.parseModelText('{"summary":""}')).toThrow();
  });
  test('Gemini の返事から本文を取り出す。ブロックされたときは理由つきの例外', () => {
    expect(M.textOf({ candidates: [{ content: { parts: [{ text: 'a' }, { text: 'b' }] } }] })).toBe('ab');
    expect(() => M.textOf({ promptFeedback: { blockReason: 'SAFETY' } })).toThrow(/SAFETY/);
  });
});

describe('下書きと Firestore への書き込み', () => {
  test('アプリの下書きと同じ形になる', () => {
    const d = M.draftDoc({ summary: 's', decided: [], actions: [], concerns: [], unclear: ['u'] }, { date: '2026-10-28', file: 'A_2026-10-28.m4a', now: 5 });
    expect(Object.keys(d).sort()).toEqual(['actions', 'concerns', 'createdAt', 'date', 'decided', 'file', 'source', 'summary', 'unclear', 'updatedAt']);
    expect(d.source).toBe('recording');
  });
  test('Firestore REST の値にする', () => {
    expect(M.encodeFields({ a: 's', n: 5, ok: true, l: ['x'], z: null })).toEqual({
      a: { stringValue: 's' }, n: { integerValue: '5' }, ok: { booleanValue: true }, l: { arrayValue: { values: [{ stringValue: 'x' }] } }, z: { nullValue: null },
    });
  });
  test('プロンプトに、チーム・日付・メンバーが入る', () => {
    const p = M.buildPrompt('A', '2026-10-28', ['氷室', '瀬戸口']);
    expect(p).toContain('A'); expect(p).toContain('2026-10-28'); expect(p).toContain('氷室、瀬戸口');
    expect(p).toContain('話されていないこと');
  });
});
