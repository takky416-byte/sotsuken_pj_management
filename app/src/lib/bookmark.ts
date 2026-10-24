// お気に入り (ブックマーク) への追加を促す、ホームのカードの下ごしらえ (画面に依存しない)。
export type Platform = 'ios' | 'android' | 'mac' | 'desktop';

export function platformOf(ua: string): Platform {
  if (/iPhone|iPad|iPod/i.test(ua)) return 'ios';
  if (/Android/i.test(ua)) return 'android';
  if (/Macintosh|Mac OS X/i.test(ua)) return 'mac'; // iPad の「デスクトップ表示」は Mac と名乗るが、まれなので Mac として案内する
  return 'desktop';
}

export const HOW_TO: Record<Platform, { title: string; steps: string[] }> = {
  ios: { title: 'iPhone・iPad (Safari)', steps: ['画面下の「共有」ボタン(□に↑)を押す', '「お気に入りに追加」、または「ホーム画面に追加」を選ぶ'] },
  android: { title: 'Android (Chrome)', steps: ['右上の「⋮」を押す', '「ホーム画面に追加」、または☆(ブックマーク)を押す'] },
  mac: { title: 'Mac', steps: ['⌘ + D を押す', '「お気に入りバー」などの保存先を選んで「追加」'] },
  desktop: { title: 'パソコン (Windows など)', steps: ['Ctrl + D を押す', '「ブックマークバー」などの保存先を選んで「完了」'] },
};

export type BookmarkState = { done: boolean; snoozedUntil: string | null; snoozes: number };
export const EMPTY_STATE: BookmarkState = { done: false, snoozedUntil: null, snoozes: 0 };
/** 「あとで」を押せる回数。これを超えたら、「追加した」を押すまで、毎回出す */
export const MAX_SNOOZES = 3;

/** カードを出すか。追加済みなら出さない。「あとで」の期間中は出さない。 */
export function shouldShow(s: BookmarkState, today: string): boolean {
  if (s.done) return false;
  return !s.snoozedUntil || s.snoozedUntil <= today;
}

export const snooze = (s: BookmarkState, today: string, addDays: (d: string, n: number) => string, days = 3): BookmarkState =>
  ({ ...s, snoozes: s.snoozes + 1, snoozedUntil: addDays(today, days) });

export const KEY = (email: string) => `bookmark:${email}`;
export function load(raw: string | null): BookmarkState {
  try {
    const v = raw ? (JSON.parse(raw) as Partial<BookmarkState>) : {};
    return { done: v.done === true, snoozedUntil: typeof v.snoozedUntil === 'string' ? v.snoozedUntil : null, snoozes: Number(v.snoozes) || 0 };
  } catch { return EMPTY_STATE; }
}
