// タスクの変更履歴。誰が・いつ・何を・どう変えたかを、変更のたびに1件ずつ残す (書き換えない・消さない)。
import type { Task, TaskStatus } from '../types';
import { STATUS_LABEL } from '../types';

export type LogChange = { field: string; from: string; to: string };
export type TaskLog = {
  id?: string;
  /** まとめて追加したときなどは空 */
  taskId: string;
  title: string;
  by: string;
  at: number;
  kind: 'create' | 'update' | 'delete' | 'restore';
  changes: LogChange[];
  /** 作業レポートの提出で更新されたときなど */
  via?: string;
};

export const FIELD_LABEL: Record<string, string> = {
  title: 'タスク名', status: '状態', assignees: '担当', startDate: '開始日', endDate: '終了日', detail: '詳細', links: 'リンク', move: '場所・並び順',
};

const cut = (s: string, n = 80) => (s.length > n ? `${s.slice(0, n)}…` : s);
const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/** 変更前のタスクと、書き込む変更から、履歴に残す変更を求める (変わっていない項目は除く) */
export function diffTask(before: Task | undefined, changes: Partial<Omit<Task, 'id'>>): LogChange[] {
  const out: LogChange[] = [];
  const b = before;
  const str = (k: 'title' | 'status' | 'startDate' | 'endDate') => {
    if (!(k in changes)) return;
    const from = (b?.[k] ?? '') as string, to = (changes[k] ?? '') as string;
    if (from !== to) out.push({ field: k, from: cut(from), to: cut(to) });
  };
  str('title'); str('status'); str('startDate'); str('endDate');
  if ('assignees' in changes && !same(b?.assignees, changes.assignees)) out.push({ field: 'assignees', from: (b?.assignees ?? []).join(','), to: (changes.assignees ?? []).join(',') });
  if ('detail' in changes && (b?.detail ?? '') !== (changes.detail ?? '')) out.push({ field: 'detail', from: `${(b?.detail ?? '').length}字`, to: `${(changes.detail ?? '').length}字` });
  if ('links' in changes && !same(b?.links, changes.links)) out.push({ field: 'links', from: `${(b?.links ?? []).length}件`, to: `${(changes.links ?? []).length}件` });
  if (('parentId' in changes && changes.parentId !== b?.parentId) || ('depth' in changes && changes.depth !== b?.depth) || ('order' in changes && changes.order !== b?.order)) {
    out.push({ field: 'move', from: '', to: '' });
  }
  return out;
}

/** 担当・リンクの追加/削除から、履歴に残す変更を求める */
export function diffArray(before: Task | undefined, field: 'assignees' | 'links', op: 'add' | 'remove', value: unknown): LogChange[] {
  if (field === 'assignees') {
    const cur = before?.assignees ?? [];
    const next = op === 'add' ? (cur.includes(value as string) ? cur : [...cur, value as string]) : cur.filter((x) => x !== value);
    return same(cur, next) ? [] : [{ field, from: cur.join(','), to: next.join(',') }];
  }
  const n = (before?.links ?? []).length;
  return [{ field, from: `${n}件`, to: `${op === 'add' ? n + 1 : Math.max(0, n - 1)}件` }];
}

/** 画面に出す、1件の説明 (例: 「状態: 未着手 → 進行中」)。担当は、名前に直して出す */
export function describeChange(c: LogChange, nameOf: (sid: string) => string): string {
  const label = FIELD_LABEL[c.field] ?? c.field;
  if (c.field === 'move') return `${label}を変更`;
  const fmt = (v: string) => {
    if (c.field === 'status') return STATUS_LABEL[v as TaskStatus] ?? (v || '—');
    if (c.field === 'assignees') return v ? v.split(',').map(nameOf).join('・') : 'なし';
    return v || 'なし';
  };
  return `${label}: ${fmt(c.from)} → ${fmt(c.to)}`;
}
