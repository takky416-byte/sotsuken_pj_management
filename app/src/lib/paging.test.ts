import { describe, expect, test } from 'vitest';
import { pageOf } from './paging';

describe('pageOf', () => {
  test('1ページ10件。最後のページは、残りだけ', () => {
    expect(pageOf(25, 1, 10)).toEqual({ page: 1, pages: 3, start: 0, end: 10 });
    expect(pageOf(25, 3, 10)).toEqual({ page: 3, pages: 3, start: 20, end: 25 });
  });
  test('0件でも1ページ。範囲外のページは、近いページに直す', () => {
    expect(pageOf(0, 1, 10)).toEqual({ page: 1, pages: 1, start: 0, end: 0 });
    expect(pageOf(25, 9, 10).page).toBe(3);
    expect(pageOf(25, 0, 10).page).toBe(1);
    expect(pageOf(25, NaN, 10).page).toBe(1);
  });
  test('ちょうど割り切れるとき', () => {
    expect(pageOf(20, 2, 10)).toEqual({ page: 2, pages: 2, start: 10, end: 20 });
  });
});
