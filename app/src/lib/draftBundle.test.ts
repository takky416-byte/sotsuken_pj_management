import { describe, expect, it } from 'vitest';
import { parseDraftBundle } from './draftBundle';

const A = '企画名: 椅子(仮)\n# 要件定義\n- 困りごとを決める\n- 機能を絞る\n# 要件定義\n- 一覧を作る';
describe('叩き台のまとめ (チーム・案ごとに分ける)', () => {
  it('区切りの行で、チームと案に分け、企画名と項目数を読む', () => {
    const r = parseDraftBundle(`@@ チームC 案1\n${A}\n\n@@ チーム C 案 2\n企画名: マナー\n# 要件定義\n- 調べる\n@@ チームH 案1\n# 要件定義\n- x`);
    expect(r.errors).toEqual([]);
    expect(r.entries.map((e) => [e.teamId, e.no, e.title, e.items])).toEqual([['C', 1, '椅子(仮)', 3], ['C', 2, 'マナー', 1], ['H', 1, 'Hチーム 案1', 1]]);
  });
  it('区切りが読めない・同じ案が重なる・空は、errors に出す', () => {
    expect(parseDraftBundle('@@ C-1\n# a').errors[0]).toContain('区切りの行が読めません');
    expect(parseDraftBundle('# a\n- b').errors[0]).toContain('先頭に');
    expect(parseDraftBundle(`@@ チームA 案1\n${A}\n@@ チームA 案1\n${A}`).errors).toEqual(['Aチーム 案1: 同じ案が2回あります']);
    expect(parseDraftBundle('@@ チームA 案2\n\n').errors).toEqual(['Aチーム 案2: 中身が空です']);
  });
});
