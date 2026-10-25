import { describe, expect, it } from 'vitest';
import { linesToList, listToLines, splitLatest, toSummary } from './meetingSummary';

describe('要旨', () => {
  it('1行1項目のテキストを項目にする (空行・先頭の記号を除く)', () => {
    expect(linesToList('・設計を進める\n\n- 画面を作る\n  テストする  \n')).toEqual(['設計を進める', '画面を作る', 'テストする']);
    expect(listToLines(['a', 'b'])).toBe('a\nb');
    expect(listToLines(undefined)).toBe('');
  });
  it('長すぎる項目と多すぎる項目は切る', () => {
    expect(linesToList('あ'.repeat(500))[0]).toHaveLength(200);
    expect(linesToList(Array.from({ length: 30 }, (_, i) => `項目${i}`).join('\n'))).toHaveLength(12);
  });
  it('要旨が空なら公開できない', () => {
    expect(toSummary('2026-10-28', { summary: '  ', decided: [], actions: [], concerns: [] })).toBeNull();
    const s = toSummary('2026-10-28', { summary: ' 要旨 ', decided: ['a', ' '], actions: [], concerns: ['c'] }, 5);
    expect(s).toEqual({ date: '2026-10-28', summary: '要旨', decided: ['a'], actions: [], concerns: ['c'], publishedAt: 5 });
  });
  it('いちばん新しい要旨を選ぶ', () => {
    const { latest, older } = splitLatest([{ date: '2026-10-21' }, { date: '2026-11-04' }, { date: '2026-10-28' }]);
    expect(latest?.date).toBe('2026-11-04');
    expect(older.map((x) => x.date)).toEqual(['2026-10-28', '2026-10-21']);
    expect(splitLatest([]).latest).toBeNull();
  });
});
