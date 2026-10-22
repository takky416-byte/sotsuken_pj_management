import { TEAM_IDS } from '../types';

/** カンマ区切り・タブ区切り (Excel からの貼り付け) の両方を読む。ダブルクォートに対応。 */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, '');
  const delim = src.split('\n', 1)[0].includes('\t') ? '\t' : ',';
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"' && cell === '') quoted = true;
    else if (c === delim) { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      rows.push(row); row = [];
    } else cell += c;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows.map((r) => r.map((v) => v.trim())).filter((r) => r.some((v) => v !== ''));
}

export type RosterRow = { name: string; email: string; teamId: string };
export type RosterParse = { rows: RosterRow[]; errors: { line: number; message: string }[] };

const SCHOOL = /^[^\s@]+@trident\.ac\.jp$/i;

/** 「苗字,メールアドレス,チーム」の CSV を検証する。1行目が見出しなら読み飛ばす。 */
export function parseRoster(text: string): RosterParse {
  const rows: RosterRow[] = [];
  const errors: RosterParse['errors'] = [];
  const seen = new Set<string>();
  parseCsv(text).forEach((cols, i) => {
    const line = i + 1;
    const [name = '', email = '', team = ''] = cols;
    if (i === 0 && (name === '苗字' || /^name$/i.test(name))) return;
    const teamId = team.toUpperCase();
    if (!name) errors.push({ line, message: '苗字が空です' });
    else if (name.length > 20) errors.push({ line, message: '苗字が長すぎます' });
    else if (!SCHOOL.test(email)) errors.push({ line, message: `メールアドレスが @trident.ac.jp ではありません: ${email}` });
    else if (!(TEAM_IDS as readonly string[]).includes(teamId)) errors.push({ line, message: `チームは A〜H で指定してください: ${team}` });
    else if (seen.has(email.toLowerCase())) errors.push({ line, message: `メールアドレスが重複しています: ${email}` });
    else {
      seen.add(email.toLowerCase());
      rows.push({ name, email: email.toLowerCase(), teamId });
    }
  });
  return { rows, errors };
}

/** 既存の名簿を踏まえて sid (A1, A2, ...) を割り当てる。既にあるメールアドレスの sid は変えない。 */
export function assignSids(
  rows: RosterRow[],
  existing: Map<string, { sid: string | null }>,
): (RosterRow & { sid: string })[] {
  const used = new Map<string, Set<number>>();
  for (const e of existing.values()) {
    const m = /^([A-H])(\d+)$/.exec(e.sid ?? '');
    if (m) used.set(m[1], (used.get(m[1]) ?? new Set()).add(Number(m[2])));
  }
  return rows.map((r) => {
    const old = existing.get(r.email)?.sid;
    if (old) return { ...r, sid: old };
    const set = used.get(r.teamId) ?? new Set<number>();
    let n = 1;
    while (set.has(n)) n++;
    set.add(n);
    used.set(r.teamId, set);
    return { ...r, sid: `${r.teamId}${n}` };
  });
}
