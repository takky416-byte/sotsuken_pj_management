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
/**
 * 教員は、画面を行き来して、全チームのデータ (ダッシュボードだけで約770回) を何度も開く。5分で解除すると、そのたびに読み直すので、
 * 長く保持する (保持中は、変更が届く分だけ読む)。ただし、アクセス履歴や変更履歴のように、変更が頻繁で量が多いものは、短いまま。
 */
export const TEACHER_GRACE_MS = 30 * 60 * 1000;
const SHORT_KEYS = ['access:', 'taskLogs-since:'];
let teacherMode = false;
export const setTeacherMode = (v: boolean) => { teacherMode = v; };
export const graceOf = (key: string, teacher = teacherMode): number =>
  teacher && !SHORT_KEYS.some((p) => key.startsWith(p)) ? TEACHER_GRACE_MS : GRACE_MS;

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
        entry.timer = setTimeout(() => { entry.unsub(); if (store.get(key) === entry) store.delete(key); }, graceOf(key));
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
