import { describe, expect, test } from 'vitest';
import { colorsIn, isColor, parseInline, parseMarkdown } from './markdown';

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

describe('下線', () => {
  test('++文字++ は下線。太字との組み合わせもできる。++ だけは、そのまま', () => {
    expect(parseInline('a ++b++ c')).toEqual([{ t: 'text', s: 'a ' }, { t: 'u', c: [{ t: 'text', s: 'b' }] }, { t: 'text', s: ' c' }]);
    expect(parseInline('++**x**++')).toEqual([{ t: 'u', c: [{ t: 'b', c: [{ t: 'text', s: 'x' }] }] }]);
    expect(parseInline('1 ++ 2')).toEqual([{ t: 'text', s: '1 ++ 2' }]);
  });
  test('先生の連絡事項の例: \\ のパス・[ ] ・・ の行が、そのまま出る', () => {
    const b = parseMarkdown('◎**設計書**\n\\\\f33t2\\pub\n・[成果物を提出]ボタン');
    expect(b).toHaveLength(1);
    expect(JSON.stringify(b)).toContain('f33t2');
  });
});

describe('parseMarkdown', () => {
  test('段落(改行は<br>)・見出し・箇条書き・番号つき・引用・コードのかたまり', () => {
    const b = parseMarkdown('# 見出し\n1行目\n2行目\n\n- a\n- b\n\n1. x\n2. y\n\n> 引用\n\n```\ncode **not bold**\n```');
    expect(b.map((x) => x.t)).toEqual(['h', 'p', 'ul', 'ol', 'quote', 'code']);
    expect(b[1]).toEqual({ t: 'p', c: [{ t: 'text', s: '1行目' }, { t: 'br' }, { t: 'text', s: '2行目' }] });
    expect(b[2]).toMatchObject({ t: 'ul', items: [{ c: [{ t: 'text', s: 'a' }], level: 0 }, { c: [{ t: 'text', s: 'b' }], level: 0 }] });
    expect(b[5]).toEqual({ t: 'code', s: 'code **not bold**' });
  });
  test('ふつうの文章は、そのまま1つの段落', () => {
    expect(parseMarkdown('ER図を3つ作った')).toEqual([{ t: 'p', c: [{ t: 'text', s: 'ER図を3つ作った' }] }]);
    expect(parseMarkdown('')).toEqual([]);
  });
});

describe('チェックリスト・入れ子・表・リンクのカード', () => {
  test('- [ ] / - [x] は、チェックリスト。字下げで入れ子 (2文字 = 1段)', () => {
    const b = parseMarkdown('- [ ] やる\n- [x] 済み\n  - 入れ子\n- 普通');
    expect(b).toHaveLength(1);
    expect(b[0]).toMatchObject({ t: 'ul', items: [
      { c: [{ t: 'text', s: 'やる' }], level: 0, check: false },
      { c: [{ t: 'text', s: '済み' }], level: 0, check: true },
      { c: [{ t: 'text', s: '入れ子' }], level: 1 },
      { c: [{ t: 'text', s: '普通' }], level: 0 },
    ] });
  });
  test('表: 見出し・区切り・本文。配置の指定 (:--: など) も読む。区切りの行がなければ、ただの文', () => {
    const b = parseMarkdown('| 名前 | 数 |\n| :-- | --: |\n| A | **3** |\n| B | 4 |\n\n後の文');
    expect(b.map((x) => x.t)).toEqual(['table', 'p']);
    expect(b[0]).toMatchObject({ t: 'table', align: ['left', 'right'] });
    expect((b[0] as { rows: unknown[] }).rows).toHaveLength(2);
    expect(parseMarkdown('| a | b |').map((x) => x.t)).toEqual(['p']);
  });
  test('URLだけの行は、カード。文の中のURLは、ふつうのリンク', () => {
    expect(parseMarkdown('資料です\nhttps://drive.google.com/drive/folders/abc\n\n見て https://example.com/x').map((x) => x.t)).toEqual(['p', 'card', 'p']);
    expect(parseMarkdown('https://example.com/a。')).toEqual([{ t: 'card', href: 'https://example.com/a' }]);
  });
});

describe('色見本', () => {
  test('#ff8800・rgb()・hsl() は色。`#f80` のようにコードの記号で囲めば、3桁も色。#123 などの数字は、ただの文字', () => {
    expect(parseInline('赤は #ff0000 です')).toEqual([{ t: 'text', s: '赤は ' }, { t: 'color', s: '#ff0000' }, { t: 'text', s: ' です' }]);
    expect(parseInline('rgb(255, 136, 0)')).toEqual([{ t: 'color', s: 'rgb(255, 136, 0)' }]);
    expect(parseInline('hsl(30, 100%, 50%)')).toEqual([{ t: 'color', s: 'hsl(30, 100%, 50%)' }]);
    expect(parseInline('`#f80`')).toEqual([{ t: 'color', s: '#f80' }]);
    expect(parseInline('#f80')).toEqual([{ t: 'text', s: '#f80' }]);
    expect(parseInline('課題 #123 を直した')).toEqual([{ t: 'text', s: '課題 #123 を直した' }]);
    expect(parseInline('#ff00ffzz')).toEqual([{ t: 'text', s: '#ff00ffzz' }]);
  });
  test('色にならない書き方は、そのまま (任意のCSSは通さない)', () => {
    expect(parseInline('rgb(1,2,expression(alert(1)))').some((x) => x.t === 'color')).toBe(false);
    expect(isColor('red')).toBe(false);
    expect(isColor('#ff00')).toBe(true);
    expect(isColor('url(x)')).toBe(false);
  });
  test('colorsIn: 出てくる順・重複なし・コードのかたまりの中は除く', () => {
    expect(colorsIn('#ff0000 と #00ff00 と #ff0000\n```\n#0000ff\n```\n`#f80`')).toEqual(['#ff0000', '#00ff00', '#f80']);
  });
});
