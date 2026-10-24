// 新しい版を公開したあと、開きっぱなしの古い画面が、消えた部品 (ファイル) を読もうとして失敗することがある。
// そのときは、1回だけ自動で再読み込みして、新しい版にする。それでも直らなければ、案内を出す。

const KEY = 'reloaded-for-update';
const WINDOW_MS = 60_000;

export const isStaleChunkError = (e: unknown): boolean =>
  /dynamically imported module|Importing a module script failed|Loading chunk|error loading dynamically/i.test(String((e as { message?: string })?.message ?? e));

/** 再読み込みしてよいか (直前1分以内に、すでに再読み込みしていたら、false。無限ループを防ぐ) */
export function mayReloadForUpdate(now = Date.now()): boolean {
  try {
    const last = Number(sessionStorage.getItem(KEY) ?? 0);
    if (now - last < WINDOW_MS) return false;
    sessionStorage.setItem(KEY, String(now));
    return true;
  } catch { return false; }
}

export const STALE_MESSAGE = '新しい版が公開されたため、読み込めませんでした。ページを再読み込みしてください(Ctrl+Shift+R)。';
