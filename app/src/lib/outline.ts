import { parsePeriod } from './period';

export type OutlineNode = { depth: 1 | 2 | 3; title: string; detail: string; startDate?: string; endDate?: string };

const clamp = (n: number): 1 | 2 | 3 => (Math.min(Math.max(n, 1), 3) as 1 | 2 | 3);

const NAME_LINE = /^\s*企画名[:：]\s*(.+?)\s*$/;

/** アウトラインの先頭の「企画名: …」の行 (叩き台に、仮の企画名を入れておく)。なければ空。 */
export function outlineProjectName(text: string): string {
  for (const raw of text.replace(/\r\n?/g, '\n').split('\n')) {
    if (raw.trim() === '') continue;
    return NAME_LINE.exec(raw)?.[1] ?? '';
  }
  return '';
}

/**
 * アウトライン形式のテキストを平らなリストにする。
 *   # 大項目         → 見出し。# の数が階層 (# = 1)
 *   - タスク         → 直前の見出しの1つ下。インデント2スペース(またはタブ)ごとに1階層下
 *     > 詳細         → 直前のタスクの詳細 (複数行可)
 * 見出しがない場合、先頭の項目の階層は baseDepth (既定 1)。4階層以上は3階層にまとめる。
 * 先頭の「企画名: …」の行は、項目にしない (outlineProjectName で読む)。
 */
export function parseOutline(text: string, baseDepth: 1 | 2 | 3 = 1): OutlineNode[] {
  const nodes: OutlineNode[] = [];
  let headingDepth = baseDepth - 1;
  for (const raw of text.replace(/\r\n?/g, '\n').split('\n')) {
    if (raw.trim() === '') continue;
    if (nodes.length === 0 && NAME_LINE.test(raw)) continue;
    const detail = /^\s*>\s?(.*)$/.exec(raw);
    if (detail) {
      const last = nodes[nodes.length - 1];
      const period = /^期間[:：]\s*(.+)$/.exec(detail[1].trim());
      const range = period ? parsePeriod(period[1]) : null;
      if (last && range) { last.startDate = range.startDate; last.endDate = range.endDate; continue; }
      if (last) last.detail = last.detail ? `${last.detail}\n${detail[1]}` : detail[1];
      continue;
    }
    const heading = /^(#{1,3})\s+(.+)$/.exec(raw.trim());
    if (heading) {
      const depth = clamp(baseDepth - 1 + heading[1].length);
      headingDepth = depth;
      nodes.push({ depth, title: heading[2].trim(), detail: '' });
      continue;
    }
    const m = /^(\s*)(?:[-*・]\s*|\d+[.)]\s*)?(.+)$/.exec(raw);
    if (!m) continue;
    const indent = m[1].replace(/\t/g, '  ').length;
    nodes.push({ depth: clamp(headingDepth + 1 + Math.floor(indent / 2)), title: m[2].trim(), detail: '' });
  }
  // 親のない階層の飛び (1 の次が 3 など) を詰める
  let prev = baseDepth - 1;
  for (const n of nodes) {
    if (n.depth > prev + 1) n.depth = clamp(prev + 1);
    prev = n.depth;
  }
  return nodes;
}
