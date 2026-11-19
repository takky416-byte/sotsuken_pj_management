// 利用状況の比較: チームの中のメンバーどうし、チームどうしを、割合・週ごとの動き・率で見る。
// 順位や点数はつけない。「偏り」と「時間の流れ」に気づくための数。
import type { AccessLog } from './access';
import type { Daily } from './daily';
import { addDays, jstDate } from './dates';
import type { Contribution } from './contribution';
import type { TaskLog } from './taskLog';

export type ShareKey = 'total' | 'wbs' | 'created' | 'completed' | 'daily' | 'access' | 'promises' | 'thanks';
export const SHARE_LABEL: Record<ShareKey, string> = {
  total: '総合(各指標の割合を、重みをつけて平均)',
  wbs: 'WBSを変更した日数(直接+作業ログ経由。1日に何件変えても1日)', created: 'タスクを追加した日数(1日に何件足しても1日)',
  completed: '完了にした回数', daily: '作業ログの提出数', access: 'アクセス日数', promises: 'ミーティングの約束を果たした数', thanks: 'ありがとうを送った数',
};
/** 総合に含める指標 (記録のないものは、数えない) */
export const TOTAL_KEYS: Exclude<ShareKey, 'total'>[] = ['wbs', 'created', 'completed', 'daily', 'access', 'promises', 'thanks'];
/** 総合の重み。大きいほど、総合に強く効く。0 は、総合に含めない。倍率なので、比だけが意味を持つ */
export const TOTAL_WEIGHT: Record<Exclude<ShareKey, 'total'>, number> = {
  wbs: 3, created: 3, completed: 2, daily: 3, access: 2, promises: 0, thanks: 0.5,
};
const valueOf = (r: Contribution, k: Exclude<ShareKey, 'total'>): number =>
  k === 'wbs' ? r.wbsDays : k === 'created' ? r.createdDays : k === 'completed' ? r.completed : k === 'daily' ? r.daily.submitted
    : k === 'promises' ? r.promises.done : k === 'thanks' ? r.thanksSent : r.access?.days ?? 0;

/**
 * チーム全体を100%として、各メンバーの割合。合計が0のときは、全員 null (割合を出さない)。
 * 総合 (total): 各指標の割合を出して、記録のある指標だけで、重み (TOTAL_WEIGHT) をかけて平均する (単位の違う数を、そのまま足さない)。value は、その割合 (%)。
 */
export function shares(rows: Contribution[], key: ShareKey): { sid: string; name: string; value: number; pct: number | null }[] {
  if (key === 'total') {
    const per = TOTAL_KEYS.filter((k) => TOTAL_WEIGHT[k] > 0).map((k) => ({ w: TOTAL_WEIGHT[k], s: shares(rows, k) })).filter((p) => p.s.some((x) => x.pct !== null));
    const wsum = per.reduce((n, p) => n + p.w, 0);
    return rows.map((r, i) => {
      if (per.length === 0) return { sid: r.sid, name: r.name, value: 0, pct: null };
      const avg = per.reduce((n, p) => n + p.w * (p.s[i].pct ?? 0), 0) / wsum;
      return { sid: r.sid, name: r.name, value: Math.round(avg * 10) / 10, pct: avg };
    });
  }
  const total = rows.reduce((n, r) => n + valueOf(r, key), 0);
  return rows.map((r) => ({ sid: r.sid, name: r.name, value: valueOf(r, key), pct: total === 0 ? null : (valueOf(r, key) / total) * 100 }));
}

/** 偏り: いちばん多い人の割合 (WBSを変更した日数)。2人未満、または記録がないときは null。 */
export function skew(rows: Contribution[]): number | null {
  if (rows.length < 2) return null;
  const s = shares(rows, 'wbs');
  return s[0].pct === null ? null : Math.max(...s.map((x) => x.pct as number));
}

/** 月曜日 (週の始まり) */
export function weekStart(date: string): string {
  const dow = new Date(`${date}T00:00:00Z`).getUTCDay(); // 0=日
  return addDays(date, -((dow + 6) % 7));
}

export type Weekly = { weeks: string[]; rows: { sid: string; name: string; counts: number[] }[]; max: number };

/** メンバー × 週 の、動いた回数 (WBSを変更した日・作業ログの提出・アクセスした日。それぞれ、1日1回)。 */
export function weeklyActivity(input: {
  members: { sid: string; name: string }[]; from: string; today: string;
  taskLogs: TaskLog[]; dailies: Daily[]; access: AccessLog[] | null;
}): Weekly {
  const first = weekStart(input.from);
  const weeks: string[] = [];
  for (let w = first; w <= input.today; w = addDays(w, 7)) weeks.push(w);
  const idx = (date: string) => weeks.indexOf(weekStart(date));
  const rows = input.members.map((m) => {
    const counts = weeks.map(() => 0);
    const bump = (date: string) => { const i = idx(date); if (i >= 0 && date >= input.from && date <= input.today) counts[i]++; };
    // WBSの変更は、1日に何件あっても1回 (初期WBSの見直しなど、まとめて直した日が、突出しないように)
    for (const date of new Set(input.taskLogs.filter((l) => l.by === m.sid).map((l) => jstDate(new Date(l.at))))) bump(date);
    for (const d of input.dailies) if (d.sid === m.sid && (d.entries?.length ?? 0) > 0) bump(d.date);
    for (const a of input.access ?? []) if (a.sid === m.sid) bump(a.date);
    return { sid: m.sid, name: m.name, counts };
  });
  return { weeks, rows, max: Math.max(0, ...rows.flatMap((r) => r.counts)) };
}

export type RateKey = 'daily' | 'access' | 'done';
export const RATE_LABEL: Record<RateKey, string> = { daily: '作業ログの提出率', access: 'アクセスした日の割合', done: '担当タスクの完了率' };

/** メンバーごとの率 (0〜1)。分母が0なら null。 */
export function rateOf(r: Contribution, key: RateKey, periodDays: number): number | null {
  if (key === 'daily') return r.daily.days === 0 ? null : r.daily.submitted / r.daily.days;
  if (key === 'access') return !r.access || periodDays === 0 ? null : Math.min(1, r.access.days / periodDays);
  return r.assigned.total === 0 ? null : r.assigned.done / r.assigned.total;
}

export type TeamSummary = {
  teamId: string; members: number;
  daily: number | null; access: number | null; done: number | null;
  completedPerMember: number; overdue: number; skew: number | null;
};

const pooled = (xs: (number | null)[]): number | null => {
  const v = xs.filter((x): x is number => x !== null);
  return v.length === 0 ? null : v.reduce((a, b) => a + b, 0) / v.length;
};

/** チームの1行。率は、メンバーの率の平均 (人数の違いに左右されない)。 */
export function summarize(teamId: string, rows: Contribution[], periodDays: number): TeamSummary {
  return {
    teamId, members: rows.length,
    daily: pooled(rows.map((r) => rateOf(r, 'daily', periodDays))),
    access: pooled(rows.map((r) => rateOf(r, 'access', periodDays))),
    done: pooled(rows.map((r) => rateOf(r, 'done', periodDays))),
    completedPerMember: rows.length === 0 ? 0 : rows.reduce((n, r) => n + r.completed, 0) / rows.length,
    overdue: rows.reduce((n, r) => n + r.overdue, 0),
    skew: skew(rows),
  };
}

/** 期間の日数 (両端を含む) */
export const periodDays = (from: string, today: string): number =>
  Math.max(1, Math.round((Date.parse(today) - Date.parse(from)) / 86400000) + 1);
