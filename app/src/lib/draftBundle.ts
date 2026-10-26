import { outlineProjectName, parseOutline } from './outline';

/** 登録する叩き台 (チームごとの2案)。キックオフ画面で、2案から1つを選ぶ。 */
export type KickoffDraft = { no: 1 | 2; title: string; outline: string; updatedAt: number };
export type DraftEntry = { teamId: string; no: 1 | 2; title: string; outline: string; items: number };

/**
 * 叩き台をまとめたテキストを、チーム・案ごとに分ける。区切りは「@@ チームC 案1」の行 (「@@ チーム C 案 1」でもよい)。
 * 区切りの次の行以降が、その案のアウトライン (先頭の「企画名: …」が、仮の企画名)。
 * 区切りが読めない行がある・案が重なる・中身が空のときは、errors に書く。
 */
export function parseDraftBundle(text: string): { entries: DraftEntry[]; errors: string[] } {
  const entries: DraftEntry[] = [];
  const errors: string[] = [];
  const seen = new Set<string>();
  let cur: { teamId: string; no: 1 | 2; lines: string[] } | null = null;
  const flush = () => {
    if (!cur) return;
    const outline = cur.lines.join('\n').trim();
    const key = `${cur.teamId}${cur.no}`;
    const label = `${cur.teamId}チーム 案${cur.no}`;
    if (!outline) errors.push(`${label}: 中身が空です`);
    else if (seen.has(key)) errors.push(`${label}: 同じ案が2回あります`);
    else {
      seen.add(key);
      const items = parseOutline(outline).filter((n) => n.depth > 1).length;
      const title = outlineProjectName(outline) || `${cur.teamId}チーム 案${cur.no}`;
      entries.push({ teamId: cur.teamId, no: cur.no, title, outline, items });
    }
    cur = null;
  };
  for (const raw of text.replace(/\r\n?/g, '\n').split('\n')) {
    if (/^\s*@@/.test(raw)) {
      flush();
      const m = /^\s*@@\s*チーム\s*([A-Z])\s*案\s*([12])\s*$/.exec(raw);
      if (m) cur = { teamId: m[1], no: Number(m[2]) as 1 | 2, lines: [] };
      else errors.push(`区切りの行が読めません: ${raw.trim()}(「@@ チームC 案1」の形)`);
      continue;
    }
    if (cur) cur.lines.push(raw);
    else if (raw.trim()) errors.push('先頭に、「@@ チームC 案1」の行がありません');
  }
  flush();
  return { entries, errors: [...new Set(errors)] };
}
