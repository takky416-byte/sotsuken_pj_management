import { describe, expect, it } from 'vitest';
import { outlineProjectName, parseOutline } from './outline';

describe('叩き台の先頭の「企画名: …」', () => {
  const text = '企画名: 立たせる椅子(仮)\n# 企画の具体化\n- 困りごとを決める\n  > やること: 聞く';
  it('企画名として読み、項目にはしない', () => {
    expect(outlineProjectName(text)).toBe('立たせる椅子(仮)');
    expect(parseOutline(text).map((n) => n.title)).toEqual(['企画の具体化', '困りごとを決める']);
  });
  it('全角コロンも読む。先頭にないとき・ないときは空', () => {
    expect(outlineProjectName('企画名：物理WBS\n# 要件定義')).toBe('物理WBS');
    expect(outlineProjectName('# 要件定義\n企画名: x')).toBe('');
    expect(outlineProjectName('')).toBe('');
  });
});
