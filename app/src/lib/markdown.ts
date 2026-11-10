// 作業ログの説明を、画面に出すときの Markdown の読み取り。HTML は通さない (React の要素に直して出す)。
// 使えるのは、見出し (# ## ###)・箇条書き (- * 1.。字下げで入れ子、- [ ] / - [x] でチェックリスト)・引用 (>)・コードのかたまり (```)・表 (| a | b |)・太字 (**)・下線 (++)・斜体 (*)・取り消し線 (~~)・コード (`)・リンク ([文字](https://…) と、そのままのURL)。
// URLだけの行は、リンクのカード (Googleドライブなどの種類と、サムネイル) として出す。
// 1回の改行は、そのまま改行として出す (作業ログは、改行しながら書くことが多いため)。

export type Inline =
  | { t: 'text'; s: string }
  | { t: 'b' | 'i' | 's' | 'u'; c: Inline[] }
  | { t: 'code'; s: string }
  | { t: 'color'; s: string }
  | { t: 'a'; href: string; c: Inline[] }
  | { t: 'br' };

/** 箇条書きの1項目。level は字下げの深さ (0〜3)。check は、チェックリストのとき (true=済み) */
export type ListItem = { c: Inline[]; level: number; check?: boolean };

export type Block =
  | { t: 'p'; c: Inline[] }
  | { t: 'h'; level: 1 | 2 | 3; c: Inline[] }
  | { t: 'ul' | 'ol'; items: ListItem[] }
  | { t: 'quote'; c: Inline[] }
  | { t: 'code'; s: string }
  | { t: 'table'; head: Inline[][]; rows: Inline[][][]; align: ('left' | 'center' | 'right' | null)[] }
  | { t: 'card'; href: string };

const BARE_URL = /^https?:\/\/[^\s<>()]+$/;
const TABLE_ROW = /^\s*\|.*\|\s*$/;
const TABLE_SEP = /^\s*\|(\s*:?-{1,}:?\s*\|)+\s*$/;
const cells = (line: string): string[] => line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
const alignOf = (c: string): 'left' | 'center' | 'right' | null => (/^:-+:$/.test(c) ? 'center' : /^-+:$/.test(c) ? 'right' : /^:-+$/.test(c) ? 'left' : null);

/** 色の指定 (#ff8800・#f80・rgb(255, 136, 0)・hsl(30, 100%, 50%))。画面に出すときは、この形に合うものだけを使う (任意のCSSは通さない) */
const COLOR_FULL = /^(#[0-9a-fA-F]{3,4}|#[0-9a-fA-F]{6}|#[0-9a-fA-F]{8}|rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*(,\s*(0|1|0?\.\d+)\s*)?\)|hsla?\(\s*\d{1,3}\s*,\s*\d{1,3}%\s*,\s*\d{1,3}%\s*(,\s*(0|1|0?\.\d+)\s*)?\))$/;
export const isColor = (s: string): boolean => COLOR_FULL.test(s);

const TOKEN = /(`[^`\n]+`)|(\*\*[^*\n]+?\*\*)|(~~[^~\n]+?~~)|(\*[^*\s][^*\n]*?\*)|(\[[^\]\n]+\]\(https?:\/\/[^\s)]+\))|(https?:\/\/[^\s<>()]+)|(\+\+[^+\n]+?\+\+)|(#[0-9a-fA-F]{6}(?:[0-9a-fA-F]{2})?(?![0-9a-zA-Z_]))|((?:rgba?|hsla?)\([^()\n]{5,40}\))/;

/** 文章の中の、色の指定を、出てくる順に (重複なし・最大 n 個)。入力欄の「色見本」に使う */
export function colorsIn(text: string, n = 8): string[] {
  const found: string[] = [];
  const walk = (xs: Inline[]) => xs.forEach((x) => { if (x.t === 'color' && !found.includes(x.s)) found.push(x.s); else if ('c' in x) walk(x.c); });
  let fence = false;
  for (const line of text.split('\n')) {
    if (/^```/.test(line)) { fence = !fence; continue; }
    if (!fence) walk(parseInline(line));
  }
  return found.slice(0, n);
}

