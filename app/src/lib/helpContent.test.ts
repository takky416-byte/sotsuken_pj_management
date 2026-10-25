import { describe, expect, it } from 'vitest';
import { helpFor } from './helpContent';
import { TONES, type ToneId } from './tone';

const text = (id: ToneId) => helpFor(id).sections.flatMap((s) => [s.q, ...s.blocks.flatMap((b) => ('p' in b ? [b.p] : 'ul' in b ? b.ul : b.ol))]).join('\n');

describe('使い方ページ (トーンごと)', () => {
  it('どのトーンでも、項目の id・順番・見出しが同じ', () => {
    const base = helpFor('standard').sections.map((s) => [s.id, s.q]);
    for (const { id } of TONES) expect(helpFor(id).sections.map((s) => [s.id, s.q]), id).toEqual(base);
  });
  it('どのトーンでも、実際の画面のボタン名・画面名が入っている', () => {
    for (const { id } of TONES) {
      const t = text(id);
      for (const label of ['＋ WBSにない作業をした', 'ガントチャートで編集する', '作業ログを送信', 'ホーム画面に追加', 'デスクトップ用ショートカットを保存', '詰まっていること', 'WBS外の作業(あとから追加)', 'Excelで保存', 'PDFで保存(印刷)', 'ぜんぶ表示', '次へ']) expect(t, `${id}:${label}`).toContain(label);
      expect(t, id).toContain('10字以上');
    }
  });
  it('標準とシンプルには、感嘆符も絵文字もない。シンプルは短い', () => {
    const emoji = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;
    for (const id of ['standard', 'simple'] as const) { expect(text(id), id).not.toMatch(/[!！]/); expect(text(id), id).not.toMatch(emoji); }
    expect(text('simple').length).toBeLessThan(text('standard').length);
    expect(text('casual')).not.toBe(text('standard'));
  });
  it('「先生に相談する」ようには書かない (相談はチームで)', () => {
    for (const { id } of TONES) expect(text(id), id).not.toMatch(/先生に相談/);
  });
});
