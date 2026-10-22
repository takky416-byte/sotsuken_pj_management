import type { ClassDay } from '../types';
import { TEAM_IDS } from '../types';

/** owner: 約束した人 (学生ID)。null は、チーム全体 */
export type MeetingAction = { text: string; done: boolean; owner?: string | null };

/** 前回の未完了のアクションのうち、今回の一覧にまだないもの (引き継ぐ候補)。 */
export function carryOver(prev: MeetingAction[], current: MeetingAction[]): MeetingAction[] {
  const have = new Set(current.map((a) => `${a.owner ?? ''}|${a.text}`));
  return prev.filter((a) => !a.done && !have.has(`${a.owner ?? ''}|${a.text}`)).map((a) => ({ text: a.text, done: false, owner: a.owner ?? null }));
}

export type Meeting = {
  id: string; // 日付 (YYYY-MM-DD)
  date: string;
  decided: string;
  actions: MeetingAction[];
  note: string;
  createdBy: string;
  updatedAt: number;
};

/**
 * ミーティングでチームを回す順番。rotate が true なら、ミーティングを行った回数だけ先頭をずらす
 * (同じチームがいつも最後にならないように)。
 */
export function meetingOrder(classDays: ClassDay[], today: string, rotate: boolean): string[] {
  const ids: string[] = [...TEAM_IDS];
  if (!rotate) return ids;
  const held = classDays.filter((d) => d.meeting && d.date < today).length;
  const k = held % ids.length;
  return [...ids.slice(k), ...ids.slice(0, k)];
}

/** 今日より前で、いちばん新しいミーティング記録。 */
export function previousMeeting(meetings: Meeting[], today: string): Meeting | undefined {
  return meetings.filter((m) => m.date < today).sort((a, b) => b.date.localeCompare(a.date))[0];
}

/** 順番の中で、current の次 (dir=1) / 前 (dir=-1) のチーム。端では null。 */
export function neighborTeam(order: string[], current: string, dir: 1 | -1): string | null {
  const i = order.indexOf(current);
  return i < 0 ? null : order[i + dir] ?? null;
}
