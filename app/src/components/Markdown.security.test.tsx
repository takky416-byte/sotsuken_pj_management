import { describe, expect, test } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { Markdown } from './Markdown';

// スクリプト攻撃への備え: 悪意のある文章を、実際に画面の HTML にして、危険なものが出ないことを確かめる。
const render = (s: string) => renderToStaticMarkup(<Markdown text={s} />);

const ATTACKS = [
  '<script>alert(1)</script>', '<SCRIPT SRC=//evil/x.js></SCRIPT>', '<img src=x onerror=alert(1)>', '<IMG SRC="javascript:alert(1)">',
  '<svg onload=alert(1)>', '<svg><script>alert(1)</script></svg>', '<iframe src="javascript:alert(1)"></iframe>', '<iframe srcdoc="<script>alert(1)</script>">',
  '<object data="javascript:alert(1)">', '<embed src=x>', '<link rel=stylesheet href=//evil/x.css>', '<style>body{display:none}</style>', '<meta http-equiv=refresh content="0;url=//evil">',
  '<base href="//evil/">', '<form action="//evil"><input name=p></form>', '<math><mtext></form><form><mglyph><style></math><img src onerror=alert(1)>',
  '[x](javascript:alert(1))', '[x](JaVaScRiPt:alert(1))', '[x](data:text/html,<script>alert(1)</script>)', '[x](vbscript:msgbox(1))', '[x]( javascript:alert(1))',
  '<a href="javascript:alert(1)">x</a>', '<a href=" javascript:alert(1)">x</a>', '<a href="&#106;avascript:alert(1)">x</a>', '<a href="data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==">x</a>',
  '<a href="https://ok.example/" onclick="alert(1)" onmouseover=alert(1)>x</a>', '<u onclick="alert(1)">x</u>', '<mark onmouseover=alert(1) style="x">x</mark>',
  '<span style="background:url(javascript:alert(1))">x</span>', '<span style="color:expression(alert(1))">x</span>', '<span style="position:fixed;top:0;left:0;width:100%;height:100%;background:red">x</span>',
  '<span style="color:red;}</style><script>alert(1)</script>">x</span>', '<span style="font-size:9999%">x</span>', '<span style="behavior:url(x.htc)">x</span>',
  '<span style="color:#f00" onclick="alert(1)">x</span>', '<details open ontoggle=alert(1)>', '<details ontoggle=alert(1) open>\n<summary onclick=alert(1)>a</summary>\nb\n</details>',
  '`<script>alert(1)</script>`', '```\n<script>alert(1)</script>\n```', '| <img src=x onerror=alert(1)> | b |\n| --- | --- |\n| <script>alert(1)</script> | d |',
  '- <img src=x onerror=alert(1)>', '> <script>alert(1)</script>', '# <img src=x onerror=alert(1)>', '**<script>alert(1)</script>**', '++<img src=x onerror=alert(1)>++',
  'rgb(1,2,3);background:url(javascript:alert(1))', '#ff0000"><script>alert(1)</script>', 'https://example.com/"><script>alert(1)</script>', 'https://example.com/\' onmouseover=\'alert(1)',
  '<<script>script>alert(1)<</script>/script>', '<scr<script>ipt>alert(1)</scr</script>ipt>', '<u><script>alert(1)</script></u>', '<mark><img src=x onerror=alert(1)></mark>',
];

