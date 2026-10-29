import { describe, expect, test } from 'vitest';
import { GRACE_MS, TEACHER_GRACE_MS, graceOf } from './shared';

describe('購読を保持する時間', () => {
  test('学生は5分。教員は、全チームのデータを30分 (画面を行き来するたびに、読み直さない)', () => {
    expect(graceOf('tasks:A', false)).toBe(GRACE_MS);
    expect(graceOf('tasks:A', true)).toBe(TEACHER_GRACE_MS);
    expect(graceOf('dailies:B:2026-10-08', true)).toBe(TEACHER_GRACE_MS);
  });
  test('アクセス履歴・変更履歴は、教員でも短いまま (変更が多く、量も多い)', () => {
    expect(graceOf('access:2026-10-15', true)).toBe(GRACE_MS);
    expect(graceOf('taskLogs-since:A:123', true)).toBe(GRACE_MS);
  });
});
