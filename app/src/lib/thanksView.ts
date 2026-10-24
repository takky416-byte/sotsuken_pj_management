// ありがとうを送りやすくするための下ごしらえ (画面に依存しない)。
import type { Task } from '../types';
import { addDays, jstDate } from './dates';
import type { Thank } from './engagement';
import { isLeaf } from './meetingView';

/** 1日に送れる数 (送りすぎで意味が薄れないよう、画面で制限する) */
export const THANKS_PER_DAY = 5;

/** ワンタップで送れるスタンプは、トーンで変わる (lib/tone.ts の stamps)。押すとそのまま送られる。 */
export const stampNote = (s: { emoji: string; label: string }) => `${s.emoji} ${s.label}`;

export type ThanksSuggestion = { to: string; name: string; reason: string };

const dayOf = (ms: number): string => (Number.isFinite(ms) ? jstDate(new Date(ms)) : '');

/**
 * 「ありがとうを送るきっかけ」: 最近 (3日以内) に、ほかのメンバーが完了にしたタスクや、WBSに足した作業。
 * 1人につき最新の1件。今日すでに送った相手は除く。新しい順に最大 n 件。
 */
export function suggestThanks(
  tasks: Task[], members: { sid: string; name: string }[], thanks: Thank[], viewer: string, today: string, n = 3,
): ThanksSuggestion[] {
  const live = tasks.filter((t) => !t.deleted);
  const since = addDays(today, -3);
  const sentToday = new Set(thanks.filter((t) => t.from === viewer && t.date === today).map((t) => t.to));
  const events = live
    .filter((t) => isLeaf(live, t) && t.updatedBy !== viewer && dayOf(t.updatedAt) >= since && (t.status === 'done' || t.source === 'adhoc'))
    .sort((a, b) => b.updatedAt - a.updatedAt);
  const out: ThanksSuggestion[] = [];
  for (const t of events) {
    const m = members.find((x) => x.sid === t.updatedBy);
    if (!m || sentToday.has(m.sid) || out.some((o) => o.to === m.sid)) continue;
    out.push({ to: m.sid, name: m.name, reason: t.status === 'done' ? `「${t.title}」を完了` : `「${t.title}」をWBSに追加` });
    if (out.length >= n) break;
  }
  return out;
}

/** 自分が今日あと何回送れるか */
export const thanksLeft = (thanks: Thank[], viewer: string, today: string): number =>
  Math.max(0, THANKS_PER_DAY - thanks.filter((t) => t.from === viewer && t.date === today).length);

/** まだ見ていない、自分宛てのありがとう (seen より新しいもの)。新しい順。 */
export const unseenFor = (thanks: Thank[], viewer: string, seen: number): Thank[] =>
  thanks.filter((t) => t.to === viewer && t.createdAt > seen).sort((a, b) => b.createdAt - a.createdAt);

/** 今週 (月曜〜) に、1回以上送った人の割合を見るための、送った人の集合 */
export const sendersSince = (thanks: Thank[], since: string): Set<string> =>
  new Set(thanks.filter((t) => t.date >= since).map((t) => t.from));
