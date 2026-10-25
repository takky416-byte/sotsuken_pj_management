import type { Task, Team } from '../types';
import { ADHOC_ROOT_ID } from './adhoc';
import { isLeaf, isPlaceholder } from './meetingView';

export type ReviewState = {
  /** キックオフのあと、チームがまだ「見直しを終えた」と記録していない */
  needed: boolean;
  /** 見直しの対象 (いちばん下の、完了していないタスク) の数 */
  total: number;
  /** 叩き台から作られたタスクの数 */
  drafts: number;
  /** 担当が決まっていないタスク */
  unassigned: Task[];
  /** 期間 (開始・終了の日付) がまったくないタスクの数。目安 */
  noPeriod: number;
  /** 「終えた」を押せる (対象があり、担当のないタスクが 0) */
  canConfirm: boolean;
};

/**
 * キックオフ直後の「初期WBSの見直し」の状態。タスクの追加・修正・削除は、記録からは分からないので、
 * 担当の割り振りだけをデータで確かめ、見直しそのものは、チームが「終えた」を押して記録する。
 */
export function reviewState(team: Pick<Team, 'status' | 'kickoffAt' | 'wbsReview'>, tasks: Task[]): ReviewState {
  const live = tasks.filter((t) => !t.deleted);
  const leaves = live.filter((t) => isLeaf(live, t) && !isPlaceholder(live, t) && t.id !== ADHOC_ROOT_ID && t.status !== 'done');
  const unassigned = leaves.filter((t) => (t.assignees ?? []).length === 0);
  return {
    needed: team.status === 'active' && team.kickoffAt != null && !team.wbsReview,
    total: leaves.length,
    drafts: live.filter((t) => t.source === 'draft').length,
    unassigned,
    noPeriod: leaves.filter((t) => !t.startDate && !t.endDate).length,
    canConfirm: leaves.length > 0 && unassigned.length === 0,
  };
}
