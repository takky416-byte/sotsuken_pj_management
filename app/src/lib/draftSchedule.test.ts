import { describe, expect, test } from 'vitest';
import { autoSchedule } from './draftSchedule';
import { parseOutline } from './outline';
import { parsePeriod } from './period';
import { planImport } from './importPlan';

describe('parsePeriod', () => {
  test('日付の形いろいろ', () => {
    expect(parsePeriod('2026-11-02〜2026-11-10')).toEqual({ startDate: '2026-11-02', endDate: '2026-11-10' });
    expect(parsePeriod('11/2〜11/10')).toEqual({ startDate: '2026-11-02', endDate: '2026-11-10' });
    expect(parsePeriod('1/20〜2/2')).toEqual({ startDate: '2027-01-20', endDate: '2027-02-02' });
    expect(parsePeriod('11/5')).toEqual({ startDate: '2026-11-05', endDate: '2026-11-05' });
    expect(parsePeriod('あした')).toBeNull();
    expect(parsePeriod('13/40〜14/1')).toBeNull();
  });
});

describe('アウトラインの期間', () => {
  const text = '# 外部設計\n- 画面を描く\n  > 期間: 11/9〜11/12\n  > やること: x\n  > できあがり: y';
  test('「期間:」の行は、詳細に入れず、期間にする', () => {
    expect(parseOutline(text)[1]).toEqual({ depth: 2, title: '画面を描く', detail: 'やること: x\nできあがり: y', startDate: '2026-11-09', endDate: '2026-11-12' });
  });
  test('取り込みでタスクの期間になる。同名の既存項目は変えない', () => {
    const { created } = planImport([], parseOutline(text), () => `id${Math.random()}`);
    expect(created.find((c) => c.title === '画面を描く')).toMatchObject({ startDate: '2026-11-09', endDate: '2026-11-12' });
  });
});

describe('autoSchedule', () => {
  const nodes = parseOutline('# 外部設計\n- a\n- b\n- 外部設計レビューの資料を作る\n# 内部設計・実装\n- 部品を発注する\n- 部品を追加で発注する\n- c');
  const out = autoSchedule(nodes);
  const of = (t: string) => out.find((n) => n.title === t)!;
  test('どの項目にも期間が入り、開始は終了以前', () => {
    for (const n of out.filter((x) => x.depth > 1)) {
      expect(n.startDate && n.endDate && n.startDate <= n.endDate).toBeTruthy();
    }
  });
  test('節目の期限と、機材発注の期限を越えない。大項目には入れない', () => {
    expect(of('外部設計レビューの資料を作る').endDate! <= '2026-11-25').toBe(true);
    expect(of('部品を発注する').endDate! <= '2026-11-05').toBe(true);
    expect(of('部品を追加で発注する').endDate! <= '2026-12-01').toBe(true);
    expect(of('外部設計').startDate).toBeUndefined();
  });
  test('すでにある期間は、そのまま', () => {
    const kept = autoSchedule(parseOutline('# 外部設計\n- a\n  > 期間: 11/20〜11/21\n- b'));
    expect([kept[1].startDate, kept[1].endDate]).toEqual(['2026-11-20', '2026-11-21']);
    expect(kept[2].startDate).toBeTruthy();
  });
});
