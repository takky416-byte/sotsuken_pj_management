import type { ClassDay, Task, Team } from '../types';
import { classDatesBetween, consecutiveMisses, fromDailyStart, statusOf, type Daily, type DayStatus } from './daily';
import { jstDate } from './dates';
import { isLeaf } from './meetingView';

export type TeamFlags = {
  /** 直近の授業日 (今日を含む) と、その日の提出人数 */
  latestDay: string | null;
  submitted: number;
  total: number;
  /** 授業日に2回以上連続で未提出の人 (欠席は除く)。名前で返す。 */
  missing: string[];
  /** 担当者がいなくて、期限を過ぎているタスクの数 */
  unassignedOverdue: number;
};

export const MISS_THRESHOLD = 2;

/**
 * 教員のダッシュボード用。判定は目安で、評価や単位認定には使わない。
 * 未提出は、キックオフの日と日報の運用開始日の遅いほう以降の「今日より前」の授業日だけで数える
 * (今日の分は、今日が終わるまで数えない)。
 */
export function teamFlags(
  team: Team, tasks: Task[], dailies: Daily[], allClassDays: ClassDay[], today: string, dailyStart: string,
): TeamFlags {
  const classDays = fromDailyStart(allClassDays, dailyStart); // 運用開始日より前の授業日は対象にしない
  const by = new Map(dailies.map((d) => [`${d.date}_${d.sid}`, d]));
  const latestDay = classDays.map((d) => d.date).filter((d) => d <= today).sort().at(-1) ?? null;
  const submitted = latestDay
    ? team.members.filter((m) => statusOf(by.get(`${latestDay}_${m.sid}`)) !== 'missing').length
    : 0;

  const start = team.kickoffAt ? jstDate(new Date(team.kickoffAt)) : null;
  const dates = start ? classDatesBetween(classDays, start, today) : [];
  const missing = team.members.filter((m) => {
    const st = new Map<string, DayStatus>(dates.map((d) => [d, statusOf(by.get(`${d}_${m.sid}`))]));
    return consecutiveMisses(st, dates) >= MISS_THRESHOLD;
  }).map((m) => m.name);

  const unassignedOverdue = tasks.filter((t) => !t.deleted && isLeaf(tasks, t) && t.status !== 'done' && t.status !== 'hold'
    && t.assignees.length === 0 && t.endDate !== null && t.endDate < today).length;

  return { latestDay, submitted, total: team.members.length, missing, unassignedOverdue };
}
