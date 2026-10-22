import { describe, expect, test } from 'vitest';
import type { ClassDay } from '../types';
import { parseClassDaysCsv, removeDay, sortDays, upsertDay, validateDay } from './classDays';

const d = (date: string, periods: ClassDay['periods'] = '3-4', meeting = false, note = ''): ClassDay => ({ date, periods, meeting, note });

describe('classDays', () => {
  test('追加・置き換え・削除は、日付順', () => {
    const days = [d('2026-11-05', '1-2', true), d('2026-10-28')];
    expect(sortDays(days).map((x) => x.date)).toEqual(['2026-10-28', '2026-11-05']);
    expect(upsertDay(days, d('2026-11-01')).map((x) => x.date)).toEqual(['2026-10-28', '2026-11-01', '2026-11-05']);
    expect(upsertDay(days, d('2026-10-28', '1-2', true, '変更')).find((x) => x.date === '2026-10-28')).toEqual(d('2026-10-28', '1-2', true, '変更'));
    expect(upsertDay(days, d('2026-10-28')).length).toBe(2); // 重複しない
    expect(removeDay(days, '2026-10-28').map((x) => x.date)).toEqual(['2026-11-05']);
  });
  test('検証', () => {
    expect(validateDay(d('2026-10-28'))).toBeNull();
    expect(validateDay(d('2026-13-40'))).toContain('日付');
    expect(validateDay({ date: '2026-10-28', periods: '5-6' as ClassDay['periods'], note: '', meeting: false })).toContain('時限');
    expect(validateDay(d('2026-10-28', '3-4', false, 'あ'.repeat(101)))).toContain('100文字');
  });
  test('CSV: 時限の表記ゆれ、ミーティングの省略 (木曜の1-2限だけ「あり」)、エラー', () => {
    const r = parseClassDaysCsv([
      '日付,時限,備考,ミーティング',
      '2026-11-05,1-2限,通常,', // 木曜 → ミーティングあり
      '2026-11-04,3・4,,',      // 水曜 → なし
      '2026-11-10,3-4,休講に注意,あり', // 火曜だが、明示
      '2026-11-11,5-6,,',       // 時限が不正
      'abc,3-4,,',              // 日付が不正
      '2026-11-05,1-2,重複,',   // 重複
    ].join('\n'));
    expect(r.days.map((x) => [x.date, x.periods, x.meeting, x.note])).toEqual([
      ['2026-11-04', '3-4', false, ''], ['2026-11-05', '1-2', true, '通常'], ['2026-11-10', '3-4', true, '休講に注意'],
    ]);
    expect(r.errors.map((e) => e.line)).toEqual([5, 6, 7]);
  });
});
