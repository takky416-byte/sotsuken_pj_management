// 長い文章 (報告書の概要・課題と今後の予定は、3000字まで) を、Excel・スプレッドシートの行に収める。
// セルの行の高さには上限がある (Excel は約409pt) ので、長い文章は、いくつかの行に分けて、切れないようにする。

/** 折り返しを数えた行数 (改行も数える。空行は1行) */
export function wrappedLines(text: string, perLine: number): number {
  return text.split('\n').reduce((n, l) => n + Math.max(1, Math.ceil(l.length / perLine)), 0);
}

/** 文章を、1行 (セル) あたり maxLines 行までに収まる塊に分ける。段落 (改行) の切れ目を優先し、1行が長すぎるときは文字数で切る */
export function chunkText(text: string, perLine: number, maxLines: number): string[] {
  const out: string[] = [];
  let cur: string[] = [];
  let used = 0;
  const flush = () => { if (cur.length > 0) { out.push(cur.join('\n')); cur = []; used = 0; } };
  for (const line of text.split('\n')) {
    const parts: string[] = [];
    const cap = perLine * maxLines;
    if (line.length > cap) for (let i = 0; i < line.length; i += cap) parts.push(line.slice(i, i + cap));
    else parts.push(line);
    for (const p of parts) {
      const need = Math.max(1, Math.ceil(p.length / perLine));
      if (used + need > maxLines) flush();
      cur.push(p); used += need;
    }
  }
  flush();
  return out.length > 0 ? out : [''];
}
