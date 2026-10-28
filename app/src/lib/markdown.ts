// 作業ログの説明を、画面に出すときの Markdown の読み取り。HTML は通さない (React の要素に直して出す)。
// 使えるのは、見出し (# ## ###)・箇条書き (- * 1.)・引用 (>)・コードのかたまり (```)・太字 (**)・斜体 (*)・取り消し線 (~~)・コード (`)・リンク ([文字](https://…) と、そのままのURL)。
// 1回の改行は、そのまま改行として出す (作業ログは、改行しながら書くことが多いため)。

export type Inline =
  | { t: 'text'; s: string }
  | { t: 'b' | 'i' | 's'; c: Inline[] }
  | { t: 'code'; s: string }
  | { t: 'a'; href: string; c: Inline[] }
  | { t: 'br' };

export type Block =
  | { t: 'p'; c: Inline[] }
  | { t: 'h'; level: 1 | 2 | 3; c: Inline[] }
  | { t: 'ul' | 'ol'; items: Inline[][] }
  | { t: 'quote'; c: Inline[] }
  | { t: 'code'; s: string };

const TOKEN = /(`[^`\n]+`)|(\*\*[^*\n]+?\*\*)|(~~[^~\n]+?~~)|(\*[^*\s][^*\n]*?\*)|(\[[^\]\n]+\]\(https?:\/\/[^\s)]+\))|(https?:\/\/[^\s<>()]+)/;

/** 1行の中の、太字・コード・リンクなど */
export function parseInline(text: string): Inline[] {
  const out: Inline[] = [];
  let rest = text;
  while (rest.length > 0) {
    const m = TOKEN.exec(rest);
    if (!m) { out.push({ t: 'text', s: rest }); break; }
    if (m.index > 0) out.push({ t: 'text', s: rest.slice(0, m.index) });
    const tok = m[0];
    if (m[1]) out.push({ t: 'code', s: tok.slice(1, -1) });
    else if (m[2]) out.push({ t: 'b', c: parseInline(tok.slice(2, -2)) });
    else if (m[3]) out.push({ t: 's', c: parseInline(tok.slice(2, -2)) });
    else if (m[4]) out.push({ t: 'i', c: parseInline(tok.slice(1, -1)) });
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
    const ul = /^\s*[-*+]\s+(.*)$/.exec(line);
    const ol = /^\s*\d+[.)]\s+(.*)$/.exec(line);
    if (ul || ol) {
      flush();
      const kind = ul ? 'ul' : 'ol';
      const last = blocks.at(-1);
      const item = parseInline((ul ?? ol)![1]);
      if (last && last.t === kind) last.items.push(item); else blocks.push({ t: kind, items: [item] });
      continue;
    }
    if (line.trim() === '') { flush(); continue; }
    para.push(line);
  }
  flush();
  return blocks;
}
