import { addDays } from './dates';
import { DRAFT_END, deadlineFor, DRAFT_START, ORDER_DEADLINES, SECTION_WINDOWS, WINTER_BREAK, isClassDay } from './draftSchedule';
import { DELIVERABLES, EXPECTED } from './deliverables';
import { outlineMeta, parseOutline, type OutlineNode } from './outline';
import { TEMPLATE_NODES } from './template';

export type DraftKind = 'ソフト' | 'ハード';

export type DraftIssue = { level: 'error' | 'warn'; message: string };

export type DraftReport = {
  issues: DraftIssue[];
  /** 大項目ごとのタスク数 (大項目の下の全項目) */
  counts: { title: string; n: number }[];
  /** 大項目を除いた項目の数 */
  total: number;
  /** 点検で使った種別 (先頭の「種別: …」、なければ回路図があるかで判断) */
  kind: DraftKind;
  kindFromHeader: boolean;
};

const SECTIONS = TEMPLATE_NODES.map((n) => n.title);
const VAGUE = /^(その他|調整|検討|確認|準備|作業|対応|いろいろ)$/;
const MAX_TITLE = 32;

/** 件数の目安。決定: 1企画50〜60項目 */
export const TARGET = { min: 50, max: 60, softMin: 45, softMax: 65 };

/**
 * 叩き台のアウトライン (取り込み前のテキスト) を点検する。
 * error = 直さないと取り込めない・決定事項に反する。warn = 見直したほうがよい。
 * ハード系 (機材発注に関わる) は kind='ハード' を渡すと、発注の項目も確かめる。
 */
