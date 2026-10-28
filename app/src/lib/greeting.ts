// ホームのあいさつ。時間帯で変わり、開くたびに少し違う (遊び心)。トーンに合わせる:
//   standard (標準): おだやかな丁寧語 (絵文字・感嘆符は使わない)
//   casual (カジュアル): 明るい言い方と絵文字
//   simple (シンプル): 時間帯のあいさつだけ (毎回同じ)
import type { ToneId } from './tone';

export type Slot = 'morning' | 'day' | 'evening' | 'night';

/** 日本時間の時刻 (0〜23) から、時間帯を決める */
export function slotOf(hour: number): Slot {
  if (hour >= 5 && hour < 10) return 'morning';
  if (hour >= 10 && hour < 17) return 'day';
  if (hour >= 17 && hour < 22) return 'evening';
  return 'night';
}

export const jstHour = (now: Date = new Date()): number => (now.getUTCHours() + 9) % 24;
const WEEKDAY_JST = (now: Date): number => new Date(now.getTime() + 9 * 3600 * 1000).getUTCDay();

const PLAIN: Record<Slot, string> = { morning: 'おはようございます', day: 'こんにちは', evening: 'こんばんは', night: 'こんばんは' };

// {n} は名前 (「〇〇さん」)
const STANDARD: Record<Slot, string[]> = {
  morning: ['おはようございます、{n}', '{n}、おはようございます。今日もよろしくお願いします', '{n}、おはようございます。いい朝ですね', '朝から、おつかれさまです、{n}'],
  day: ['こんにちは、{n}', '{n}、こんにちは。調子はいかがですか', '{n}、こんにちは。今日も一歩ずつ、前に進みましょう', 'こんにちは、{n}。今日もおつかれさまです'],
  evening: ['こんばんは、{n}', '{n}、おつかれさまです', '{n}、今日もおつかれさまでした', 'こんばんは、{n}。ひと息ついていますか'],
  night: ['{n}、こんばんは。遅くまでおつかれさまです。今日の積み重ねは、ちゃんと力になっています', '遅い時間ですね、{n}。ここまでの頑張りは、確実に前に進んでいます', 'こんばんは、{n}。あと少し、今日の成果をしっかり残しましょう'],
};
const CASUAL: Record<Slot, string[]> = {
  morning: ['おはよう、{n}! ☀️', '{n}、おはよう! 今日も一歩ずつ行こう 🚶', 'おっ、朝から {n}! えらい 🌱', '{n}、おはよー! コーヒー飲んだ? ☕'],
  day: ['やっほー、{n}! 👋', '{n}、調子どう? 😊', 'こんにちは、{n}! 今日もいっしょにがんばろう 🔥', '{n}、お昼ごはん食べた? 🍙'],
  evening: ['{n}、おつかれさま! 🌆', 'こんばんは、{n}! 今日もおつかれー 🍵', '{n}、今日もがんばったね 👏', 'おっ、{n}! ひと息つこう 🛋️'],
  night: ['{n}、夜もがんばってるね! 応援してる 🌙', 'こんばんは、{n}。遅くまでありがとう。今日の一歩は、ちゃんと前進だよ 🦉', '{n}、ラストスパート! 今日の成果を残そう ✨'],
};
/** 曜日のひとこと (標準・カジュアルで、ときどき混ぜる)。キー: 0=日 … 6=土 */
const DAY_STANDARD: Record<number, string> = { 1: '{n}、今週もよろしくお願いします', 5: '{n}、金曜日ですね。あと少しです' };
const DAY_CASUAL: Record<number, string> = { 1: '{n}、今週もよろしく! 💪', 5: '{n}、金曜日だ! あと少し 🎉' };

/**
 * あいさつの文。pick は 0以上1未満の乱数 (テスト・固定のため、外から渡せる)。
 * 開くたびに変えたいが、画面の描き直しで変わると落ち着かないので、呼ぶ側が1回だけ決めた pick を使い続ける。
 */
export function greetingText(name: string, tone: ToneId, now: Date = new Date(), pick: number = Math.random()): string {
  const n = `${name}さん`;
  const slot = slotOf(jstHour(now));
  if (tone === 'simple') return `${PLAIN[slot]}、${n}`;
  const pool = [...(tone === 'casual' ? CASUAL : STANDARD)[slot]];
  const dayLine = (tone === 'casual' ? DAY_CASUAL : DAY_STANDARD)[WEEKDAY_JST(now)];
  if (dayLine && (slot === 'morning' || slot === 'day')) pool.push(dayLine);
  return pool[Math.min(pool.length - 1, Math.floor(pick * pool.length))].replace('{n}', n);
}

/** アプリを開いてから、同じ乱数を使い続ける (画面を移動しても、あいさつが変わらない) */
export const sessionPick: number = Math.random();
