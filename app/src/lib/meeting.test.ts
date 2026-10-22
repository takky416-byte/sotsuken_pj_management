import { describe, expect, test } from 'vitest';
import type { ClassDay } from '../types';
import { meetingOrder, neighborTeam, previousMeeting, type Meeting } from './meeting';

const day = (date: string, meeting: boolean): ClassDay => ({ date, periods: '1-2', meeting, note: '' });

describe('meetingOrder', () => {
  const days = [day('2026-10-29', true), day('2026-11-05', true), day('2026-11-12', true), day('2026-10-28', false)];
  test('固定', () => {
    expect(meetingOrder(days, '2026-11-12', false)).toEqual(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']);
  });
  test('ミーティングを行った回数だけ先頭をずらす (今日の分は数えない)', () => {
    expect(meetingOrder(days, '2026-10-29', true)[0]).toBe('A'); // 0回
    expect(meetingOrder(days, '2026-11-05', true)[0]).toBe('B'); // 1回
    expect(meetingOrder(days, '2026-11-12', true)).toEqual(['C', 'D', 'E', 'F', 'G', 'H', 'A', 'B']); // 2回
  });
  test('8回で一巡する', () => {
    const many = Array.from({ length: 9 }, (_, i) => day(`2027-01-${String(i + 1).padStart(2, '0')}`, true));
    expect(meetingOrder(many, '2027-02-01', true)[0]).toBe('B'); // 9回 → 1
  });
});

describe('previousMeeting / neighborTeam', () => {
  const m = (date: string): Meeting => ({ id: date, date, decided: '', actions: [], note: '', createdBy: 'teacher', updatedAt: 0 });
  test('今日より前で最新', () => {
    expect(previousMeeting([m('2026-10-29'), m('2026-11-05'), m('2026-11-12')], '2026-11-12')?.date).toBe('2026-11-05');
    expect(previousMeeting([m('2026-11-12')], '2026-11-12')).toBeUndefined();
  });
  test('隣のチーム', () => {
    const order = ['C', 'D', 'A'];
    expect(neighborTeam(order, 'D', 1)).toBe('A');
    expect(neighborTeam(order, 'C', -1)).toBeNull();
    expect(neighborTeam(order, 'A', 1)).toBeNull();
    expect(neighborTeam(order, 'Z', 1)).toBeNull();
  });
});