export function checkDraft(text: string, kindArg?: DraftKind): DraftReport {
  const meta = outlineMeta(text);
  // 先頭の「種別: …」があれば、それを使う。なければ、渡された種別、それもなければ、回路図の項目があるかで決める
  const kind: DraftKind = meta.kind ?? kindArg ?? (/回路図/.test(text) ? 'ハード' : 'ソフト');
  const nodes = parseOutline(text);
  const issues: DraftIssue[] = [];
  const err = (message: string) => issues.push({ level: 'error', message });
  const warn = (message: string) => issues.push({ level: 'warn', message });

  // --- 大項目 ---
  const heads = nodes.filter((n) => n.depth === 1).map((n) => n.title);
  if (heads.join('/') !== SECTIONS.join('/')) {
    err(`大項目は、次の5つをこの順で書いてください: ${SECTIONS.join(' / ')} (いまは: ${heads.join(' / ') || 'なし'})`);
  }
  if (nodes.length > 0 && nodes[0].depth !== 1) err('先頭に大項目 (# 要件定義) がありません');

  // --- 大項目ごとの切り分け ---
  type Sec = { title: string; items: OutlineNode[] };
  const secs: Sec[] = [];
  for (const n of nodes) {
    if (n.depth === 1) secs.push({ title: n.title, items: [] });
    else secs.at(-1)?.items.push(n);
  }
  const counts = secs.map((s) => ({ title: s.title, n: s.items.length }));
  const total = counts.reduce((a, c) => a + c.n, 0);

  if (total < TARGET.softMin || total > TARGET.softMax) {
    err(`項目は50〜60件が目安です (いま ${total}件)`);
  } else if (total < TARGET.min || total > TARGET.max) {
    warn(`項目は50〜60件が目安です (いま ${total}件)`);
  }
  for (const s of secs) {
    if (s.items.length < 3) warn(`「${s.title}」の項目が少なすぎます (${s.items.length}件)。最低でも3件`);
    if (total > 0 && s.items.length / total > 0.35) warn(`「${s.title}」に項目が偏っています (${s.items.length}/${total}件)`);
  }

  // --- 項目ごと ---
  let orderNo = 0;
  const secOf = (n: OutlineNode) => secs.find((x) => x.items.includes(n))?.title ?? '';
  const periodCheck = (n: OutlineNode, where: string) => {
    const { startDate: a, endDate: b } = n;
    if (!a || !b) { err(`${where}: 期間がありません (「> 期間: 2026-11-02〜2026-11-10」。キックオフ画面は自動で入れます)`); return; }
    if (a > b) err(`${where}: 期間の開始が終了より後です (${a}〜${b})`);
    if (a < WINTER_BREAK[0] && b > WINTER_BREAK[1]) err(`${where}: 期間 ${a}〜${b} が、冬休み (${WINTER_BREAK[0]}〜${WINTER_BREAK[1]}) をまたいでいます。休み前に終えるか、休み明けから始めてください`);
    for (const [label, d] of [['開始', a], ['終了', b]] as const) if (!isClassDay(d)) err(`${where}: 期間の${label} ${d} が授業日ではありません (開始・終了は授業日。冬休みの12/25〜1/6は授業がありません)`);
    if (a < DRAFT_START || b > DRAFT_END) err(`${where}: 期間が授業期間(${DRAFT_START}〜${DRAFT_END})の外です (${a}〜${b})`);
    const sec = secOf(n);
    const dl = deadlineFor(sec, n.title);
    if (dl && b > dl.end) err(`${where}: 終了日 ${b} が、${dl.why} の ${dl.end} より後です`);
    if (/発注/.test(n.title)) {
      const lim = ORDER_DEADLINES[Math.min(orderNo++, ORDER_DEADLINES.length - 1)];
      if (b > lim) err(`${where}: 発注の終了日 ${b} が、機材発注の期限 ${lim} より後です`);
    }
    const win = SECTION_WINDOWS[sec];
    if (win && !/発注/.test(n.title) && (a < addDays(win[0], -7) || b > addDays(win[1], 7))) warn(`${where}: 期間 ${a}〜${b} が、「${sec}」の時期 (${win[0]}〜${win[1]}) から外れています`);
    if ((Date.parse(b) - Date.parse(a)) / 86400000 > 45) warn(`${where}: 期間が45日より長いです。項目を分けられませんか`);
  };
  const siblings = new Map<string, number>();
  let parent2 = '';
  nodes.forEach((n, i) => {
    if (n.depth === 1) return;
    if (n.depth === 2) parent2 = n.title;
    const key = `${n.depth === 2 ? secs.find((s) => s.items.includes(n))?.title ?? '' : parent2}/${n.title}`;
    siblings.set(key, (siblings.get(key) ?? 0) + 1);
    const where = `「${n.title}」`;
    const next = nodes[i + 1];
    const isLeaf = !next || next.depth <= n.depth;

    if (n.title.length > MAX_TITLE) warn(`${where}: 題名が長すぎます (${n.title.length}字。${MAX_TITLE}字まで。詳しくは詳細に)`);
    if (VAGUE.test(n.title)) warn(`${where}: 題名があいまいです。「何を」まで書く`);
    if (/@|[〜~]\s*\d{1,2}\/\d{1,2}/.test(n.title)) err(`${where}: 担当 (@) や期限 (〜11/30) は書かない (叩き台は担当・日程を空欄にする)`);
    if (/ヒント|たとえば|例:|例：/.test(n.detail)) err(`${where}: ヒントや例は書かない (詳細は「やること」「できあがり」だけ)`);

    if (isLeaf) {
      if (!n.detail.trim()) {
        err(`${where}: 詳細がありません (「やること:」と「できあがり:」を書く)`);
      } else {
        if (!/^やること[:：]/m.test(n.detail)) err(`${where}: 詳細に「やること:」の行がありません`);
        if (!/^できあがり[:：]/m.test(n.detail)) err(`${where}: 詳細に「できあがり:」の行がありません`);
        const doneLine = /^できあがり[:：]\s*(.*)$/m.exec(n.detail)?.[1] ?? '';
        if (/^できあがり[:：]/m.test(n.detail) && doneLine.trim().length < 6) warn(`${where}: 「できあがり」が短すぎます。完了と言える状態を書く`);
        if (/^できあがり[:：]\s*(完了|終了|できる|終わる)[。]?$/m.test(n.detail)) warn(`${where}: 「できあがり」が完了と言うだけです。何ができていれば完了かを書く`);
      }
      periodCheck(n, where);
    }
  });
  for (const [key, c] of siblings) if (c > 1) err(`同じ場所に同じ題名が重なっています: ${key.split('/').slice(-1)[0]} (取り込みで1つにまとまり、片方が消えます)`);

  // --- 日程の節目との整合 ---
  const in_ = (sec: string, re: RegExp) => (secs.find((s) => s.title === sec)?.items ?? []).some((n) => re.test(n.title));
  if (secs.length === SECTIONS.length) {
    if (!in_('外部設計', /中間報告の(当日の)?説明/)) warn('「外部設計」に、中間報告 (11/25) の当日の説明の項目がありません');
    if (!in_('発表・展示準備', /最終発表/)) warn('「発表・展示準備」に、最終発表 (1/26) に向けた項目がありません');
    if (!in_('発表・展示準備', /動画/)) warn('「発表・展示準備」に、YouTube動画 (1/27締切) の項目がありません');
    if (!in_('発表・展示準備', /内覧会/)) warn('「発表・展示準備」に、内覧会 (1/28) の項目がありません');
    if (!in_('発表・展示準備', /提出/)) warn('「発表・展示準備」に、提出物 (2/2納期) の項目がありません');
    if (!in_('発表・展示準備', /卒展|展示/)) warn('「発表・展示準備」に、卒展 (2/6) の展示の項目がありません');
    // 成果物 (あらかじめ決まっている一覧) は、必ず項目にする
    for (const d of DELIVERABLES) {
      if (d.only === 'hard' && kind !== 'ハード') continue;
      if (!in_(d.section, d.re)) (d.optional && meta.dataSaved === false ? () => undefined : d.optional ? warn : err)(`成果物「${d.label}」(${d.stage}${d.note ? `。${d.note}` : ''})の項目が、「${d.section}」にありません`);
    }
    for (const e of EXPECTED) if (!in_(e.section, e.re)) warn(`「${e.section}」に、${e.label}の項目がありません(${e.why})`);
    if (kind === 'ハード') {
      const orders = secs.filter((s) => s.title === '要件定義' || s.title === '内部設計・実装').flatMap((s) => s.items).filter((n) => /発注/.test(n.title)).length;
      if (orders < 2) err('ハード系の企画に、機材発注 (11/5・12/1) の項目が2つ以上ありません (1回目は「要件定義」、2回目は「内部設計・実装」に入れる)');
      if (!in_('要件定義', /予算|費用|部品|機材/)) warn('ハード系の企画に、予算・部品の洗い出しが「要件定義」にありません');
    }
  }

  return { issues, counts, total, kind, kindFromHeader: meta.kind !== undefined };
}
