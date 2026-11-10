// 文章の中の HTML タグ (Obsidian と同じように、一部だけ)。React の要素に直して出すので、HTML 文字列として画面に入れることはない。
// 使えるタグ: <u> <mark> <kbd> <sub> <sup> <small> <b> <strong> <i> <em> <s> <del> <ins> <br>、
//   <span style="color:red; background:#ff0; font-size:120%">、<a href="https://…">、<details><summary>…</summary>…</details>。
// それ以外のタグ (<script> <img> <iframe> <style> など) と、タグの属性 (onclick など)・許可していない style は、通さない (文字のまま出る / 捨てる)。

export type HtmlTag = 'u' | 'mark' | 'kbd' | 'sub' | 'sup' | 'small' | 'span' | 'b' | 'strong' | 'i' | 'em' | 's' | 'del' | 'ins' | 'a';
export type HtmlStyle = { color?: string; background?: string; fontSize?: string; fontWeight?: 'bold' | 'normal'; textDecoration?: 'underline' | 'line-through' | 'none' };

const TAGS = 'u|mark|kbd|sub|sup|small|span|b|strong|i|em|s|del|ins|a';

/** 色の指定 (#ff8800・#f80・rgb(255, 136, 0)・hsl(30, 100%, 50%))。画面に出すときは、この形に合うものだけを使う (任意のCSSは通さない) */
const COLOR_FULL = /^(#[0-9a-fA-F]{3,4}|#[0-9a-fA-F]{6}|#[0-9a-fA-F]{8}|rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*(,\s*(0|1|0?\.\d+)\s*)?\)|hsla?\(\s*\d{1,3}\s*,\s*\d{1,3}%\s*,\s*\d{1,3}%\s*(,\s*(0|1|0?\.\d+)\s*)?\))$/;
export const isColor = (s: string): boolean => COLOR_FULL.test(s);

/** 色の名前 (よく使うものだけ) */
const NAMED = new Set([
  'red', 'blue', 'green', 'orange', 'purple', 'pink', 'gray', 'grey', 'black', 'white', 'yellow', 'brown', 'cyan', 'magenta', 'navy', 'teal',
  'lime', 'maroon', 'olive', 'silver', 'gold', 'crimson', 'coral', 'indigo', 'violet', 'skyblue', 'tomato', 'salmon', 'khaki', 'orchid',
]);
const colorValue = (v: string): string | undefined => { const s = v.trim().toLowerCase(); return NAMED.has(s) || isColor(v.trim()) ? v.trim() : undefined; };

/** style="..." から、許可した項目だけを取り出す (color・background・font-size・font-weight・text-decoration)。値も、決まった形だけ */
export function sanitizeStyle(style: string): HtmlStyle | undefined {
  const out: HtmlStyle = {};
  for (const decl of style.split(';')) {
    const i = decl.indexOf(':');
    if (i < 0) continue;
    const prop = decl.slice(0, i).trim().toLowerCase();
    const val = decl.slice(i + 1).trim();
    if (prop === 'color') { const c = colorValue(val); if (c) out.color = c; }
    else if (prop === 'background' || prop === 'background-color') { const c = colorValue(val); if (c) out.background = c; }
    else if (prop === 'font-size') {
      const p = /^(\d{2,3})%$/.exec(val); const e = /^(\d(?:\.\d)?)em$/.exec(val);
      if (p && +p[1] >= 50 && +p[1] <= 300) out.fontSize = val;
      else if (e && +e[1] >= 0.5 && +e[1] <= 3) out.fontSize = val;
    } else if (prop === 'font-weight') { if (/^(bold|600|700|800|900)$/i.test(val)) out.fontWeight = 'bold'; else if (/^(normal|400)$/i.test(val)) out.fontWeight = 'normal'; }
    else if (prop === 'text-decoration') { const d = val.toLowerCase(); if (d === 'underline' || d === 'line-through' || d === 'none') out.textDecoration = d; }
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

const attrsOf = (s: string): Record<string, string> => {
  const out: Record<string, string> = {};
  for (const m of s.matchAll(/([a-zA-Z-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'<>]+))/g)) out[m[1].toLowerCase()] = m[2] ?? m[3] ?? m[4] ?? '';
  return out;
};

export type HtmlHit =
  | { index: number; length: number; br: true }
  | { index: number; length: number; br?: false; tag: HtmlTag; style?: HtmlStyle; href?: string; inner: string };

const SAFE_HREF = /^https?:\/\/[^\s<>()"']+$/;

/** text の中で、最初に見つかる、使えるタグ (対になっているもの) を探す。<br> は、1つで。見つからなければ null (そのまま文字で出す) */
export function findHtml(text: string): HtmlHit | null {
  const open = new RegExp(`<(${TAGS})((?:\\s[^<>]*)?)>|<br\\s*/?>`, 'gi');
  for (let m = open.exec(text); m; m = open.exec(text)) {
    if (/^<br/i.test(m[0])) return { index: m.index, length: m[0].length, br: true };
    const tag = m[1].toLowerCase() as HtmlTag;
    // 同じ名前のタグの入れ子を数えて、対になる閉じタグを探す
    const re = new RegExp(`<(/?)(${tag})((?:\\s[^<>]*)?)>`, 'gi');
    re.lastIndex = m.index + m[0].length;
    let depth = 1;
    let close: RegExpExecArray | null = null;
    for (let c = re.exec(text); c; c = re.exec(text)) {
      depth += c[1] ? -1 : 1;
      if (depth === 0) { close = c; break; }
    }
    if (!close) continue; // 閉じていないタグは、文字のまま
    const attrs = attrsOf(m[2] ?? '');
    const hit: HtmlHit = { index: m.index, length: close.index + close[0].length - m.index, tag, inner: text.slice(m.index + m[0].length, close.index) };
    if (tag === 'span' && attrs.style) hit.style = sanitizeStyle(attrs.style);
    if (tag === 'a') {
      if (!attrs.href || !SAFE_HREF.test(attrs.href.trim())) continue; // http(s) 以外 (javascript: など) のリンクは、作らない (文字のまま)
      hit.href = attrs.href.trim();
    }
    return hit;
  }
  return null;
}
