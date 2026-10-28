import calendar from '../../data/calendar.json';
import { addDays as addDaysStr } from './dates';
import { DELIVERABLES } from './deliverables';
import { META_LINE, parseOutline, type OutlineNode } from './outline';
import { parsePeriod } from './period';

/** 叩き台の期間をつくる・確かめるための、授業期間と節目 (docs/decisions.md の共通マイルストーン) */
export const DRAFT_START = '2026-10-28';
export const DRAFT_END = '2027-02-06';

/**
 * 授業日 (app/data/calendar.json。火・水・木。祝日・冬休みは入っていない)。叩き台の期間の開始・終了は、必ず授業日にする。
 * 冬休み (2026-12-25〜2027-01-06) は授業日がないので、自然に、期間の始まりにも終わりにもならない。
 */
export const CLASS_DAYS: string[] = (calendar.classDays as { date: string }[]).map((d) => d.date).filter((d) => d >= DRAFT_START && d <= DRAFT_END).sort();
export const WINTER_BREAK: [string, string] = ['2026-12-25', '2027-01-06'];
export const isClassDay = (d: string): boolean => CLASS_DAYS.includes(d);
/** その日以降で、いちばん早い授業日 (なければ最後の授業日) */
export const classDayOnOrAfter = (d: string): string => CLASS_DAYS.find((x) => x >= d) ?? CLASS_DAYS[CLASS_DAYS.length - 1];
/** その日以前で、いちばん遅い授業日 (なければ最初の授業日) */
export const classDayOnOrBefore = (d: string): string => [...CLASS_DAYS].reverse().find((x) => x <= d) ?? CLASS_DAYS[0];
/**
 * 冬休み (授業のない 12/25〜1/6) をまたぐ期間は、作らない。またぐときは、休み前の部分と休み明けの部分のうち、長いほう (同じなら休み前) だけにする。
 * 休み前に終えるか、休み明けから始める、ということ。授業日どうしの期間 (snapPeriod のあと) に使う。
 */
export function avoidWinterBreak(start: string, end: string): { start: string; end: string } {
  const before = classDayOnOrBefore(addDaysStr(WINTER_BREAK[0], -1)); // 休み前の最後の授業日 (12/24)
  const after = classDayOnOrAfter(addDaysStr(WINTER_BREAK[1], 1)); // 休み明けの最初の授業日 (1/7)
  if (!(start <= before && end >= after)) return { start, end };
  const nBefore = CLASS_DAYS.filter((d) => d >= start && d <= before).length;
  const nAfter = CLASS_DAYS.filter((d) => d >= after && d <= end).length;
  return nBefore >= nAfter ? { start, end: before } : { start: after, end };
}

/** 開始は次の授業日へ、終了は前の授業日へ寄せる (授業日がはさまらないときは、1日の期間にする) */
export function snapPeriod(start: string, end: string): { start: string; end: string } {
  const s = classDayOnOrAfter(start);
  const e = classDayOnOrBefore(end);
  return e < s ? { start: s, end: s } : { start: s, end: e };
}

/** 大項目ごとの、おおまかな期間 (この中に、項目を順に並べる) */
export const SECTION_WINDOWS: Record<string, [string, string]> = {
  '要件定義': ['2026-10-28', '2026-11-16'],
  '外部設計': ['2026-11-09', '2026-11-25'],
  '内部設計・実装': ['2026-11-16', '2027-01-14'],
  '動作確認・改善': ['2026-12-14', '2027-01-19'],
  '発表・展示準備': ['2026-12-21', '2027-02-05'],
};

/** 題名に合う節目の期限 (終了日がこれ以前)。上から先に合ったものを使う。section: その大項目の中だけ */
export const DEADLINES: { section: string; re: RegExp; end: string; why: string }[] = [
  { section: '外部設計', re: /設計資料を修正/, end: '2026-11-24', why: '中間報告(11/25)の前' },
  { section: '外部設計', re: /中間報告の指摘/, end: '2026-12-04', why: '中間報告(11/25)の指摘の対応' },
  { section: '外部設計', re: /中間報告の(当日の)?説明/, end: '2026-11-25', why: '中間報告(11/25)' },
  { section: '発表・展示準備', re: /最終発表の指摘/, end: '2027-02-02', why: '提出物の納期(2/2)' },
  { section: '発表・展示準備', re: /最終発表(?!の指摘)/, end: '2027-01-26', why: '最終発表(1/26)' },
  { section: '発表・展示準備', re: /動画/, end: '2027-01-27', why: 'YouTube動画の締切(1/27)' },
  { section: '発表・展示準備', re: /内覧会/, end: '2027-01-28', why: '内覧会(1/28)' },
  { section: '発表・展示準備', re: /提出/, end: '2027-02-02', why: '提出物の納期(2/2)' },
  { section: '発表・展示準備', re: /卒展|展示/, end: '2027-02-06', why: '卒業研究制作展(2/6)' },
];

