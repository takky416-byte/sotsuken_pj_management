// データの書き出し (バックアップ・CSV)。画面にも Firestore にも依存しない純粋な処理。

export type Doc = { id: string; [key: string]: unknown };

export type Backup = {
  meta: { app: 'sotsuken-pj'; version: 1; exportedAt: string; includesTeacherNotes: boolean };
  /** コレクションのパス (例: roster, teams, teams/A/tasks) → ドキュメントの配列 */
  collections: Record<string, Doc[]>;
};

export const TEAM_SUBCOLLECTIONS = ['tasks', 'dailyReports', 'meetings', 'comments', 'thanks', 'evaluationsPublished'] as const;
export const TOP_COLLECTIONS = ['roster', 'teams', 'config', 'milestones', 'teacherNotes', 'followups', 'evaluationsRaw', 'accessLogs'] as const;
export const TEACHER_ONLY = ['teacherNotes', 'followups', 'evaluationsRaw', 'accessLogs'];

export const teamSubcollections = (teamIds: string[]): string[] =>
  teamIds.flatMap((t) => TEAM_SUBCOLLECTIONS.map((s) => `teams/${t}/${s}`));

// ---- CSV ----

/**
 * CSV の1セル。カンマ・改行・ダブルクォートは囲んでエスケープする。
 * 文字列が =, +, -, @ などで始まると、Excel が数式として実行することがあるため、先頭に ' を付ける。
 */
export function csvCell(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'number') return String(v);
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
  let s = String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Excel で文字化けしないように BOM 付き。改行は CRLF。 */
export const toCsv = (rows: unknown[][]): string => `﻿${rows.map((r) => r.map(csvCell).join(',')).join('\r\n')}\r\n`;

const JST = 9 * 3600 * 1000;
export const jstDateTime = (ms: unknown): string =>
  typeof ms === 'number' ? new Date(ms + JST).toISOString().replace('T', ' ').slice(0, 16) : '';

// ---- 集計の補助 ----

const col = (b: Backup, path: string): Doc[] => b.collections[path] ?? [];
const str = (v: unknown) => (typeof v === 'string' ? v : '');
const list = <T = unknown>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);
const teamIds = (b: Backup) => col(b, 'teams').map((t) => t.id).sort();

/** sid → 苗字 */
function names(b: Backup): Map<string, string> {
  const m = new Map<string, string>();
  for (const t of col(b, 'teams')) for (const x of list<{ sid: string; name: string }>(t.members)) m.set(x.sid, x.name);
  for (const r of col(b, 'roster')) if (typeof r.sid === 'string') m.set(r.sid, str(r.name));
  return m;
}

const sortBy = <T,>(a: T[], ...keys: ((x: T) => string | number)[]): T[] =>
  [...a].sort((x, y) => {
    for (const k of keys) { const p = k(x), q = k(y); if (p < q) return -1; if (p > q) return 1; }
    return 0;
  });

// ---- 各 CSV ----

export function tasksCsv(b: Backup): string {
  const who = names(b);
  const nameOf = (sid: string) => (sid === 'teacher' ? '教員' : who.get(sid) ?? sid);
  const rows: unknown[][] = [['チーム', 'ID', '親ID', '階層', 'タイトル', '状態', '担当', '開始日', '終了日', '詳細', 'リンク', '叩き台', '削除済み', '作成者', '更新者', '更新日時']];
  const status: Record<string, string> = { todo: '未着手', doing: '進行中', done: '完了', hold: '保留' };
  for (const t of teamIds(b)) {
    for (const k of sortBy(col(b, `teams/${t}/tasks`), (x) => Number(x.depth ?? 0) === 1 ? 0 : 1, (x) => Number(x.order ?? 0))) {
      rows.push([
        t, k.id, k.parentId ?? '', k.depth, k.title, status[str(k.status)] ?? str(k.status),
        list<string>(k.assignees).map(nameOf).join('・'), k.startDate ?? '', k.endDate ?? '', k.detail,
        list<{ url: string; label: string }>(k.links).map((l) => (l.label ? `${l.label} ${l.url}` : l.url)).join(' / '),
        k.source === 'draft' ? '叩き台' : k.source === 'adhoc' ? 'WBS外(後追い)' : '', k.deleted === true, nameOf(str(k.createdBy)), nameOf(str(k.updatedBy)), jstDateTime(k.updatedAt),
      ]);
    }
  }
  return toCsv(rows);
}

