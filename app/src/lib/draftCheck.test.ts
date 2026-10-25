import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { checkDraft } from './draftCheck';

const example = readFileSync(new URL('../../../docs/wbs-drafts/example-soft.md', import.meta.url), 'utf8');
const errors = (t: string, k?: 'ソフト' | 'ハード') => checkDraft(t, k).issues.filter((i) => i.level === 'error').map((i) => i.message);

describe('checkDraft', () => {
  test('見本の叩き台は、問題なし', () => {
    const r = checkDraft(example);
    expect(r.issues).toEqual([]);
    expect(r.total).toBe(50);
  });
  test('ハード系として見ると、発注の項目がないと誤り', () => {
    expect(errors(example, 'ハード').some((m) => m.includes('機材発注'))).toBe(true);
    const withOrders = example.replace('# テスト・検証', [
      '- 部品を発注する(1回目)', '  > やること: 11/5までに、部品の一覧を教員に出す。', '  > できあがり: 発注の控えが共有フォルダにある。',
      '- 追加の部品を発注する(2回目)', '  > やること: 12/1までに、足りない部品を出す。', '  > できあがり: 発注の控えが共有フォルダにある。',
      '# テスト・検証'].join('\n'));
    expect(errors(withOrders, 'ハード').some((m) => m.includes('機材発注'))).toBe(false);
  });
  test('詳細がない・やること/できあがりがない・ヒントがある', () => {
    const bad = example
      .replace('  > やること: 全員のパソコンで動く環境を作り、共有の置き場を決める。\n', '')
      .replace('できあがり: 起動から終了まで、通しで操作できる。', 'ヒント: まず1つずつ');
    const e = errors(bad);
    expect(e.some((m) => m.includes('開発環境を整える') && m.includes('やること'))).toBe(true);
    expect(e.some((m) => m.includes('機能どうしをつなぐ') && m.includes('できあがり'))).toBe(true);
    expect(e.some((m) => m.includes('ヒント'))).toBe(true);
  });
  test('担当・期限を書いたら誤り。同じ題名の重なりも誤り', () => {
    expect(errors(example.replace('- 機能1を実装する', '- 機能1を実装する @小林 〜11/30')).some((m) => m.includes('担当'))).toBe(true);
    expect(errors(example.replace('- 機能2を実装する', '- 機能1を実装する')).some((m) => m.includes('重なって'))).toBe(true);
  });
  test('大項目の欠け・順序違い・件数の過不足', () => {
    expect(errors(example.replace('# 要件定義', '# 要件')).some((m) => m.includes('6つ'))).toBe(true);
    const few = example.split('# 内部設計・実装')[0] + '# 内部設計・実装\n- a\n  > やること: x\n  > できあがり: yyyyyyy\n# テスト・検証\n# 発表・展示準備\n';
    expect(errors(few).some((m) => m.includes('50〜60件'))).toBe(true);
  });
  test('日程の節目 (外部設計レビューなど) が抜けると、注意', () => {
    const r = checkDraft(example.replace('外部設計レビューの資料を作る', '外部設計の資料を作る').replace('外部設計レビューの指摘を整理する', '外部設計の指摘を整理する'));
    expect(r.issues.some((i) => i.level === 'warn' && i.message.includes('外部設計レビュー'))).toBe(true);
  });
});