// 出てはいけないもの。要素 (<script <img <iframe など) と、イベントの属性 (onxxx=)、javascript: / data: のリンク、style の url( / expression(
// (文字として出ている `&lt;img onerror=...` は、HTML の要素ではないので、問題ない。本物のタグ (<...>) の中だけを調べる)
const REAL_TAG = /<[a-zA-Z][^>]*>/g;
const DANGEROUS = [
  /<(script|iframe|svg|object|embed|link|style|meta|base|form|input|math|video|audio|source|template)[\s>/]/i,
  /\son[a-z]+\s*=/i,
  /(href|src|action|formaction|xlink:href)\s*=\s*"\s*(javascript|data|vbscript):/i,
  /style="[^"]*(url\(|expression|javascript|position|behavior)/i,
];
// <img> は、リンクのカード (自前の部品) のサムネイル・ファビコンだけ。出どころは、Google の決まった場所に限る
const IMG_OK = /^<img (class="link-favicon" )?src="https:\/\/(drive\.google\.com\/thumbnail\?id=[\w-]+&amp;sz=w320|www\.google\.com\/s2\/favicons\?domain=[\w.%-]+&amp;sz=64)" alt="" loading="lazy" referrerPolicy="no-referrer"\/?>$/;
const imgsOk = (html: string): string[] => (html.match(/<img[\s>/][^>]*>/gi) ?? []).filter((t) => !IMG_OK.test(t));
const tagsOnly = (html: string): string => (html.match(REAL_TAG) ?? []).join('\n');

describe('悪意のある文章を出しても、危険な HTML は出ない', () => {
  for (const a of ATTACKS) {
    test(a.slice(0, 60).replace(/\n/g, '⏎'), () => {
      const h = render(a);
      for (const re of DANGEROUS) expect(tagsOnly(h), `${re}`).not.toMatch(re);
      expect(imgsOk(h), '許可していない <img>').toEqual([]);
      // すべてのリンクは http(s)。target=_blank には noopener がある
      for (const m of h.matchAll(/<a [^>]*>/g)) {
        expect(m[0]).toMatch(/href="https?:\/\//);
        expect(m[0]).toMatch(/rel="noopener noreferrer"/);
      }
      // style に入るのは、許可した項目だけ
      for (const m of h.matchAll(/style="([^"]*)"/g)) {
        for (const decl of m[1].split(';').filter(Boolean)) expect(decl.split(':')[0].trim()).toMatch(/^(color|background|font-size|font-weight|text-decoration)$/);
      }
    });
  }

  test('ランダムな組み合わせ (2000通り) でも、危険な HTML は出ない', () => {
    // 毎回同じ結果になるように、決まった乱数を使う
    let seed = 20261110;
    const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
    const parts = [
      ...ATTACKS, '<u>', '</u>', '<mark>', '</mark>', '<span style="', '">', '</span>', '<a href="', '</a>', '<details>', '</details>', '<summary>', '</summary>',
      '`', '```', '**', '++', '~~', '|', '---', '\n', ' ', '#', '> ', '- ', '[', '](', ')', '"', "'", '<', '>', '&lt;', '&#60;script&#62;', 'onerror=', 'javascript:', 'https://example.com/', 'x',
    ];
    for (let n = 0; n < 2000; n++) {
      const s = Array.from({ length: 2 + Math.floor(rnd() * 8) }, () => parts[Math.floor(rnd() * parts.length)]).join('');
      const h = render(s);
      for (const re of DANGEROUS) expect(tagsOnly(h), `${s} → ${re}`).not.toMatch(re);
      expect(imgsOk(h), `${s} → <img>`).toEqual([]);
    }
  });

  test('使えるタグは、ちゃんと要素になる (<u> <mark> <kbd> <span style> <a> <details>)', () => {
    const h = render('<u>下線</u> <mark>印</mark> <kbd>Ctrl</kbd> <span style="color:red">赤</span> <a href="https://example.com/">リンク</a>\n\n<details>\n<summary>詳しく</summary>\n中身\n</details>');
    expect(h).toContain('<u>下線</u>');
    expect(h).toContain('<mark>印</mark>');
    expect(h).toContain('<kbd>Ctrl</kbd>');
    expect(h).toContain('<span style="color:red">赤</span>');
    expect(h).toContain('<a href="https://example.com/" target="_blank" rel="noopener noreferrer">リンク</a>');
    expect(h).toContain('<details class="md-details"><summary>詳しく</summary>');
  });
});
