// トーン (画面の雰囲気)。配色と同じように、この端末のブラウザにだけ保存する。
//   calm: 落ち着き (標準)。絵文字や感嘆符を使わず、角の小さい見た目。
//   friendly: 親しみやすい。見出しに絵文字、達成の知らせは明るい言い方、紙吹雪、丸みのある見た目。
import { useSyncExternalStore } from 'react';

export const TONES = [
  { id: 'calm', label: '落ち着き' },
  { id: 'friendly', label: '親しみやすい' },
] as const;
export type ToneId = (typeof TONES)[number]['id'];
const KEY = 'tone';
const listeners = new Set<() => void>();

export function getTone(): ToneId {
  try {
    const v = localStorage.getItem(KEY);
    if (TONES.some((t) => t.id === v)) return v as ToneId;
  } catch { /* 保存できない環境では、既定のまま */ }
  return 'calm';
}

export function applyTone(id: ToneId = getTone()) {
  document.documentElement.dataset.tone = id;
}

export function setTone(id: ToneId) {
  try { localStorage.setItem(KEY, id); } catch { /* 保存できなくても、この画面では切り替わる */ }
  applyTone(id);
  listeners.forEach((fn) => fn());
}

/** トーンが変わったら、画面を描き直す */
export function useTone(): ToneId {
  return useSyncExternalStore((fn) => { listeners.add(fn); return () => { listeners.delete(fn); }; }, getTone, () => 'calm');
}

const pick = <T,>(calm: T, friendly: T): T => (getTone() === 'friendly' ? friendly : calm);

/** 達成の知らせの文言 (呼んだ時点のトーンで決まる) */
export const say = {
  taskDone: (parentTitle: string | null, done: number, total: number): string =>
    parentTitle
      ? pick(`「${parentTitle}」のタスクが、すべて完了しました`, `「${parentTitle}」がぜんぶ完了!`)
      : pick(`完了しました(チーム全体 ${done}/${total})`, `完了! チーム全体 ${done}/${total}`),
  promiseKept: (): string => pick('約束を果たしました', '約束を果たしました!'),
  missionsAll: (): string => pick('今日のミッションを、すべて達成しました', '今日のミッション、ぜんぶ達成!'),
  missionsClear: (): string => pick('すべて達成しました。', 'ぜんぶ達成! 今日もおつかれさま。'),
  thanksReceived: (from: string): string => pick(`${from}さんから、ありがとうが届きました`, `${from}さんから、ありがとうが届きました!`),
  thanksReceivedMany: (n: number): string => pick(`ありがとうが${n}件届きました`, `ありがとうが${n}件届きました!`),
  thanksSent: (to: string): string => `${to}さんに、ありがとうを送りました`,
  dailySubmitted: (streak: number): string =>
    streak >= 2 ? pick(`提出しました(${streak}回連続)`, `提出しました! ${streak}日連続`) : pick('提出しました', '提出しました! おつかれさま'),
};

/** ありがとうのスタンプ。押すと、そのまま送られる。 */
export function stamps(): { emoji: string; label: string }[] {
  return pick(
    [{ emoji: '🙏', label: '助かりました' }, { emoji: '👍', label: 'ありがとう' }, { emoji: '👏', label: 'お疲れさま' }, { emoji: '💡', label: 'いい視点' }, { emoji: '🎉', label: 'おめでとう' }],
    [{ emoji: '🙏', label: '助かった' }, { emoji: '👏', label: 'ナイス!' }, { emoji: '🎉', label: 'おめでとう' }, { emoji: '💪', label: 'がんばってるね' }, { emoji: '💡', label: 'いい考え' }],
  );
}
