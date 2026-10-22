import { useEffect, useReducer } from 'react';

/**
 * Firestore の購読を、画面をまたいで共有する。
 * 画面を移るたびに購読し直すと、同じデータを何度も読み取ってしまう (読み取りの無料枠は 1 日 5 万回)。
 * そこで、同じキーの購読は 1 つにまとめ、画面から離れても GRACE_MS のあいだは解除せずに保持する。
 * 保持しているあいだの変更は、これまでどおりリアルタイムに届く。ログアウトでは、すべて解除する (clearShared)。
 */
type Entry = {
  data: unknown;
  ready: boolean;
  error: string | null;
  subs: Set<() => void>;
  unsub: () => void;
  timer: ReturnType<typeof setTimeout> | null;
};

const store = new Map<string, Entry>();
export const GRACE_MS = 5 * 60 * 1000;

export type Start<T> = (emit: (data: T) => void, fail: (message: string) => void) => () => void;

function open<T>(key: string, start: Start<T>): Entry {
  const e: Entry = { data: null, ready: false, error: null, subs: new Set(), unsub: () => undefined, timer: null };
  const notify = () => e.subs.forEach((f) => f());
  e.unsub = start(
    (d) => { e.data = d; e.ready = true; e.error = null; notify(); },
    (m) => { e.error = m; notify(); },
  );
  store.set(key, e);
  return e;
}

export function useShared<T>(key: string | null, start: Start<T>): { data: T | null; ready: boolean; error: string | null } {
  const [, rerender] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    if (!key) return;
    let e = store.get(key);
    if (e?.error) { e.unsub(); store.delete(key); e = undefined; } // 失敗した購読は、作り直す
    const entry = e ?? open(key, start);
    if (entry.timer) { clearTimeout(entry.timer); entry.timer = null; }
    entry.subs.add(rerender);
    rerender(); // すでに届いているデータを、すぐに反映する
    return () => {
      entry.subs.delete(rerender);
      if (entry.subs.size === 0) {
        entry.timer = setTimeout(() => { entry.unsub(); if (store.get(key) === entry) store.delete(key); }, GRACE_MS);
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  const e = key ? store.get(key) : undefined;
  return { data: e?.ready ? (e.data as T) : null, ready: !!e?.ready, error: e?.error ?? null };
}

/** すべての購読を解除する (ログアウト・ユーザーの切り替えのとき)。 */
export function clearShared() {
  for (const e of store.values()) { if (e.timer) clearTimeout(e.timer); e.unsub(); }
  store.clear();
}
