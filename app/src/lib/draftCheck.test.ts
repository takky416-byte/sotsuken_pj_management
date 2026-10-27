import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { checkDraft } from './draftCheck';
import { fillPeriods } from './draftSchedule';

const example = readFileSync(new URL('../../../docs/wbs-drafts/example-soft.md', import.meta.url), 'utf8');
const exampleHard = readFileSync(new URL('../../../docs/wbs-drafts/example-hard.md', import.meta.url), 'utf8');
const errors = (t: string, k?: 'ソフト' | 'ハード') => checkDraft(t, k).issues.filter((i) => i.level === 'error').map((i) => i.message);

describe('checkDraft', () => {
  test('見本の叩き台は、問題なし', () => {
    const r = checkDraft(example);
    expect(r.issues).toEqual([]);
    expect(r.total).toBe(53);
  });
  test('ハード系として見ると、発注の項目がないと誤り', () => {
    expect(errors(example, 'ハード').some((m) => m.includes('機材発注'))).toBe(true);
    const withOrders = example.replace('# 動作確認・改善', [
      '- 部品を発注する(1回目)', '  > やること: 11/5までに、部品の一覧を教員に出す。', '  > できあがり: 発注の控えが共有フォルダにある。',
      '- 追加の部品を発注する(2回目)', '  > やること: 12/1までに、足りない部品を出す。', '  > できあがり: 発注の控えが共有フォルダにある。',
      '# 動作確認・改善'].join('\n'));
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
    const few = example.split('# 内部設計・実装')[0] + '# 内部設計・実装\n- a\n  > やること: x\n  > できあがり: yyyyyyy\n# 動作確認・改善\n# 発表・展示準備\n';
    expect(errors(few).some((m) => m.includes('50〜60件'))).toBe(true);
  });
  test('日程の節目 (中間報告など) が抜けると、注意', () => {
    const r = checkDraft(example.replace('中間報告の当日の説明を準備する', '外部設計の説明を作る').replace('中間報告の指摘を整理して、対応を決める', '外部設計の指摘を整理する'));
    expect(r.issues.some((i) => i.level === 'warn' && i.message.includes('中間報告'))).toBe(true);
  });
});

describe('期間', () => {
  test('期間のない項目は誤り。範囲外・逆順・節目の期限超えも誤り', () => {
    const stripped = example.replace(/^ {2}> 期間: .*\n/m, '');
    expect(errors(stripped).some((m) => m.includes('期間がありません'))).toBe(true);
    const [first, a, b] = /期間: (\d{4}-\d{2}-\d{2})〜(\d{4}-\d{2}-\d{2})/.exec(example) as RegExpExecArray; // 最初の項目の期間
    expect(errors(example.replace(first, '期間: 2026-10-01〜' + b)).some((m) => m.includes('外'))).toBe(true);
    expect(errors(example.replace(first, `期間: 2026-11-04〜2026-10-29`)).some((m) => m.includes('開始が終了より後'))).toBe(true);
    expect(errors(example.replace(first, `期間: 2026-11-07〜2026-11-08`)).some((m) => m.includes('授業日ではありません'))).toBe(true); // 土・日
    expect(errors(example.replace(first, `期間: 2026-12-26〜2027-01-05`)).some((m) => m.includes('授業日ではありません'))).toBe(true); // 冬休み
    void a;
    const late = example.replace(/(- 中間報告の当日の説明を準備する\n {2}> 期間: )[^\n]*/, '$12026-11-20〜2026-12-02');
    expect(errors(late).some((m) => m.includes('中間報告'))).toBe(true);
  });
  test('自動で入れると、誤りがなくなる (見本から期間を外して入れ直す)', () => {
    const stripped = example.replace(/^ {2}> 期間: .*\n/gm, '');
    expect(errors(stripped).length).toBeGreaterThan(40);
    expect(checkDraft(fillPeriods(stripped)).issues).toEqual([]);
    expect(fillPeriods(fillPeriods(stripped))).toBe(fillPeriods(stripped)); // 2回かけても変わらない
  });
});

describe('成果物', () => {
  test('成果物の項目が1つ抜けると、その成果物の名前で誤りになる', () => {
    for (const [title, label] of [['卒展用パネルを作る', '卒展用パネル'], ['機能仕様書を書く', '機能仕様書'], ['動画をYouTube限定公開にする', '動画のYouTube限定公開']] as const) {
      const without = example.replace(new RegExp(`^- ${title}\\n(?: {2}> .*\\n)+`, 'm'), '');
      expect(errors(without).some((m) => m.includes(`成果物「${label}」`)), label).toBe(true);
    }
  });
  test('ハード系は、回路図が必要。ER図・テーブル定義書は、データを保存する企画だけなので、なくても注意だけ', () => {
    const e = errors(example, 'ハード');
    expect(e.some((m) => m.includes('成果物「回路図」'))).toBe(true);
    expect(errors(example, 'ソフト').some((m) => m.includes('回路図'))).toBe(false);
    const noER = example.replace(/^- ER図を描く\n(?: {2}> .*\n)+/m, '');
    expect(errors(noER).some((m) => m.includes('ER図'))).toBe(false);
    expect(checkDraft(noER).issues.some((i) => i.level === 'warn' && i.message.includes('成果物「ER図」'))).toBe(true);
  });
  test('設計書類の期限 (事前送付) を過ぎる期間は誤り', () => {
    const late = example.replace(/(- ER図を描く\n {2}> 期間: )[^\n]*/, '$12026-11-16〜2026-11-19');
    expect(errors(late).some((m) => m.includes('ER図'))).toBe(true);
  });
});

describe('ハード系の見本・記入サンプルから足した確認', () => {
  test('ハード系の見本は、ハード系として問題なし', () => {
    expect(checkDraft(exampleHard, 'ハード').issues).toEqual([]);
  });
  test('今後の展望がないと、注意が出る (誤りではない)。ペルソナ・費用は、企画発表の資料を使うので、項目がなくても注意しない', () => {
    const noPersona = example.replace(/^- 想定する利用者像\(ペルソナ\)を作る\n(?: {2}> .*\n)+/m, '').replace(/^- 費用を見積もる.*\n(?: {2}> .*\n)+/m, '');
    expect(noPersona).not.toContain('ペルソナ)を作る');
    expect(checkDraft(noPersona).issues.filter((i) => i.message.includes('ペルソナ') || i.message.includes('費用の見積もり'))).toEqual([]);
    const r = checkDraft(example.replace(/^- 発表スライドの構成を決める.*\n(?: {2}> .*\n)+/m, ''));
    expect(r.issues.some((i) => i.level === 'warn' && i.message.includes('今後の展望'))).toBe(true);
    expect(r.issues.some((i) => i.level === 'error' && i.message.includes('展望'))).toBe(false);
  });
});
