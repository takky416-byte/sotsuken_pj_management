import { useEffect, useRef, useState } from 'react';
import { useProfile } from '../auth/AuthProvider';
import { draftStorageKey, readDraft, removeDraft, writeDraft } from '../lib/drafts';

/**
 * 書きかけが消えない入力欄の値。
 * - 書いた内容は、この端末に残す (画面を移っても、再読み込みしても、戻ってくる)。保存・送信できたら clear() で消す。
 * - base は、保存されている内容 (なければ '')。触っていない (base と同じ) ときは、ほかの人が保存した新しい内容に追いつく。
 *   書きかけのときは、ほかの人の保存で上書きしない。そのときは stale が true になる (知らせて、選んでもらう)。
 */
export function useDraftText(key: string | null, base: string) {
  const { email } = useProfile();
  const k = key ? draftStorageKey(email, key) : null;
  const [value, setVal] = useState(() => {
    const d = k ? readDraft(k) : null;
    return d && d.v !== base ? d.v : base;
  });
  const [restored] = useState(() => value !== base); // 前の書きかけを戻した
  const [stale, setStale] = useState(false);
  const prevBase = useRef(base);
  useEffect(() => {
    const p = prevBase.current;
    prevBase.current = base;
    if (p === base) return;
    setVal((cur) => {
      if (cur === p || cur === base) { if (k) removeDraft(k); setStale(false); return base; } // 触っていない → 追いつく
      setStale(true); // 書きかけ → 残す
      return cur;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base]);
  const setValue = (v: string) => {
    setVal(v);
    if (!k) return;
    if (v === base) removeDraft(k); else writeDraft(k, v);
  };
  /** 保存・送信できたとき。この端末の書きかけを消す */
  const clear = () => { if (k) removeDraft(k); setStale(false); };
  /** 書きかけをやめて、保存されている内容に戻す */
  const discard = () => { setVal(base); clear(); };
  return { value, setValue, dirty: value !== base, restored, stale, clear, discard };
}
