// 入力欄 (テキストエリア) の Markdown 編集の補助。選択範囲とカーソルの位置を受けて、新しい文字列と選択範囲を返す (画面に依存しない)。
// 太字・斜体などの記号で囲む、行頭の記号 (見出し・箇条書き・チェックリスト・引用)、表・コードの挿入、Enter で箇条書きの続き、Tab で字下げ。

export type Edit = { value: string; start: number; end: number };

const lineStart = (v: string, i: number) => v.lastIndexOf('\n', i - 1) + 1;
const lineEnd = (v: string, i: number) => { const n = v.indexOf('\n', i); return n === -1 ? v.length : n; };

/** 選択範囲を marker で囲む。すでに囲まれていれば外す。選択がなければ、記号と、仮の文字を入れる */
export function wrap(v: string, s: number, e: number, marker: string, placeholder = '文字'): Edit {
  const m = marker.length;
  if (s === e) {
    const value = `${v.slice(0, s)}${marker}${placeholder}${marker}${v.slice(e)}`;
    return { value, start: s + m, end: s + m + placeholder.length };
  }
  const sel = v.slice(s, e);
  if (sel.length >= m * 2 && sel.startsWith(marker) && sel.endsWith(marker)) {
    return { value: `${v.slice(0, s)}${sel.slice(m, -m)}${v.slice(e)}`, start: s, end: e - m * 2 };
  }
  if (v.slice(s - m, s) === marker && v.slice(e, e + m) === marker) {
    return { value: `${v.slice(0, s - m)}${sel}${v.slice(e + m)}`, start: s - m, end: e - m };
  }
  return { value: `${v.slice(0, s)}${marker}${sel}${marker}${v.slice(e)}`, start: s + m, end: e + m };
}

export type LineKind = 'h' | 'ul' | 'ol' | 'check' | 'quote';
const PREFIX: Record<LineKind, string> = { h: '## ', ul: '- ', ol: '1. ', check: '- [ ] ', quote: '> ' };
// 行頭の記号 (字下げのあと)。先に長いもの (チェックリスト) から見る
const ANY_PREFIX = /^(\s*)(- \[[ xX]\] |[-*+] |\d+[.)] |#{1,3} |> )/;

/** 選択した行の行頭に記号を付ける。すべての行にすでに付いていれば外す。ほかの記号が付いていれば、置き換える */
export function toggleLines(v: string, s: number, e: number, kind: LineKind): Edit {
  const a = lineStart(v, s);
  const b = lineEnd(v, e > s && v[e - 1] === '\n' ? e - 1 : e);
  const lines = v.slice(a, b).split('\n');
  const p = PREFIX[kind];
  const has = (l: string) => (kind === 'ol' ? /^\s*\d+[.)] /.test(l) : kind === 'ul' ? /^\s*[-*+] (?!\[)/.test(l) : l.trimStart().startsWith(p.trim() + ' ') && (kind !== 'check' || /^\s*- \[[ xX]\] /.test(l)));
  const skipBlank = lines.length > 1; // 1行だけのときは、空の行にも付ける (空の入力欄で、箇条書きを始められるように)
  const all = lines.every((l) => (skipBlank && l.trim() === '') || has(l)) && lines.some((l) => has(l));
  let n = 0;
  const out = lines.map((l) => {
    if (skipBlank && l.trim() === '') return l;
    const indent = /^\s*/.exec(l)![0];
    const body = l.replace(ANY_PREFIX, '$1').slice(indent.length);
    if (all) return `${indent}${body}`;
    n++;
    return `${indent}${kind === 'ol' ? `${n}. ` : p}${body}`;
  });
  const text = out.join('\n');
  const value = `${v.slice(0, a)}${text}${v.slice(b)}`;
  // 選んでいたときは、変えた行をそのまま選んでおく。カーソルだけのときは、カーソルのまま (続けて書けるように)
  if (s === e) { const c = Math.min(a + text.length, Math.max(a, s + text.length - (b - a))); return { value, start: c, end: c }; }
  return { value, start: a, end: a + text.length };
}

