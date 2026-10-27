import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { CLASS_DAYS, WINTER_BREAK, autoSchedule, avoidWinterBreak, fillPeriods, isClassDay, snapPeriod } from './draftSchedule';
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
  const nodes = parseOutline('# 外部設計\n- a\n- b\n- 外部設計レビューの説明スライドを作る\n# 内部設計・実装\n- 部品を発注する\n- 部品を追加で発注する\n- c');
  const out = autoSchedule(nodes);
  const of = (t: string) => out.find((n) => n.title === t)!;
  test('どの項目にも期間が入り、開始は終了以前', () => {
    for (const n of out.filter((x) => x.depth > 1)) {
      expect(n.startDate && n.endDate && n.startDate <= n.endDate).toBeTruthy();
    }
  });
  test('節目の期限と、機材発注の期限を越えない。大項目には入れない', () => {
    expect(of('外部設計レビューの説明スライドを作る').endDate! <= '2026-11-25').toBe(true);
    expect(of('部品を発注する').endDate! <= '2026-11-05').toBe(true);
    expect(of('部品を追加で発注する').endDate! <= '2026-12-01').toBe(true);
    expect(of('外部設計').startDate).toBeUndefined();
  });
  test('すでにある期間は、授業日なら、そのまま。授業日でなければ、開始は次の授業日・終了は前の授業日に寄せる', () => {
    const kept = autoSchedule(parseOutline('# 外部設計\n- a\n  > 期間: 11/24〜11/25\n- b\n  > 期間: 11/20〜11/27'));
    expect([kept[1].startDate, kept[1].endDate]).toEqual(['2026-11-24', '2026-11-25']);
    // 11/20 (金) → 11/24 (火)、11/27 (金) → 11/26 (木)
    expect([kept[2].startDate, kept[2].endDate]).toEqual(['2026-11-24', '2026-11-26']);
    expect(autoSchedule(parseOutline('# 外部設計\n- c')).slice(1).every((n) => !!n.startDate)).toBe(true);
  });
});

describe('授業日と冬休み', () => {
  test('授業日は、冬休み (12/25〜1/6) を含まない。12/24 の次は 1/7', () => {
    expect(CLASS_DAYS.some((d) => d >= WINTER_BREAK[0] && d <= WINTER_BREAK[1])).toBe(false);
    expect(isClassDay('2026-12-24')).toBe(true);
    expect(isClassDay('2027-01-07')).toBe(true);
    expect(isClassDay('2026-11-21')).toBe(false); // 土曜
  });
  test('授業日がはさまらない期間は、1日の期間にする。冬休みだけの期間も、前後の授業日になる', () => {
    expect(snapPeriod('2026-11-21', '2026-11-22')).toEqual({ start: '2026-11-24', end: '2026-11-24' });
    expect(snapPeriod('2026-12-26', '2027-01-05')).toEqual({ start: '2027-01-07', end: '2027-01-07' });
    expect(snapPeriod('2026-12-23', '2027-01-08')).toEqual({ start: '2026-12-23', end: '2027-01-07' }); // 寄せるだけ。休みをまたぐ扱いは、下
  });
  test('冬休みをまたぐ期間は作らない: 休み前と休み明けの長いほう (同じなら休み前) だけにする', () => {
    expect(avoidWinterBreak('2026-12-23', '2027-01-08')).toEqual({ start: '2026-12-23', end: '2026-12-24' }); // 2日と2日 → 休み前
    expect(avoidWinterBreak('2026-12-22', '2027-01-12')).toEqual({ start: '2026-12-22', end: '2026-12-24' }); // 休み前 3日 > 休み明け 2日
    expect(avoidWinterBreak('2026-12-24', '2027-01-20')).toEqual({ start: '2027-01-07', end: '2027-01-20' }); // 休み前 1日 < 休み明けのほう
    expect(avoidWinterBreak('2026-12-15', '2027-01-07')).toEqual({ start: '2026-12-15', end: '2026-12-24' });
    expect(avoidWinterBreak('2026-12-01', '2026-12-24')).toEqual({ start: '2026-12-01', end: '2026-12-24' }); // またがない
    expect(avoidWinterBreak('2027-01-07', '2027-01-20')).toEqual({ start: '2027-01-07', end: '2027-01-20' });
  });
  test('自動で入れる期間・寄せた期間は、すべて授業日。冬休みの中には入らない。見本をもとに確かめる', () => {
    for (const f of ['example-soft.md', 'example-hard.md']) {
      const text = readFileSync(new URL(`../../../docs/wbs-drafts/${f}`, import.meta.url), 'utf8');
      const stripped = text.replace(/^ {2}> 期間:.*\n/gm, '');
      for (const t of [text, stripped]) {
        const leaves = autoSchedule(parseOutline(t)).filter((n) => n.depth > 1 && n.startDate);
        expect(leaves.length).toBeGreaterThan(40);
        for (const n of leaves) {
          expect(isClassDay(n.startDate as string), `${f} ${n.title} 開始 ${n.startDate}`).toBe(true);
          expect(isClassDay(n.endDate as string), `${f} ${n.title} 終了 ${n.endDate}`).toBe(true);
          expect((n.startDate as string) <= (n.endDate as string)).toBe(true);
          expect(!((n.startDate as string) < WINTER_BREAK[0] && (n.endDate as string) > WINTER_BREAK[1]), `${f} ${n.title} が冬休みをまたぐ`).toBe(true);
        }
      }
      // 文章の形でも、期間の行がすべて授業日になる
      const filled = fillPeriods(stripped);
      for (const m of filled.matchAll(/期間: (\d{4}-\d{2}-\d{2})〜(\d{4}-\d{2}-\d{2})/g)) {
        expect(isClassDay(m[1]) && isClassDay(m[2]), `${f} ${m[0]}`).toBe(true);
      }
    }
  });
});
