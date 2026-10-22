import { describe, expect, test } from 'vitest';
import { dayKey, formatDate, isDateString, jstDate } from './dates';

describe('dates', () => {
  test('UTC の夕方は日本時間では翌日になる', () => {
    expect(jstDate(new Date('2026-10-27T15:00:00Z'))).toBe('2026-10-28');
    expect(jstDate(new Date('2026-10-27T14:59:59Z'))).toBe('2026-10-27');
  });
  test('dayKey', () => {
    expect(dayKey('2026-10-28')).toBe(20261028);
  });
  test('isDateString', () => {
    expect(isDateString('2026-10-28')).toBe(true);
    expect(isDateString('2026-13-99')).toBe(false);
    expect(isDateString('10/28')).toBe(false);
    expect(isDateString(null)).toBe(false);
  });
  test('formatDate', () => {
    expect(formatDate('2026-10-28')).toBe('10/28(水)');
    expect(formatDate('2027-02-06')).toBe('2/6(土)');
  });
});
