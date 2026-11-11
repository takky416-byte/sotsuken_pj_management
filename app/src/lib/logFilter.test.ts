import { describe, expect, test } from 'vitest';
import type { Daily } from './daily';
import { filterDailies } from './logFilter';

const d = (sid: string, date: string, note: string, o: Partial<Daily> = {}): Daily => ({
  id: `${sid}_${date}`, sid, date, dayKey: 0, entries: [{ kind: 'task', taskId: 't1', result: 'progress', note }], blocker: '', absent: false, ...o,
});
const list = [d('A1', '2026-11-04', 'ER図を作った'), d('A2', '2026-11-04', '画面を描いた', { next: 'ログインを作る' }), d('A1', '2026-11-11', '機能一覧を直した')];
const title = (id: string) => (id === 't1' ? 'データの設計' : '');

describe('filterDailies', () => {
  test('個人・日付の範囲(両端を含む)', () => {
    expect(filterDailies(list, title, { sid: 'A1' }).map((x) => x.id)).toEqual(['A1_2026-11-04', 'A1_2026-11-11']);
    expect(filterDailies(list, title, { from: '2026-11-05' }).map((x) => x.id)).toEqual(['A1_2026-11-11']);
    expect(filterDailies(list, title, { from: '2026-11-04', to: '2026-11-04' }).length).toBe(2);
  });
  test('文字: 説明・次にやること・タスク名の部分一致。空白で区切ると、すべてを含むもの。全角・半角は区別しない', () => {
    expect(filterDailies(list, title, { q: 'ログイン' }).map((x) => x.sid)).toEqual(['A2']);
    expect(filterDailies(list, title, { q: 'データの設計' }).length).toBe(3);
    expect(filterDailies(list, title, { q: 'ｅｒ図 作った' }).map((x) => x.id)).toEqual(['A1_2026-11-04']);
    expect(filterDailies(list, title, { q: '存在しない' })).toEqual([]);
  });
  test('結果: 進んだ・完了した・詰まった・作業なし。文字の絞り込みとも組み合わせられる', () => {
    const more = [
      ...list,
      d('A3', '2026-11-11', '完成した', { entries: [{ kind: 'task', taskId: 't1', result: 'done', note: '完成した' }] }),
      d('A4', '2026-11-11', '', { entries: [], noWork: true }),
      d('A5', '2026-11-11', '詰まった', { entries: [{ kind: 'task', taskId: 't1', result: 'stuck', note: '詰まった' }] }),
    ];
    expect(filterDailies(more, title, { result: 'done' }).map((x) => x.sid)).toEqual(['A3']);
    expect(filterDailies(more, title, { result: 'stuck' }).map((x) => x.sid)).toEqual(['A5']);
    expect(filterDailies(more, title, { result: 'nowork' }).map((x) => x.sid)).toEqual(['A4']);
    expect(filterDailies(more, title, { result: 'progress' }).length).toBe(3);
    expect(filterDailies(more, title, { result: 'progress', q: 'ログイン' }).map((x) => x.sid)).toEqual(['A2']);
    expect(filterDailies(more, title, { result: '' }).length).toBe(6);
  });
});
