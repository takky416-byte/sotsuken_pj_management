import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { recordAccess } from '../data/access';
import { addView, emptyPending, hasPending, screenOf, type Pending } from '../lib/access';

const FLUSH_MS = 120_000; // 書き込みを増やしすぎないよう、画面の表示は2分ごとにまとめて書く

/**
 * 学生のアクセス記録 (教員だけが見る)。開いた回数と、画面の表示回数を、日ごとにまとめて書く。
 * 画面の中身や入力した内容は記録しない。教員のプレビューや教員自身のアクセスは記録しない (学生本人のときだけ置く)。
 */
export function AccessTracker({ sid, teamId }: { sid: string; teamId: string | null }) {
  const { pathname } = useLocation();
  const pending = useRef<Pending>(emptyPending());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const started = useRef(false);

  const flush = useRef<() => void>(() => undefined);
  flush.current = () => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    const p = pending.current;
    if (!hasPending(p)) return;
    pending.current = emptyPending();
    recordAccess(sid, teamId, p).catch(() => undefined);
  };

  useEffect(() => {
    if (!started.current) {
      started.current = true;
      let first = true;
      try { first = sessionStorage.getItem('access-visit') !== sid; sessionStorage.setItem('access-visit', sid); } catch { /* 取れなければ、毎回1回と数える */ }
      if (first) pending.current = { ...pending.current, visits: 1 };
    }
    pending.current = addView(pending.current, screenOf(pathname));
    if (pending.current.visits > 0 && pending.current.views === 1) flush.current(); // 開いた直後は、すぐ書く
    else if (!timer.current) timer.current = setTimeout(() => flush.current(), FLUSH_MS);
  }, [pathname]);

  useEffect(() => {
    const out = () => { if (document.visibilityState === 'hidden') flush.current(); };
    document.addEventListener('visibilitychange', out);
    return () => { document.removeEventListener('visibilitychange', out); flush.current(); };
  }, []);

  return null;
}
