// 報告書 (Excel・印刷) 用の表データ。画面に依存しない。
// 企業への中間報告で提出するため、教員専用のデータ (教員メモなど) は含めない。
import type { Milestone, Task, TaskStatus } from '../types';
import { STATUS_LABEL } from '../types';
import { addDays } from './dates';
import { daysBetween } from './gantt';
import { childrenOf, effectiveStatuses, periodOf } from './wbs';

export type WbsRow = {
  id: string;
  /** 1 / 1.2 / 1.2.3 */
  no: string;
  depth: 1 | 2 | 3;
  title: string;
  assignees: string;
  status: TaskStatus;
  statusLabel: string;
  start: string | null;
  end: string | null;
  /** 自分の日付がなく、子から求めた期間のとき true */
  derived: boolean;
  /** 完了 ÷ 全体 (子のあるタスクは葉の数。保留を除く)。0〜100 */
  progress: number;
  detail: string;
  leaf: boolean;
};

/** WBS の行 (親→子の順。番号つき)。 */
export function wbsRows(tasks: Task[], nameOf: (sid: string) => string): WbsRow[] {
  const live = tasks.filter((t) => !t.deleted);
  const eff = effectiveStatuses(live);
  const out: WbsRow[] = [];
  const leavesOf = (id: string): Task[] => {
    const kids = childrenOf(live, id);
    return kids.length === 0 ? [live.find((t) => t.id === id) as Task] : kids.flatMap((k) => leavesOf(k.id));
  };
  const walk = (parentId: string | null, prefix: string) => {
    childrenOf(live, parentId).forEach((t, i) => {
      const no = prefix ? `${prefix}.${i + 1}` : `${i + 1}`;
      const kids = childrenOf(live, t.id);
      const p = periodOf(live, t);
      const leaves = kids.length === 0 ? [t] : leavesOf(t.id);
      const active = leaves.filter((l) => l.status !== 'hold');
      const status = eff.get(t.id) ?? t.status;
      out.push({
        id: t.id, no, depth: t.depth, title: t.title, assignees: kids.length === 0 ? (t.assignees ?? []).map(nameOf).join('・') : '',
        status, statusLabel: STATUS_LABEL[status], start: p.start, end: p.end, derived: p.derived,
        progress: active.length === 0 ? 0 : Math.round((active.filter((l) => l.status === 'done').length / active.length) * 100),
        detail: t.detail ?? '', leaf: kids.length === 0,
      });
      walk(t.id, no);
    });
  };
  walk(null, '');
  return out;
}

/** ガントの列 (週。月曜の日付)。期間が空なら空配列。 */
export function weekColumns(rows: { start: string | null; end: string | null }[], milestones: Milestone[], today: string): string[] {
  const dates = [today, ...rows.flatMap((r) => [r.start, r.end]), ...milestones.map((m) => m.date)].filter((d): d is string => !!d).sort();
  if (dates.length === 0) return [];
  const mondayOf = (d: string) => addDays(d, -((new Date(`${d}T00:00:00Z`).getUTCDay() + 6) % 7));
  const out: string[] = [];
  for (let d = mondayOf(dates[0]); d <= dates[dates.length - 1]; d = addDays(d, 7)) out.push(d);
  return out;
}

/** その週 (月曜 w から7日間) に、期間がかかるか。 */
export const overlapsWeek = (start: string | null, end: string | null, w: string): boolean =>
  !!start && !!end && start <= addDays(w, 6) && end >= w;

/** マイルストーンがその週にあるか。 */
export const milestonesInWeek = (ms: Milestone[], w: string): Milestone[] =>
  ms.filter((m) => m.date <= addDays(w, 6) && (m.endDate ?? m.date) >= w);

export const mdLabel = (d: string): string => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`;

/** 期間 (日数)。表示用。 */
export const spanDays = (start: string | null, end: string | null): number | null => (start && end ? daysBetween(start, end) + 1 : null);
