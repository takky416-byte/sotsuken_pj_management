// アクセス履歴 (教員だけが見る)。学生が、いつ・どの画面を開いたかを、日ごとにまとめて記録する。
// 記録するのは、日付・初回/最終の時刻・訪問の回数・画面の表示回数・画面の種類ごとの回数だけ。入力の内容や操作の詳細は記録しない。
import { addDays } from './dates';
import { daysBetween } from './gantt';

export type AccessLog = {
  id: string;
  sid: string;
  teamId: string | null;
  date: string;
  firstAt: number;
  lastAt: number;
  /** 開いた回数 (ブラウザのタブを開いてから閉じるまでを1回とする) */
  visits: number;
  /** 画面を表示した回数 */
  views: number;
  screens: Record<string, number>;
};

export const accessLogId = (date: string, sid: string) => `${date}_${sid}`;

export const SCREEN_LABEL: Record<string, string> = {
  home: 'ホーム', wbs: 'WBS', gantt: 'ガントチャート', team: 'チーム', report: '報告書', daily: '作業レポート', meeting: 'ミーティング', help: '使い方', other: 'その他',
};

/** パスから画面の種類。'/' → home、'/wbs' → wbs。知らない画面は other。 */
export function screenOf(pathname: string): string {
  const seg = pathname.split('/').filter(Boolean)[0] ?? '';
  if (seg === '') return 'home';
  return seg in SCREEN_LABEL && seg !== 'home' && seg !== 'other' ? seg : 'other';
}

export type Pending = { visits: number; views: number; screens: Record<string, number> };
export const emptyPending = (): Pending => ({ visits: 0, views: 0, screens: {} });
export const addView = (p: Pending, screen: string): Pending => ({
  ...p, views: p.views + 1, screens: { ...p.screens, [screen]: (p.screens[screen] ?? 0) + 1 },
});
export const hasPending = (p: Pending): boolean => p.visits > 0 || p.views > 0;

export type AccessDay = { date: string; log: AccessLog | null };
export type AccessRow = {
  sid: string;
  name: string;
  teamId: string;
  lastAt: number | null;
  lastDate: string | null;
  /** 最後のアクセスから今日まで (日)。記録がなければ null */
  daysSince: number | null;
  /** 直近 days 日のうち、アクセスした日数 */
  activeDays: number;
  /** 古い日 → 新しい日。days 個 */
  dates: AccessDay[];
  /** 画面の種類ごとの合計 (多い順) */
  topScreens: [string, number][];
};

export function accessSummary(
  logs: AccessLog[], students: { sid: string; name: string; teamId: string }[], today: string, days = 14,
): AccessRow[] {
  const range = Array.from({ length: days }, (_, i) => addDays(today, i - (days - 1)));
  return students.map((s) => {
    const mine = logs.filter((l) => l.sid === s.sid);
    const byDate = new Map(mine.map((l) => [l.date, l]));
    const last = mine.reduce<AccessLog | null>((a, l) => (!a || l.lastAt > a.lastAt ? l : a), null);
    const totals = new Map<string, number>();
    for (const l of mine) if (l.date >= range[0]) for (const [k, n] of Object.entries(l.screens ?? {})) totals.set(k, (totals.get(k) ?? 0) + n);
    return {
      sid: s.sid, name: s.name, teamId: s.teamId,
      lastAt: last?.lastAt ?? null, lastDate: last?.date ?? null,
      daysSince: last ? daysBetween(last.date, today) : null,
      activeDays: range.filter((d) => byDate.has(d)).length,
      dates: range.map((date) => ({ date, log: byDate.get(date) ?? null })),
      topScreens: [...totals.entries()].sort((a, b) => b[1] - a[1]),
    };
  }).sort((a, b) => a.teamId.localeCompare(b.teamId) || a.sid.localeCompare(b.sid, 'en', { numeric: true }));
}

/** 時刻 (日本時間) HH:mm */
export const timeLabel = (ms: number): string =>
  new Date(ms).toLocaleTimeString('ja-JP', { timeZone: 'Asia/Tokyo', hour: '2-digit', minute: '2-digit' });
