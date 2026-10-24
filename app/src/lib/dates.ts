// 日付はすべて日本時間 (UTC+9) の 'YYYY-MM-DD' 文字列で扱う。
const JST_OFFSET_MS = 9 * 3600 * 1000;

export function jstDate(now: Date = new Date()): string {
  return new Date(now.getTime() + JST_OFFSET_MS).toISOString().slice(0, 10);
}

/** 20261028 の形。firestore.rules の todayJst() と同じ値になる。 */
export function dayKey(date: string): number {
  return Number(date.replaceAll('-', ''));
}

/** date に n 日を足した日付 (n は負でもよい) */
export function addDays(date: string, n: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
}

/**
 * 作業レポートを読み込む期間 (今日から何日前まで)。画面ごとに期間を変えると、別々の購読になって読み取りが増えるため、
 * どの画面も同じ期間にそろえる。ミーティング画面 (今週の活動)・教員のチーム詳細・提出状況・要確認の判定に足りる長さ。
 */
export const DAILY_WINDOW_DAYS = 21;
export const dailyWindowFrom = (today: string): string => addDays(today, -DAILY_WINDOW_DAYS);

export function isDateString(s: unknown): s is string {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));
}

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];

/** 10/28(水) の形 */
export function formatDate(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}(${WEEKDAYS[d.getUTCDay()]})`;
}
