import { describe, expect, test } from 'vitest';
import { parseInline, parseMarkdown } from './markdown';

describe('parseInline', () => {
  test('太字・斜体・取り消し線・コード', () => {
    expect(parseInline('a **b** *c* ~~d~~ `e`')).toEqual([
      { t: 'text', s: 'a ' }, { t: 'b', c: [{ t: 'text', s: 'b' }] }, { t: 'text', s: ' ' }, { t: 'i', c: [{ t: 'text', s: 'c' }] },
      { t: 'text', s: ' ' }, { t: 's', c: [{ t: 'text', s: 'd' }] }, { t: 'text', s: ' ' }, { t: 'code', s: 'e' },
    ]);
  });
  test('リンクは、http(s)だけ。そのままのURLもリンクになり、文末の句読点は含めない。javascript: は、ただの文字', () => {
    expect(parseInline('[資料](https://example.com/a)')).toEqual([{ t: 'a', href: 'https://example.com/a', c: [{ t: 'text', s: '資料' }] }]);
    expect(parseInline('見て https://example.com/x。')).toEqual([{ t: 'text', s: '見て ' }, { t: 'a', href: 'https://example.com/x', c: [{ t: 'text', s: 'https://example.com/x' }] }, { t: 'text', s: '。' }]);
    expect(parseInline('[x](javascript:alert(1))').every((x) => x.t !== 'a')).toBe(true);
  });
  test('HTMLは、ただの文字のまま (要素にならない)', () => {
    expect(parseInline('<img src=x onerror=alert(1)>')).toEqual([{ t: 'text', s: '<img src=x onerror=alert(1)>' }]);
  });
  test('記号だけの * や ** は、そのまま', () => {
    expect(parseInline('2 * 3 = 6')).toEqual([{ t: 'text', s: '2 * 3 = 6' }]);
  });
});

describe('parseMarkdown', () => {
  test('段落(改行は<br>)・見出し・箇条書き・番号つき・引用・コードのかたまり', () => {
    const b = parseMarkdown('# 見出し\n1行目\n2行目\n\n- a\n- b\n\n1. x\n2. y\n\n> 引用\n\n```\ncode **not bold**\n```');
    expect(b.map((x) => x.t)).toEqual(['h', 'p', 'ul', 'ol', 'quote', 'code']);
    expect(b[1]).toEqual({ t: 'p', c: [{ t: 'text', s: '1行目' }, { t: 'br' }, { t: 'text', s: '2行目' }] });
    expect(b[2]).toMatchObject({ t: 'ul', items: [[{ t: 'text', s: 'a' }], [{ t: 'text', s: 'b' }]] });
    expect(b[5]).toEqual({ t: 'code', s: 'code **not bold**' });
  });
  test('ふつうの文章は、そのまま1つの段落', () => {
    expect(parseMarkdown('ER図を3つ作った')).toEqual([{ t: 'p', c: [{ t: 'text', s: 'ER図を3つ作った' }] }]);
    expect(parseMarkdown('')).toEqual([]);
  });
});
