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

describe('HTML タグ (使えるものだけ)', () => {
  const html = (s: string) => parseInline(s);
  test('<u> <mark> <kbd> <sub> <sup> など。入れ子と、中の Markdown も効く', () => {
    expect(html('a <u>下線</u> b')).toEqual([{ t: 'text', s: 'a ' }, { t: 'html', tag: 'u', c: [{ t: 'text', s: '下線' }] }, { t: 'text', s: ' b' }]);
    expect(html('<mark>**大事**</mark>')).toEqual([{ t: 'html', tag: 'mark', c: [{ t: 'b', c: [{ t: 'text', s: '大事' }] }] }]);
    expect(html('H<sub>2</sub>O')).toMatchObject([{ t: 'text', s: 'H' }, { t: 'html', tag: 'sub' }, { t: 'text', s: 'O' }]);
    expect(html('<u><u>x</u></u>')).toEqual([{ t: 'html', tag: 'u', c: [{ t: 'html', tag: 'u', c: [{ t: 'text', s: 'x' }] }] }]);
  });
  test('<br> は改行。閉じていないタグは、文字のまま', () => {
    expect(html('a<br>b<br/>c').filter((x) => x.t === 'br')).toHaveLength(2);
    expect(html('<u>閉じていない')).toEqual([{ t: 'text', s: '<u>閉じていない' }]);
  });
  test('<span style> は、color・background・font-size・font-weight・text-decoration だけ。値も決まった形だけ', () => {
    expect(html('<span style="color:red; background:#ff0; font-size:120%">赤</span>')).toEqual([
      { t: 'html', tag: 'span', style: { color: 'red', background: '#ff0', fontSize: '120%' }, c: [{ t: 'text', s: '赤' }] },
    ]);
    expect(html('<span style="color: rgb(255, 0, 0)">x</span>')[0]).toMatchObject({ style: { color: 'rgb(255, 0, 0)' } });
    // 許可していない項目・値は、捨てる
    const bad = html('<span style="position:fixed; top:0; background:url(javascript:alert(1)); color:expression(alert(1)); font-size:9999%">x</span>')[0];
    expect(bad).toMatchObject({ t: 'html', tag: 'span' });
    expect((bad as { style?: unknown }).style).toBeUndefined();
  });
  test('<a href> は、http(s) だけ。javascript: などは、リンクにならず、文字のまま', () => {
    expect(html('<a href="https://example.com/x">資料</a>')).toEqual([{ t: 'html', tag: 'a', href: 'https://example.com/x', c: [{ t: 'text', s: '資料' }] }]);
    expect(JSON.stringify(html('<a href="javascript:alert(1)">x</a>'))).not.toContain('"href"');
    expect(html('<a href="javascript:alert(1)">x</a>').some((x) => x.t === 'html')).toBe(false);
    expect(html('<a href="data:text/html,<script>alert(1)</script>">x</a>').some((x) => x.t === 'html' && x.tag === 'a')).toBe(false);
  });
  test('使えないタグ・属性は、通さない (script・img・iframe・svg・style・onclick など)', () => {
    for (const s of ['<script>alert(1)</script>', '<img src=x onerror=alert(1)>', '<iframe src=x></iframe>', '<svg onload=alert(1)>', '<style>*{}</style>', '<object data=x></object>']) {
      expect(html(s).every((x) => x.t === 'text'), s).toBe(true);
    }
    // URL が入っていると、ふつうのURLと同じに、リンクにはなる (<iframe> という要素にはならない)
    expect(html('<iframe src="https://evil.example/x"></iframe>').some((x) => x.t === 'html')).toBe(false);
    // 使えるタグに付いた onclick などの属性は、捨てる (要素にも、属性にもならない)
    const u = html('<u onclick="alert(1)" class="x">z</u>');
    expect(u).toEqual([{ t: 'html', tag: 'u', c: [{ t: 'text', s: 'z' }] }]);
  });
  test('<details> は、折りたたみ。<summary> が見出し。open で開いたまま。中にも Markdown が書ける', () => {
    const b = parseMarkdown('<details>\n<summary>詳しく</summary>\n\n- a\n- b\n\n</details>\n\n後の文');
    expect(b.map((x) => x.t)).toEqual(['details', 'p']);
    expect(b[0]).toMatchObject({ t: 'details', open: false, summary: [{ t: 'text', s: '詳しく' }] });
    expect((b[0] as { body: { t: string }[] }).body.map((x) => x.t)).toEqual(['ul']);
    expect(parseMarkdown('<details open>\n中身\n</details>')[0]).toMatchObject({ t: 'details', open: true });
    expect(parseMarkdown('<details>\n閉じていない').some((x) => x.t === 'details')).toBe(false);
  });
});
