import { describe, expect, it } from 'vitest';
import { checkMinutes, decodeTextFile, splitLatest, MAX_MINUTES_CHARS } from './meetingMinutes';

const bytes = (a: number[]) => new Uint8Array(a).buffer;

describe('議事録', () => {
  it('UTF-8 のテキストを読む (BOM と CRLF は整える)', () => {
    const utf8 = new TextEncoder().encode('﻿決まったこと\r\n画面を先に作る');
    expect(decodeTextFile(utf8.buffer.slice(utf8.byteOffset, utf8.byteOffset + utf8.byteLength) as ArrayBuffer)).toBe('決まったこと\n画面を先に作る');
  });
  it('Shift_JIS のテキストも読める', () => {
    // 「あい」の Shift_JIS
    expect(decodeTextFile(bytes([0x82, 0xa0, 0x82, 0xa2]))).toBe('あい');
  });
  it('空・長すぎる議事録は断る。前後の空白と、続く空行は整える', () => {
    expect(checkMinutes('  \n ')).toEqual({ ok: false, reason: '議事録が空です' });
    const long = checkMinutes('あ'.repeat(MAX_MINUTES_CHARS + 1));
    expect(long.ok).toBe(false);
    expect(checkMinutes('\n\n 要点 \n\n\n\n次\n')).toEqual({ ok: true, text: '要点\n\n次' });
  });
  it('いちばん新しい議事録を選ぶ', () => {
    const { latest, older } = splitLatest([{ date: '2026-10-21' }, { date: '2026-11-04' }, { date: '2026-10-28' }]);
    expect(latest?.date).toBe('2026-11-04');
    expect(older.map((x) => x.date)).toEqual(['2026-10-28', '2026-10-21']);
    expect(splitLatest([]).latest).toBeNull();
  });
});