/** 成果物 (deliverables.ts) の期限も、題名に合う項目の期限にする (上の節目より、あとに合わせる) */
for (const d of DELIVERABLES) DEADLINES.push({ section: d.section, re: d.re, end: d.end, why: `成果物「${d.label}」の期限(${d.end})` });

/** 題名に合う期限のうち、いちばん早いもの */
export function deadlineFor(section: string, title: string): { end: string; why: string } | undefined {
  const hits = DEADLINES.filter((d) => d.section === section && d.re.test(title));
  return hits.length === 0 ? undefined : hits.reduce((a, b) => (b.end < a.end ? b : a));
}

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
  // 期間は、授業日を数えて決める (冬休みは数えない)。すでにある期間も、授業日に寄せる
  const idx = (d: string) => CLASS_DAYS.indexOf(classDayOnOrAfter(d));
  const idxBefore = (d: string) => CLASS_DAYS.indexOf(classDayOnOrBefore(d));
  let orders = 0;
  for (const [sec, idxs] of bySection) {
    const win = SECTION_WINDOWS[sec];
    if (!win) continue;
    const first = idx(win[0]), last = idxBefore(win[1]);
    const n = Math.max(1, last - first + 1);
    const step = n / idxs.length;
    const len = Math.max(2, Math.round(step * 1.8));
    idxs.forEach((i, k) => {
      const node = out[i];
      const hasOrder = /発注/.test(node.title);
      const orderEnd = hasOrder ? ORDER_DEADLINES[orders++] : undefined;
      if (node.startDate && node.endDate) {
        const p = avoidWinterBreak(...Object.values(snapPeriod(node.startDate, node.endDate)) as [string, string]);
        node.startDate = p.start; node.endDate = p.end;
        return;
      }
      let s = Math.min(first + Math.round(k * step), CLASS_DAYS.length - 1);
      let e = Math.min(s + len - 1, last);
      const natural = e;
      const limits = [orderEnd, deadlineFor(sec, node.title)?.end].filter((x): x is string => !!x);
      for (const l of limits) e = Math.min(e, idxBefore(l));
      if (e < natural) { // 期限で短くなったときは、期限の前に、長さぶんの期間をとる (時期の始まりより前には出ない)
        const floor = hasOrder ? 0 : first; // 機材の発注は、設計の時期より前に済ませる必要がある
        s = Math.max(floor, e - (len - 1));
      }
      if (s > e) s = e;
      const p = avoidWinterBreak(CLASS_DAYS[s], CLASS_DAYS[e]);
      node.startDate = p.start; node.endDate = p.end;
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
    if (k === -1 && META_LINE.test(raw)) return; // 先頭の「企画名: …」「種別: …」「データ保存: …」は、項目ではない
    k++;
    const before = nodes[k], after = filled[k];
    if (before && after && !(before.startDate && before.endDate) && after.startDate && after.endDate) {
      const indent = /^(\s*)/.exec(raw)?.[1] ?? '';
      insert.set(ln, `${indent}${/^\s*#/.test(raw) ? '' : '  '}> 期間: ${after.startDate}〜${after.endDate}`);
    }
  });
  // すでにある「> 期間」の行は、授業日に寄せた値に書き換える (その項目の番号は、直前の項目)
  const rewrite = new Map<number, string>();
  let kk = -1;
  lines.forEach((raw, ln) => {
    if (raw.trim() === '') return;
    if (/^\s*>/.test(raw)) {
      const m = /^(\s*>\s*期間[:：]\s*)(.+)$/.exec(raw);
      const after = filled[kk];
      if (m && after?.startDate && after.endDate && parsePeriod(m[2].trim())) rewrite.set(ln, `${m[1]}${after.startDate}〜${after.endDate}`);
      return;
    }
    if (kk === -1 && META_LINE.test(raw)) return;
    kk++;
  });
  const out: string[] = [];
  lines.forEach((raw, ln) => { out.push(rewrite.get(ln) ?? raw); if (insert.has(ln)) out.push(insert.get(ln) as string); });
  return out.join('\n');
}
