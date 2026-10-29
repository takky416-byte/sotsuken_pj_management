// 利用状況の分析: メンバーごとの関与・貢献を、記録されたデータだけから数える。
// 点数や順位はつけない。数は「関与の目安」で、内容の質は作業ログ・成果物で確かめる。
import type { ClassDay, Task } from '../types';
import { classDatesBetween, fromDailyStart, statusOf, type Daily } from './daily';
import { addDays, jstDate } from './dates';
import type { AccessLog } from './access';
import type { Thank } from './engagement';
import type { Meeting } from './meeting';
import { isLeaf, isPlaceholder } from './meetingView';
import type { TaskLog } from './taskLog';

export type Contribution = {
  sid: string;
  name: string;
  teamId: string;
  /** 作業ログ: 提出した授業日 / 数える授業日 (欠席は除く) */
  daily: { submitted: number; days: number };
  /** WBSを直接変えた回数 (追加・削除・復元を含む。作業ログの提出による更新は除く) */
  wbsEdits: number;
  /** 作業ログの提出で、WBSが更新された回数 */
  viaDaily: number;
  /** 追加したタスクの数 */
  created: number;
  /** 状態を「完了」にした回数 */
  completed: number;
  /** いま担当のタスク (いちばん下の階層、保留を除く): 全体 / 完了 */
  assigned: { total: number; done: number };
  /** アクセスした日数 / 期間の日数、画面の表示回数 */
  access: { days: number; views: number } | null;
  thanksSent: number;
  thanksReceived: number;
  /** ミーティングの約束: 果たした / 全体 */
  promises: { done: number; total: number };
  /** 最後に動いた日 (WBSの更新・作業ログ・アクセスのうち新しいもの) */
  lastActive: string | null;
};

export type ContributionInput = {
  teamId: string;
  members: { sid: string; name: string }[];
  /** 期間の最初の日 (この日を含む) */
  from: string;
  today: string;
  tasks: Task[];
  taskLogs: TaskLog[];
  dailies: Daily[];
  classDays: ClassDay[];
  dailyStart: string;
  thanks: Thank[];
  meetings: Meeting[];
  /** null: アクセス記録を読んでいない */
  access: AccessLog[] | null;
};

const dayOf = (ms: number): string => (Number.isFinite(ms) ? jstDate(new Date(ms)) : '');
const max = (xs: (string | null | undefined)[]): string | null => xs.filter((x): x is string => !!x).sort().at(-1) ?? null;

export function contributions(input: ContributionInput): Contribution[] {
  const { from, today } = input;
  const live = input.tasks.filter((t) => !t.deleted);
  const dates = classDatesBetween(fromDailyStart(input.classDays, input.dailyStart), from, `${today}~`);
  const byKey = new Map(input.dailies.map((d) => [`${d.date}_${d.sid}`, d]));
  const logs = input.taskLogs.filter((l) => dayOf(l.at) >= from);

  return input.members.map((m) => {
    const mine = logs.filter((l) => l.by === m.sid);
    const direct = mine.filter((l) => !l.via);
    const sts = dates.map((d) => statusOf(byKey.get(`${d}_${m.sid}`)));
    const counted = dates.filter((d, i) => sts[i] !== 'absent' && (d < today || sts[i] === 'submitted'));
    const submitted = counted.filter((d) => statusOf(byKey.get(`${d}_${m.sid}`)) === 'submitted').length;
    const leaves = live.filter((t) => isLeaf(live, t) && !isPlaceholder(live, t) && (t.assignees ?? []).includes(m.sid) && t.status !== 'hold');
    const myAccess = input.access?.filter((l) => l.sid === m.sid && l.date >= from) ?? [];
    const promises = input.meetings.filter((x) => x.id >= from && x.id < today).flatMap((x) => x.actions).filter((a) => a.owner === m.sid);
    const dailyDates = input.dailies.filter((d) => d.sid === m.sid && statusOf(d) === 'submitted').map((d) => d.date);
    return {
      sid: m.sid, name: m.name, teamId: input.teamId,
      daily: { submitted, days: counted.length },
      wbsEdits: direct.length,
      viaDaily: mine.length - direct.length,
      created: mine.filter((l) => l.kind === 'create').reduce((n, l) => n + (l.taskId ? 1 : 0), 0),
      completed: mine.filter((l) => l.changes.some((c) => c.field === 'status' && c.to === 'done')).length,
      assigned: { total: leaves.length, done: leaves.filter((t) => t.status === 'done').length },
      access: input.access ? { days: new Set(myAccess.map((l) => l.date)).size, views: myAccess.reduce((n, l) => n + (l.views ?? 0), 0) } : null,
      thanksSent: input.thanks.filter((t) => t.from === m.sid && t.date >= from).length,
      thanksReceived: input.thanks.filter((t) => t.to === m.sid && t.date >= from).length,
      promises: { done: promises.filter((a) => a.done).length, total: promises.length },
      lastActive: max([...mine.map((l) => dayOf(l.at)), ...dailyDates, ...myAccess.map((l) => l.date)]),
    };
  }).sort((a, b) => a.sid.localeCompare(b.sid, 'en', { numeric: true }));
}

/** 期間の選び方。キックオフからの通算は、チームのキックオフ日 (なければ作業ログの開始日) から。 */
export type Period = 'kickoff' | 'd30' | 'd7';
export const PERIOD_LABEL: Record<Period, string> = { kickoff: 'キックオフから通算', d30: '直近30日', d7: '直近7日' };

export function periodFrom(period: Period, today: string, kickoffAt: number | null, dailyStart: string): string {
  if (period === 'd7') return addDays(today, -6);
  if (period === 'd30') return addDays(today, -29);
  return kickoffAt ? dayOf(kickoffAt) : dailyStart;
}

const CSV_HEAD = ['チーム', '学籍番号', '名前', '作業ログ提出', '作業ログ対象日', 'WBS直接編集', '作業ログ経由の更新', '追加したタスク', '完了にした回数', '担当タスク', '担当のうち完了', 'アクセス日数', '画面表示回数', 'ありがとう送信', 'ありがとう受信', '約束(果たした)', '約束(全体)', '最後に動いた日'];

const cell = (v: string | number): string => {
  const s = String(v);
  // 表計算ソフトで式として実行されないよう、先頭の記号を無効にする
  const safe = /^[=+\-@\t\r]/.test(s) && Number.isNaN(Number(s)) ? `'${s}` : s;
  return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

/** 成績や指導の資料に使える、CSV (表計算ソフトで開ける) */
export function contributionCsv(rows: Contribution[]): string {
  const body = rows.map((r) => [
    r.teamId, r.sid, r.name, r.daily.submitted, r.daily.days, r.wbsEdits, r.viaDaily, r.created, r.completed, r.assigned.total, r.assigned.done,
    r.access?.days ?? '', r.access?.views ?? '', r.thanksSent, r.thanksReceived, r.promises.done, r.promises.total, r.lastActive ?? '',
  ].map(cell).join(','));
  return `﻿${[CSV_HEAD.map(cell).join(','), ...body].join('\r\n')}\r\n`;
}