export function dailiesCsv(b: Backup): string {
  const who = names(b);
  const rows: unknown[][] = [['日付', 'チーム', '学生ID', '苗字', '種別', 'タスク', '結果', '内容', '次にやること', '欠席']];
  const kind: Record<string, string> = { task: 'タスク', study: '調査・勉強', discuss: 'チームで相談', other: 'その他' };
  const result: Record<string, string> = { progress: '進んだ', done: '完了した', stuck: '詰まった' };
  for (const t of teamIds(b)) {
    const title = new Map(col(b, `teams/${t}/tasks`).map((k) => [k.id, str(k.title)]));
    for (const d of sortBy(col(b, `teams/${t}/dailyReports`), (x) => str(x.date), (x) => str(x.sid))) {
      const entries = list<{ kind: string; taskId?: string; note: string; result?: string }>(d.entries);
      const base = [str(d.date), t, str(d.sid), who.get(str(d.sid)) ?? ''];
      if (entries.length === 0) rows.push([...base, '', '', '', '', str(d.next), d.absent === true]);
      entries.forEach((e, i) => rows.push([
        ...base, kind[e.kind] ?? e.kind, e.taskId ? title.get(e.taskId) ?? '(削除されたタスク)' : '', result[e.result ?? ''] ?? '', e.note,
        i === 0 ? str(d.next) : '', d.absent === true,
      ]));
    }
  }
  return toCsv(rows);
}

export function meetingsCsv(b: Backup): string {
  const rows: unknown[][] = [['チーム', '日付', '決まったこと', 'やること', 'できたこと', 'メモ']];
  for (const t of teamIds(b)) {
    for (const m of sortBy(col(b, `teams/${t}/meetings`), (x) => str(x.date))) {
      const actions = list<{ text: string; done: boolean }>(m.actions);
      rows.push([t, str(m.date), str(m.decided), actions.map((a) => a.text).join('\n'), actions.filter((a) => a.done).map((a) => a.text).join('\n'), str(m.note)]);
    }
  }
  return toCsv(rows);
}

export function rosterCsv(b: Backup): string {
  const rows: unknown[][] = [['学生ID', '苗字', 'チーム', 'メールアドレス', '役割']];
  for (const r of sortBy(col(b, 'roster'), (x) => (x.role === 'teacher' ? 0 : 1), (x) => str(x.teamId), (x) => Number(/\d+$/.exec(str(x.sid))?.[0] ?? 0))) {
    rows.push([str(r.sid), str(r.name), str(r.teamId), r.id, r.role === 'teacher' ? '教員' : '学生']);
  }
  return toCsv(rows);
}

export function calendarCsv(b: Backup): string {
  const rows: unknown[][] = [['種別', '日付', '終了日', '名称・備考', '対象・時限', 'ミーティング']];
  for (const m of sortBy(col(b, 'milestones'), (x) => str(x.date))) {
    rows.push(['予定', str(m.date), m.endDate ?? '', str(m.title), m.teamId ? `${m.teamId}チーム` : '共通', '']);
  }
  const days = list<{ date: string; periods: string; meeting: boolean; note: string }>(col(b, 'config').find((c) => c.id === 'classDays')?.days);
  for (const d of days) rows.push(['授業日', d.date, '', d.note, `${d.periods}限`, d.meeting]);
  return toCsv(rows);
}

export function teacherNotesCsv(b: Backup): string {
  const rows: unknown[][] = [['チーム', '日時', '内容']];
  for (const n of sortBy(col(b, 'teacherNotes'), (x) => str(x.teamId), (x) => Number(x.createdAt ?? 0))) {
    rows.push([str(n.teamId), jstDateTime(n.createdAt), str(n.body)]);
  }
  return toCsv(rows);
}

export function accessCsv(b: Backup): string {
  const rows: unknown[][] = [['日付', 'チーム', '学生ID', '初回', '最終', '訪問', '画面表示', '画面ごとの回数']];
  for (const a of sortBy(col(b, 'accessLogs'), (x) => str(x.date), (x) => str(x.sid))) {
    rows.push([str(a.date), str(a.teamId), str(a.sid), jstDateTime(a.firstAt), jstDateTime(a.lastAt), a.visits ?? 0, a.views ?? 0,
      Object.entries((a.screens ?? {}) as Record<string, number>).map(([k, n]) => `${k}:${n}`).join(' ')]);
  }
  return toCsv(rows);
}

/** 画面に出す、コレクションごとの件数 */
export function counts(b: Backup): { label: string; n: number }[] {
  const sum = (suffix: string) => teamIds(b).reduce((acc, t) => acc + col(b, `teams/${t}/${suffix}`).length, 0);
  return [
    { label: '名簿', n: col(b, 'roster').length },
    { label: 'チーム', n: col(b, 'teams').length },
    { label: 'タスク(削除済みを含む)', n: sum('tasks') },
    { label: '作業レポート', n: sum('dailyReports') },
    { label: 'ミーティング記録', n: sum('meetings') },
    { label: 'コメント', n: sum('comments') },
    { label: 'ありがとう', n: sum('thanks') },
    { label: '予定', n: col(b, 'milestones').length },
    { label: '教員メモ', n: col(b, 'teacherNotes').length },
    { label: 'アクセス履歴', n: col(b, 'accessLogs').length },
  ];
}

/** teacherNotes などの教員専用データを除いたバックアップを作る */
export function withoutTeacherOnly(b: Backup): Backup {
  const collections = Object.fromEntries(Object.entries(b.collections).filter(([p]) => !TEACHER_ONLY.includes(p)));
  return { meta: { ...b.meta, includesTeacherNotes: false }, collections };
}