/** コードのかたまり (```) で、選択範囲を囲む。選択がなければ、空のかたまりを入れる */
export function codeBlock(v: string, s: number, e: number): Edit {
  const a = lineStart(v, s);
  const before = v.slice(0, a);
  const sel = v.slice(s, e);
  const lead = before === '' || before.endsWith('\n\n') ? '' : before.endsWith('\n') ? '\n' : '\n\n';
  const open = `${lead}\`\`\`\n`;
  const body = sel || 'コード';
  const value = `${v.slice(0, s)}${open}${body}\n\`\`\`\n${v.slice(e)}`;
  const start = s + open.length;
  return { value, start, end: start + body.length };
}

const TABLE = '| 項目 | 内容 |\n| --- | --- |\n| 〇〇 | 〇〇 |\n';

/** 表の雛形を、カーソルの位置 (行の始まり) に入れる */
export function insertTable(v: string, s: number): Edit {
  const at = s === lineStart(v, s) && v.slice(0, s).endsWith('\n\n') ? s : s;
  const before = v.slice(0, at);
  const lead = before === '' || before.endsWith('\n\n') ? '' : before.endsWith('\n') ? '\n' : '\n\n';
  const value = `${before}${lead}${TABLE}${v.slice(at)}`;
  const start = at + lead.length + 2;
  return { value, start, end: start + 2 };
}

/** リンク: 選択した文字を [文字](https://) にする。URL の場所を選んだ状態にする */
export function linkOf(v: string, s: number, e: number, url = 'https://'): Edit {
  const text = v.slice(s, e) || 'リンクの文字';
  const value = `${v.slice(0, s)}[${text}](${url})${v.slice(e)}`;
  const start = s + text.length + 3;
  return { value, start, end: start + url.length };
}

/** Enter: 箇条書き・番号・チェックリスト・引用の行なら、次の行にも同じ記号を付ける。中身が空の行なら、記号を消して終える。それ以外は null (ふつうの Enter) */
export function continueList(v: string, s: number, e: number): Edit | null {
  if (s !== e) return null;
  const a = lineStart(v, s);
  const line = v.slice(a, lineEnd(v, s));
  const m = /^(\s*)(- \[[ xX]\] |[-*+] |(\d+)([.)]) |> )(.*)$/.exec(line);
  if (!m || s < a + m[1].length + m[2].length) return null; // 記号より前にカーソルがあるときは、ふつうの Enter
  const [, indent, mark, num, dot, rest] = m;
  if (rest.trim() === '') {
    // 空の項目で Enter: 記号を消して、箇条書きを終える
    const value = `${v.slice(0, a)}${indent}${v.slice(a + line.length)}`;
    return { value, start: a + indent.length, end: a + indent.length };
  }
  const next = num !== undefined ? `${Number(num) + 1}${dot} ` : mark.startsWith('- [') ? '- [ ] ' : mark;
  const ins = `\n${indent}${next}`;
  const value = `${v.slice(0, s)}${ins}${v.slice(s)}`;
  return { value, start: s + ins.length, end: s + ins.length };
}

/** Tab / Shift+Tab: 選択した行 (選択がなければ、カーソルの行) を、2文字ぶん字下げ・字上げする */
export function indent(v: string, s: number, e: number, out: boolean): Edit {
  const a = lineStart(v, s);
  const b = lineEnd(v, e > s && v[e - 1] === '\n' ? e - 1 : e);
  const lines = v.slice(a, b).split('\n');
  let first = 0; let total = 0;
  const res = lines.map((l, i) => {
    if (!out) { if (i === 0) first = 2; total += 2; return `  ${l}`; }
    const m = /^( {1,2}|\t)/.exec(l);
    const cut = m ? m[0].length : 0;
    if (i === 0) first = -cut; total -= cut;
    return l.slice(cut);
  });
  const text = res.join('\n');
  const value = `${v.slice(0, a)}${text}${v.slice(b)}`;
  return { value, start: Math.max(a, s + first), end: Math.max(a, e + total) };
}

/** 貼り付け: 文字を選んでいて、貼り付けるものがURLなら、[選んだ文字](URL) にする。それ以外は null (ふつうの貼り付け) */
export function pasteLink(v: string, s: number, e: number, pasted: string): Edit | null {
  const url = pasted.trim();
  if (s === e || !/^https?:\/\/[^\s<>()]+$/.test(url) || v.slice(s, e).includes('\n')) return null;
  const sel = v.slice(s, e);
  const ins = `[${sel}](${url})`;
  return { value: `${v.slice(0, s)}${ins}${v.slice(e)}`, start: s + ins.length, end: s + ins.length };
}