/** 1行の中の、太字・コード・リンクなど */
export function parseInline(text: string): Inline[] {
  const out: Inline[] = [];
  let rest = text;
  while (rest.length > 0) {
    const m = TOKEN.exec(rest);
    if (!m) { out.push({ t: 'text', s: rest }); break; }
    if (m.index > 0) out.push({ t: 'text', s: rest.slice(0, m.index) });
    const tok = m[0];
    if (m[1]) out.push(isColor(tok.slice(1, -1)) ? { t: 'color', s: tok.slice(1, -1) } : { t: 'code', s: tok.slice(1, -1) }); // `#f80` のように、コードの記号で囲めば、3桁の色も色見本になる
    else if (m[8] || m[9]) out.push(isColor(tok) ? { t: 'color', s: tok } : { t: 'text', s: tok });
    else if (m[2]) out.push({ t: 'b', c: parseInline(tok.slice(2, -2)) });
    else if (m[3]) out.push({ t: 's', c: parseInline(tok.slice(2, -2)) });
    else if (m[4]) out.push({ t: 'i', c: parseInline(tok.slice(1, -1)) });
    else if (m[7]) out.push({ t: 'u', c: parseInline(tok.slice(2, -2)) });
    else if (m[5]) {
      const lm = /^\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)$/.exec(tok)!;
      out.push({ t: 'a', href: lm[2], c: parseInline(lm[1]) });
    } else {
      const url = tok.replace(/[、。,.!?]+$/, ''); // 文の終わりの句読点は、リンクに入れない
      out.push({ t: 'a', href: url, c: [{ t: 'text', s: url }] });
      rest = rest.slice(m.index + url.length);
      continue;
    }
    rest = rest.slice(m.index + tok.length);
  }
  return out;
}

const withBreaks = (lines: string[]): Inline[] => lines.flatMap((l, i) => (i === 0 ? parseInline(l) : [{ t: 'br' } as Inline, ...parseInline(l)]));

/** 文章全体を、ブロックに分ける */
export function parseMarkdown(src: string): Block[] {
  const lines = src.replace(/\r\n?/g, '\n').split('\n');
  const blocks: Block[] = [];
  let para: string[] = [];
  const flush = () => { if (para.length) { blocks.push({ t: 'p', c: withBreaks(para) }); para = []; } };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^```/.test(line)) {
      flush();
      const code: string[] = [];
      for (i++; i < lines.length && !/^```/.test(lines[i]); i++) code.push(lines[i]);
      blocks.push({ t: 'code', s: code.join('\n') });
      continue;
    }
    const h = /^(#{1,3})\s+(.+?)\s*#*\s*$/.exec(line);
    if (h) { flush(); blocks.push({ t: 'h', level: h[1].length as 1 | 2 | 3, c: parseInline(h[2]) }); continue; }
    const q = /^>\s?(.*)$/.exec(line);
    if (q) { flush(); const last = blocks.at(-1); if (last?.t === 'quote') last.c.push({ t: 'br' }, ...parseInline(q[1])); else blocks.push({ t: 'quote', c: parseInline(q[1]) }); continue; }
    // 表: 見出しの行と、その下の区切りの行 (|---|---|) が続くとき
    if (TABLE_ROW.test(line) && i + 1 < lines.length && TABLE_SEP.test(lines[i + 1])) {
      flush();
      const head = cells(line);
      const align = cells(lines[i + 1]).map(alignOf);
      const rows: Inline[][][] = [];
      for (i += 2; i < lines.length && TABLE_ROW.test(lines[i]); i++) rows.push(cells(lines[i]).map((c) => parseInline(c)));
      i--;
      blocks.push({ t: 'table', head: head.map((c) => parseInline(c)), rows, align });
      continue;
    }
    const ul = /^(\s*)[-*+]\s+(.*)$/.exec(line);
    const ol = /^(\s*)\d+[.)]\s+(.*)$/.exec(line);
    if (ul || ol) {
      flush();
      const kind = ul ? 'ul' : 'ol';
      const m = (ul ?? ol)!;
      const level = Math.min(3, Math.floor(m[1].replace(/\t/g, '  ').length / 2));
      const task = /^\[( |x|X)\]\s+(.*)$/.exec(m[2]);
      const item: ListItem = task ? { c: parseInline(task[2]), level, check: task[1] !== ' ' } : { c: parseInline(m[2]), level };
      const last = blocks.at(-1);
      if (last && last.t === kind) last.items.push(item); else blocks.push({ t: kind, items: [item] });
      continue;
    }
    // URLだけの行は、リンクのカード
    if (BARE_URL.test(line.trim())) { flush(); blocks.push({ t: 'card', href: line.trim().replace(/[、。,.!?]+$/, '') }); continue; }
    if (line.trim() === '') { flush(); continue; }
    para.push(line);
  }
  flush();
  return blocks;
}
