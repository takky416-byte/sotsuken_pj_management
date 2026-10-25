import { addDays } from './dates';
import { parseOutline, type OutlineNode } from './outline';

/** 叩き台の期間をつくる・確かめるための、授業期間と節目 (docs/decisions.md の共通マイルストーン) */
export const DRAFT_START = '2026-10-28';
export const DRAFT_END = '2027-02-06';

/** 大項目ごとの、おおまかな期間 (この中に、項目を順に並べる) */
export const SECTION_WINDOWS: Record<string, [string, string]> = {
  '企画の具体化': ['2026-10-28', '2026-11-06'],
  '要件定義': ['2026-11-02', '2026-11-16'],
  '外部設計': ['2026-11-09', '2026-11-25'],
  '内部設計・実装': ['2026-11-16', '2027-01-15'],
  'テスト・検証': ['2026-12-14', '2027-01-22'],
  '発表・展示準備': ['2026-12-21', '2027-02-05'],
};

/** 題名に合う節目の期限 (終了日がこれ以前)。上から先に合ったものを使う。section: その大項目の中だけ */
export const DEADLINES: { section: string; re: RegExp; end: string; why: string }[] = [
  { section: '外部設計', re: /レビュー.*指摘|指摘.*レビュー/, end: '2026-12-04', why: '外部設計レビュー(11/25)の指摘の対応' },
  { section: '外部設計', re: /レビュー/, end: '2026-11-25', why: '外部設計レビュー(11/25)' },
  { section: '発表・展示準備', re: /最終レビュー.*指摘|指摘.*最終レビュー/, end: '2027-02-02', why: '提出物の納期(2/2)' },
  { section: '発表・展示準備', re: /最終レビュー/, end: '2027-01-26', why: '最終レビュー(1/26)' },
  { section: '発表・展示準備', re: /動画/, end: '2027-01-27', why: 'YouTube動画の締切(1/27)' },
  { section: '発表・展示準備', re: /内覧会/, end: '2027-01-28', why: '内覧会(1/28)' },
  { section: '発表・展示準備', re: /提出/, end: '2027-02-02', why: '提出物の納期(2/2)' },
  { section: '発表・展示準備', re: /卒展|展示/, end: '2027-02-06', why: '卒業研究制作展(2/6)' },
];

/** 機材発注の期限。「発注」と付く項目を順に、1回目・2回目とみなす */
export const ORDER_DEADLINES = ['2026-11-05', '2026-12-01'];

const isLeafAt = (nodes: OutlineNode[], i: number) => nodes[i].depth > 1 && !(nodes[i + 1] && nodes[i + 1].depth > nodes[i].depth);

/**
 * 期間のない項目 (いちばん下の項目) に、期間を入れる。大項目ごとの期間の中に、順に並べ、節目の期限を越えないようにする。
 * すでに期間がある項目は、そのまま。機材発注の期限は、ハード系のとき (「発注」と付く項目) に使う。
 */
export function autoSchedule(nodes: OutlineNode[]): OutlineNode[] {
  const out = nodes.map((n) => ({ ...n }));
  let section = '';
  const bySection = new Map<string, number[]>();
  out.forEach((n, i) => {
    if (n.depth === 1) { section = n.title; return; }
    if (!isLeafAt(out, i)) return;
    bySection.set(section, [...(bySection.get(section) ?? []), i]);
  });
  let orders = 0;
  for (const [sec, idxs] of bySection) {
    const win = SECTION_WINDOWS[sec];
    if (!win) continue;
    const [ws, we] = win;
    const days = Math.max(1, Math.round((Date.parse(`${we}T00:00:00Z`) - Date.parse(`${ws}T00:00:00Z`)) / 86400000));
    const step = days / idxs.length;
    const len = Math.max(3, Math.round(step * 1.8));
    idxs.forEach((i, k) => {
      const n = out[i];
      const hasOrder = /発注/.test(n.title);
      const orderEnd = hasOrder ? ORDER_DEADLINES[orders++] : undefined;
      if (n.startDate && n.endDate) return;
      let start = addDays(ws, Math.round(k * step));
      let end = addDays(start, len - 1);
      if (end > we) end = we;
      const limits = [orderEnd, DEADLINES.find((d) => d.section === sec && d.re.test(n.title))?.end].filter((x): x is string => !!x);
      for (const l of limits) if (end > l) end = l;
      if (start > end) start = end;
      n.startDate = start; n.endDate = end;
    });
  }
  return out;
}

/**
 * アウトラインの文章に、期間のない項目へ「> 期間: 開始〜終了」の行を足す。人が見て直せるように、文章のまま返す。
 */
export function fillPeriods(text: string): string {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const nodes = parseOutline(text);
  const filled = autoSchedule(nodes);
  // 行 → 項目の対応 (parseOutline と同じ数え方: 空行と「>」の行は数えない)
  let k = -1;
  const insert = new Map<number, string>();
  lines.forEach((raw, ln) => {
    if (raw.trim() === '' || /^\s*>/.test(raw)) return;
    k++;
    const before = nodes[k], after = filled[k];
    if (before && after && !(before.startDate && before.endDate) && after.startDate && after.endDate) {
      const indent = /^(\s*)/.exec(raw)?.[1] ?? '';
      insert.set(ln, `${indent}${/^\s*#/.test(raw) ? '' : '  '}> 期間: ${after.startDate}〜${after.endDate}`);
    }
  });
  const out: string[] = [];
  lines.forEach((raw, ln) => { out.push(raw); if (insert.has(ln)) out.push(insert.get(ln) as string); });
  return out.join('\n');
}
