// バックアップ (JSON) からの復元の計画。画面にも Firestore にも依存しない純粋な処理。
// 復元は「バックアップの内容で、同じ id の文書を上書きする」だけ。バックアップにない文書は消さない。
import { TEACHER_ONLY, type Backup, type Doc } from './export';

export type Scope = { teams: string[] | 'all'; teacherOnly: boolean };

export type Write = { path: string; id: string; data: Record<string, unknown>; kind: 'new' | 'changed' };

export type RestorePlan = {
  writes: Write[];
  unchanged: number;
  /** 範囲内で、いまはあるがバックアップにない文書 (復元しても残る) */
  extra: number;
  /** コレクションごとの { 新規, 変更 } */
  byCollection: Record<string, { new: number; changed: number }>;
};

/** 読み込んだ JSON を検査して Backup にする。形が違うときは理由つきで例外。 */
export function parseBackup(text: string): Backup {
  let j: unknown;
  try { j = JSON.parse(text); } catch { throw new Error('JSON として読めません。書き出したバックアップのファイルを選んでください'); }
  const b = j as Partial<Backup>;
  if (!b || b.meta?.app !== 'sotsuken-pj') throw new Error('このアプリのバックアップではありません');
  if (b.meta.version !== 1) throw new Error(`未対応のバージョンです (version ${String(b.meta.version)})`);
  if (!b.collections || typeof b.collections !== 'object') throw new Error('collections がありません');
  for (const [path, docs] of Object.entries(b.collections)) {
    if (!Array.isArray(docs)) throw new Error(`${path} の形が違います`);
    for (const d of docs) if (!d || typeof d.id !== 'string' || d.id === '' || d.id.includes('/')) throw new Error(`${path} に、id のない文書があります`);
  }
  return b as Backup;
}

const strip = ({ id: _id, ...rest }: Doc): Record<string, unknown> => rest;

/** キーの順番に依存しない、値の比較 */
function same(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || !a || !b) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a), kb = Object.keys(b);
  return ka.length === kb.length && ka.every((k) => same((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
}

/** 範囲 (scope) に入るコレクションか。チームを選んだときは、そのチームと教員メモ(チームごと)だけ。 */
export function inScope(path: string, scope: Scope): boolean {
  if (TEACHER_ONLY.includes(path) && !scope.teacherOnly) return false;
  if (scope.teams === 'all') return true;
  const seg = path.split('/');
  if (seg[0] === 'teams') return seg.length === 1 || scope.teams.includes(seg[1]);
  return path === 'teacherNotes' || path === 'followups' || path === 'accessLogs';
}

/** 文書が範囲に入るか。teams コレクション自体と教員メモは、チームの指定を文書ごとに見る。 */
function docInScope(path: string, d: Doc, scope: Scope): boolean {
  if (scope.teams === 'all') return true;
  if (path === 'teams') return scope.teams.includes(d.id);
  if (path === 'teacherNotes' || path === 'followups' || path === 'accessLogs') return scope.teacherOnly && typeof d.teamId === 'string' && scope.teams.includes(d.teamId);
  return true;
}

export function planRestore(backup: Backup, current: Backup, scope: Scope): RestorePlan {
  const plan: RestorePlan = { writes: [], unchanged: 0, extra: 0, byCollection: {} };
  const paths = Object.keys(backup.collections).filter((p) => inScope(p, scope));
  for (const path of paths) {
    const now = new Map((current.collections[path] ?? []).map((d) => [d.id, d]));
    const inBackup = new Set<string>();
    for (const d of backup.collections[path]) {
      if (!docInScope(path, d, scope)) continue;
      inBackup.add(d.id);
      const cur = now.get(d.id);
      const data = strip(d);
      if (cur && same(strip(cur), data)) { plan.unchanged++; continue; }
      const kind = cur ? 'changed' : 'new';
      plan.writes.push({ path, id: d.id, data, kind });
      const c = (plan.byCollection[path] ??= { new: 0, changed: 0 });
      c[kind]++;
    }
    for (const d of current.collections[path] ?? []) if (docInScope(path, d, scope) && !inBackup.has(d.id)) plan.extra++;
  }
  return plan;
}
