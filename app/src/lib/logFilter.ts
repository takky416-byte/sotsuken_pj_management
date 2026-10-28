import type { Daily } from './daily';

export type LogQuery = { sid?: string; from?: string; to?: string; q?: string };

const norm = (s: string) => s.normalize('NFKC').toLowerCase();

/**
 * 作業ログの絞り込み (教員の「作業ログ」一覧)。
 * sid: その人だけ。from/to: 日付の範囲 (両端を含む)。q: 文字 (空白で区切ると、すべてを含むもの。説明・次にやること・タスク名・困っていること)。
 */
export function filterDailies(dailies: Daily[], titleOf: (taskId: string) => string, query: LogQuery): Daily[] {
  const words = norm(query.q ?? '').split(/\s+/).filter(Boolean);
  return dailies.filter((d) => {
    if (query.sid && d.sid !== query.sid) return false;
    if (query.from && d.date < query.from) return false;
    if (query.to && d.date > query.to) return false;
    if (words.length === 0) return true;
    const text = norm([d.next ?? '', d.blocker ?? '', ...d.entries.flatMap((e) => [e.note ?? '', e.taskId ? titleOf(e.taskId) : ''])].join('\n'));
    return words.every((w) => text.includes(w));
  });
}
