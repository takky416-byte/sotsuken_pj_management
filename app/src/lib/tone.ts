// トーン (画面の雰囲気)。配色と同じように、この端末のブラウザにだけ保存する。
//   standard (標準): 絵文字や感嘆符を使わない、おだやかな丁寧語。角の小さい見た目。
//   casual (カジュアル): 見出しに絵文字、達成の知らせは明るい言い方、紙吹雪、丸みのある見た目。
//   simple (シンプル): 飾りのない、短い言い方。装飾なしの平らな見た目。
import { useSyncExternalStore } from 'react';

export const TONES = [
  { id: 'standard', label: '標準' },
  { id: 'casual', label: 'カジュアル' },
  { id: 'simple', label: 'シンプル' },
] as const;
export type ToneId = (typeof TONES)[number]['id'];
const KEY = 'tone';
const listeners = new Set<() => void>();
/** 以前の名前で保存されている値 (落ち着き・親しみやすい) を、いまの名前にする */
const LEGACY: Record<string, ToneId> = { calm: 'standard', friendly: 'casual' };

export function getTone(): ToneId {
  try {
    const v = localStorage.getItem(KEY) ?? '';
    if (TONES.some((t) => t.id === v)) return v as ToneId;
    if (v in LEGACY) return LEGACY[v];
  } catch { /* 保存できない環境では、既定のまま */ }
  return 'standard';
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
  return useSyncExternalStore((fn) => { listeners.add(fn); return () => { listeners.delete(fn); }; }, getTone, () => 'standard');
}

/** トーンごとの文言を選ぶ */
export const byTone = <T,>(v: { standard: T; casual: T; simple: T }, tone: ToneId = getTone()): T => v[tone];
/** 達成の知らせの文言 (呼んだ時点のトーンで決まる) */
export const say = {
  taskDone: (parentTitle: string | null, done: number, total: number): string =>
    parentTitle
      ? byTone({ standard: `「${parentTitle}」のタスクが、すべて完了しました`, casual: `「${parentTitle}」がぜんぶ完了!`, simple: `「${parentTitle}」完了` })
      : byTone({ standard: `完了しました(チーム全体 ${done}/${total})`, casual: `完了! チーム全体 ${done}/${total}`, simple: `完了 ${done}/${total}` }),
  promiseKept: (): string => byTone({ standard: '約束を果たしました', casual: '約束を果たしました!', simple: '約束 完了' }),
  missionsAll: (): string => byTone({ standard: '今日のミッションを、すべて達成しました', casual: '今日のミッション、ぜんぶ達成!', simple: '今日のミッション 完了' }),
  missionsClear: (): string => byTone({ standard: 'すべて達成しました。', casual: 'ぜんぶ達成! 今日もおつかれさま。', simple: '完了' }),
  thanksReceived: (from: string): string => byTone({ standard: `${from}さんから、ありがとうが届きました`, casual: `${from}さんから、ありがとうが届きました!`, simple: `${from}さんからのありがとう` }),
  thanksReceivedMany: (n: number): string => byTone({ standard: `ありがとうが${n}件届きました`, casual: `ありがとうが${n}件届きました!`, simple: `ありがとう ${n}件` }),
  thanksSent: (to: string): string => byTone({ standard: `${to}さんに、ありがとうを送りました`, casual: `${to}さんに、ありがとうを送りました`, simple: `${to}さんに送信` }),
  dailySubmitted: (streak: number): string =>
    streak >= 2
      ? byTone({ standard: `提出しました(${streak}回連続)`, casual: `提出しました! ${streak}日連続`, simple: `提出済み(${streak}回連続)` })
      : byTone({ standard: '提出しました', casual: '提出しました! おつかれさま', simple: '提出済み' }),
};

/** ありがとうのスタンプ。押すと、そのまま送られる。 */
export function stamps(): { emoji: string; label: string }[] {
  return byTone({
    standard: [{ emoji: '🙏', label: '助かりました' }, { emoji: '👍', label: 'ありがとう' }, { emoji: '👏', label: 'お疲れさま' }, { emoji: '💡', label: 'いい視点' }, { emoji: '🎉', label: 'おめでとう' }],
    casual: [{ emoji: '🙏', label: '助かった' }, { emoji: '👏', label: 'ナイス!' }, { emoji: '🎉', label: 'おめでとう' }, { emoji: '💪', label: 'がんばってるね' }, { emoji: '💡', label: 'いい考え' }],
    simple: [{ emoji: '', label: '助かりました' }, { emoji: '', label: 'ありがとうございます' }, { emoji: '', label: '確認しました' }, { emoji: '', label: '参考になりました' }, { emoji: '', label: 'お疲れさまです' }],
  });
}
