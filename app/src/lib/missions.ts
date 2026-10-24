// ミッション: 毎日の個人のミッションと、週ごとのチームのミッション。
// すべて、タスク・作業ログのデータから求める (達成の記録のために、別の書き込みはしない)。
// 点数や順位は出さない。「WBSを整える」「やったことを記録に残す」行動を、わかりやすい目標にするためのもの。
import type { Task } from '../types';
import { addDays, jstDate } from './dates';
import { ADHOC_ROOT_ID } from './adhoc';
import { isLeaf, isPlaceholder } from './meetingView';
import type { Thank } from './engagement';
import { sendersSince } from './thanksView';

export type Mission = {
  id: string;
  label: string;
  /** 未達成のときの、次の一手 */
  hint: string;
  done: boolean;
  /** 行き先 (画面の名前) */
  to: 'wbs' | 'daily' | 'gantt' | 'home';
};

const open = (t: Task) => t.status !== 'done' && t.status !== 'hold';

/** 自分の担当 (子のない、未完了のタスク) */
const myOpen = (live: Task[], sid: string) => live.filter((t) => isLeaf(live, t) && (t.assignees ?? []).includes(sid) && open(t));

/** 今日、自分がタスクを更新した (状態・期間・追加など)。作業ログの提出でタスクが更新されたときも含む。 */
export const touchedToday = (live: Task[], sid: string, today: string): number =>
  live.filter((t) => t.updatedBy === sid && dayOf(t.updatedAt) === today).length;

/** 更新時刻の日付 (JST)。時刻が入っていないデータでも落ちないよう、読めなければ空文字 */
const dayOf = (ms: number): string => (Number.isFinite(ms) ? jstDate(new Date(ms)) : '');

export function dailyMissions(
  tasks: Task[], sid: string, _today: string, opts: { dailySubmitted: boolean; isClassDay: boolean; thankedToday?: boolean },
): Mission[] {
  const live = tasks.filter((t) => !t.deleted);
  const mine = myOpen(live, sid);
  const undated = mine.filter((t) => !t.startDate && !t.endDate);
  const out: Mission[] = [
    {
      id: 'plan', to: 'wbs', done: mine.length > 0 && undated.length === 0,
      label: '自分の担当タスクに、期間を入れる',
      hint: mine.length === 0 ? '担当のタスクがありません。WBSで、やるものを担当にしましょう' : `期間が入っていないタスクが${undated.length}件あります`,
    },
  ];
  if (opts.isClassDay || opts.dailySubmitted) {
    out.push({ id: 'daily', to: 'daily', done: opts.dailySubmitted, label: '作業ログを入れる', hint: '何を・どこまでやったかを書きます' });
  }
  if (opts.thankedToday !== undefined) {
    out.push({ id: 'thanks', to: 'home', done: opts.thankedToday, label: 'チームの誰かに、ありがとうを送る', hint: 'ホームの「ありがとう」から、スタンプを1タップで送れます' });
  }
  return out;
}

/** 今週 (月曜〜今日) の始まり */
export function weekStart(today: string): string {
  const dow = new Date(`${today}T00:00:00Z`).getUTCDay(); // 0=日
  return addDays(today, -((dow + 6) % 7));
}

export type WeeklyMission = Mission & { detail: string };

/** チームの今週のミッション。メンバー全員で達成するもの。 */
export function weeklyMissions(tasks: Task[], members: { sid: string; name: string }[], today: string, thanks?: Thank[]): WeeklyMission[] {
  const live = tasks.filter((t) => !t.deleted);
  const start = weekStart(today);
  const leaves = live.filter((t) => isLeaf(live, t) && !isPlaceholder(live, t) && open(t));
  const undated = leaves.filter((t) => !t.startDate && !t.endDate);
  const overdue = leaves.filter((t) => t.endDate !== null && t.endDate < today);
  const quiet = members.filter((m) => !live.some((t) => t.updatedBy === m.sid && dayOf(t.updatedAt) >= start));
  const adhocKids = live.filter((t) => t.parentId === ADHOC_ROOT_ID);

  const out: WeeklyMission[] = [
    {
      id: 'everyone', to: 'wbs', done: members.length > 0 && quiet.length === 0,
      label: '全員が、今週の作業を更新する', hint: '作業ログを出すか、タスクの期間などを更新します',
      detail: quiet.length === 0 ? '全員が更新しました' : `まだ: ${quiet.map((m) => m.name).join('・')}`,
    },
    {
      id: 'dated', to: 'gantt', done: undated.length === 0,
      label: '未完了のタスクすべてに、期間を入れる', hint: 'ガントチャートで、バーをなぞって期間を入れられます',
      detail: undated.length === 0 ? 'すべて入っています' : `あと${undated.length}件`,
    },
    {
      id: 'overdue', to: 'wbs', done: overdue.length === 0,
      label: '期限を過ぎたタスクを、0にする', hint: '終わっていれば完了に、遅れているなら期間を見直します',
      detail: overdue.length === 0 ? '期限超過はありません' : `あと${overdue.length}件`,
    },
  ];
  if (thanks) {
    const senders = sendersSince(thanks, start);
    const quietT = members.filter((m) => !senders.has(m.sid));
    out.push({
      id: 'thanks', to: 'home', done: members.length > 0 && quietT.length === 0,
      label: '全員が、今週だれかにありがとうを送る', hint: 'スタンプ1つで送れます',
      detail: quietT.length === 0 ? '全員が送りました' : `まだ: ${quietT.map((m) => m.name).join('・')}`,
    });
  }
  if (adhocKids.length > 0) {
    out.push({
      id: 'adhoc', to: 'wbs', done: false,
      label: '「WBS外の作業」を、WBSの正しい場所に移す', hint: 'チームで話して、親タスクを決めます',
      detail: `${adhocKids.length}件`,
    });
  }
  return out;
}
