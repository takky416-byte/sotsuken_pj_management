// 「事実の確認」: メンバーごとの活動を、記録されたデータだけから示す。
// 評価や推測はしない。「最後に動いたのはいつか」「作業レポートは出ているか」「約束は果たされたか」を並べ、気づける形にする。
import type { Task } from '../types';
import { classDatesBetween, fromDailyStart, statusOf, type Daily, type DayStatus } from './daily';
import { addDays, jstDate } from './dates';
import { daysBetween } from './gantt';
import { isLeaf, isPlaceholder } from './meetingView';
import type { Meeting } from './meeting';
import type { ClassDay } from '../types';

export type MemberFacts = {
  sid: string;
  name: string;
  /** 最後に、タスクを更新した日・作業レポートを出した日 (どちらか新しいほう)。記録がなければ null */
  lastActive: string | null;
  /** lastActive から今日まで。記録がなければ null */
  idleDays: number | null;
  /** 直近7日に更新したタスクの数 */
  updates7: number;
  /** 直近7日に完了にしたタスクの数 */
  done7: number;
  /** 作業レポート: 提出した授業日 / 数える授業日。読めないとき (他の人の分で、閲覧がオフ) は null */
  daily: { submitted: number; days: number; missed: number } | null;
  open: number;
  overdue: number;
  /** 前回までのミーティングで、この人が担当になった約束: 果たした / 全体 */
  promises: { done: number; total: number };
  /** 客観的な事実から言える気づき (評価ではない) */
  notes: string[];
};

const dayOf = (ms: number): string => (Number.isFinite(ms) ? jstDate(new Date(ms)) : '');

export type FactsInput = {
  members: { sid: string; name: string }[];
  tasks: Task[];
  /** null: 作業レポートを読めない */
  dailies: Daily[] | null;
  meetings: Meeting[];
  classDays: ClassDay[];
  today: string;
  dailyStart: string;
  windowFrom: string;
  kickoffDate: string | null;
};

export function memberFacts(input: FactsInput): MemberFacts[] {
  const { today } = input;
  const live = input.tasks.filter((t) => !t.deleted);
  const week = addDays(today, -7);
  const from = [input.windowFrom, input.dailyStart, input.kickoffDate ?? ''].sort().at(-1) as string;
  const dates = classDatesBetween(fromDailyStart(input.classDays, input.dailyStart), from, `${today}~`);
  const byKey = new Map((input.dailies ?? []).map((d) => [`${d.date}_${d.sid}`, d]));

  return input.members.map((m) => {
    const mineUpdated = live.filter((t) => t.updatedBy === m.sid && dayOf(t.updatedAt) !== '');
    const lastTask = mineUpdated.map((t) => dayOf(t.updatedAt)).sort().at(-1) ?? null;
    const subDates = (input.dailies ?? []).filter((d) => d.sid === m.sid && statusOf(d) === 'submitted').map((d) => d.date).sort();
    const lastDaily = subDates.at(-1) ?? null;
    const lastActive = [lastTask, lastDaily].filter((x): x is string => !!x).sort().at(-1) ?? null;

    let daily: MemberFacts['daily'] = null;
    if (input.dailies) {
      const st = dates.map((d): [string, DayStatus] => [d, statusOf(byKey.get(`${d}_${m.sid}`))]);
      const counted = st.filter(([d, s]) => s !== 'absent' && (d < today || s === 'submitted'));
      const submitted = counted.filter(([, s]) => s === 'submitted').length;
      daily = { submitted, days: counted.length, missed: counted.length - submitted };
    }
    const mine = live.filter((t) => isLeaf(live, t) && !isPlaceholder(live, t) && (t.assignees ?? []).includes(m.sid) && t.status !== 'hold');
    const open = mine.filter((t) => t.status !== 'done');
    const overdue = open.filter((t) => t.endDate !== null && t.endDate < today).length;
    const promises = input.meetings.filter((x) => x.id < today).flatMap((x) => x.actions).filter((a) => a.owner === m.sid);
    const idleDays = lastActive ? daysBetween(lastActive, today) : null;

    const notes: string[] = [];
    if (open.length > 0 || mine.length > 0) {
      if (idleDays === null) notes.push('WBSの更新も作業レポートも、記録がありません');
      else if (idleDays >= 7) notes.push(`${idleDays}日間、WBSの更新も作業レポートもありません(最後: ${lastActive!.slice(5).replace('-', '/')})`);
    }
    if (daily && daily.missed >= 2) notes.push(`作業レポートが${daily.missed}回、未提出です`);
    if (overdue > 0) notes.push(`期限超過が${overdue}件あります`);
    const missedPromises = promises.filter((a) => !a.done).length;
    if (missedPromises > 0) notes.push(`前回までの約束が${missedPromises}件、果たされていません`);
    if (mine.length === 0) notes.push('担当のタスクがありません');
    return {
      sid: m.sid, name: m.name, lastActive, idleDays,
      updates7: mineUpdated.filter((t) => dayOf(t.updatedAt) >= week).length,
      done7: mineUpdated.filter((t) => t.status === 'done' && dayOf(t.updatedAt) >= week && (t.assignees ?? []).includes(m.sid)).length,
      daily, open: open.length, overdue, promises: { done: promises.filter((a) => a.done).length, total: promises.length }, notes,
    };
  });
}
