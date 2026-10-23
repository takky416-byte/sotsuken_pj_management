import { describe, expect, it } from 'vitest';
import { dayAt, dragDates } from './ganttDrag';

const o = { start: '2026-11-10', end: '2026-11-12' };
describe('dragDates', () => {
  it('move は両端を同じだけずらす', () => expect(dragDates('move', o, 2)).toEqual({ start: '2026-11-12', end: '2026-11-14' }));
  it('start は終了日を超えない', () => {
    expect(dragDates('start', o, -1)).toEqual({ start: '2026-11-09', end: '2026-11-12' });
    expect(dragDates('start', o, 9)).toEqual({ start: '2026-11-12', end: '2026-11-12' });
  });
  it('end は開始日より前に行かない', () => {
    expect(dragDates('end', o, 3)).toEqual({ start: '2026-11-10', end: '2026-11-15' });
    expect(dragDates('end', o, -9)).toEqual({ start: '2026-11-10', end: '2026-11-10' });
  });
  it('new は押した日といまの日の間 (左へなぞっても順序は正しい)', () => {
    expect(dragDates('new', o, 0, '2026-11-20')).toEqual({ start: '2026-11-20', end: '2026-11-20' });
    expect(dragDates('new', o, -3, '2026-11-20')).toEqual({ start: '2026-11-17', end: '2026-11-20' });
  });
});
describe('dayAt', () => {
  it('位置から日数を求める', () => {
    expect(dayAt(150, 100, 500, 50)).toBe(5);
    expect(dayAt(90, 100, 500, 50)).toBe(-1);
  });
});
