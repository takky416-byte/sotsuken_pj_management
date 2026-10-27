import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { outlineProjectName, parseOutline } from './outline';

describe('叩き台の先頭の「企画名: …」', () => {
  const text = '企画名: 立たせる椅子(仮)\n# 要件定義\n- 困りごとを決める\n  > やること: 聞く';
  it('企画名として読み、項目にはしない', () => {
    expect(outlineProjectName(text)).toBe('立たせる椅子(仮)');
    expect(parseOutline(text).map((n) => n.title)).toEqual(['要件定義', '困りごとを決める']);
  });
  it('全角コロンも読む。先頭にないとき・ないときは空', () => {
    expect(outlineProjectName('企画名：物理WBS\n# 要件定義')).toBe('物理WBS');
    expect(outlineProjectName('# 要件定義\n企画名: x')).toBe('');
    expect(outlineProjectName('')).toBe('');
  });
});

import { fillPeriods } from './draftSchedule';
describe('先頭の「企画名: …」があっても、期間を入れる行がずれない', () => {
  it('fillPeriods', () => {
    const body = '# 要件定義\n- 困りごとを決める\n  > やること: 聞く\n  > できあがり: 書けた\n- 機能を絞る\n  > やること: 絞る\n  > できあがり: 一覧がある';
    const withName = fillPeriods(`企画名: 椅子(仮)\n${body}`);
    const without = fillPeriods(body);
    expect(withName.startsWith('企画名: 椅子(仮)\n# 要件定義')).toBe(true);
    expect(withName.split('\n').slice(1).join('\n')).toBe(without);
    expect((withName.match(/> 期間:/g) ?? []).length).toBe(2);
  });
});

import { checkDraft } from './draftCheck';
import { outlineMeta } from './outline';
describe('先頭の見出し行 (企画名・種別・データ保存)', () => {
  const ex = readFileSync(new URL('../../../docs/wbs-drafts/example-soft.md', import.meta.url), 'utf8');
  it('読める。項目にはならず、期間を入れる行もずれない', () => {
    const t = `企画名: 椅子(仮)\n種別: ハード\nデータ保存: なし\n# 要件定義\n- 困りごとを決める\n  > やること: 聞く\n  > できあがり: 書けた`;
    expect(outlineMeta(t)).toEqual({ name: '椅子(仮)', kind: 'ハード', dataSaved: false });
    expect(parseOutline(t).map((n) => n.title)).toEqual(['要件定義', '困りごとを決める']);
    const filled = fillPeriods(t);
    expect(filled.split('\n').slice(0, 3)).toEqual(['企画名: 椅子(仮)', '種別: ハード', 'データ保存: なし']);
    expect(outlineMeta('# a\n企画名: x')).toEqual({ name: '' });
    expect(outlineMeta('種別: ソフト\nデータ保存: あり').dataSaved).toBe(true);
  });
  it('種別があれば、画面のチェックより優先する。データ保存: なし なら、ER図・テーブル定義書の注意を出さない', () => {
    const warns = (t: string, k?: 'ソフト' | 'ハード') => checkDraft(t, k).issues.map((i) => i.message);
    const base = `${ex}`;
    expect(warns(base).some((m) => m.includes('ER図'))).toBe(false); // 見本は、ER図ありのまま
    const noEr = base.replace(/^- ER図を描く\n(?: {2}> .*\n)+/m, '').replace(/^- テーブル定義書を書く\n(?: {2}> .*\n)+/m, '');
    expect(warns(noEr).some((m) => m.includes('ER図'))).toBe(true);
    expect(warns(`データ保存: なし\n${noEr}`).some((m) => m.includes('ER図') || m.includes('テーブル定義'))).toBe(false);
    expect(warns(`種別: ハード\n${base}`, 'ソフト').some((m) => m.includes('回路図'))).toBe(true); // ハードとして点検する
    expect(warns(`種別: ソフト\n${base}`, 'ハード').some((m) => m.includes('回路図'))).toBe(false);
  });
});
