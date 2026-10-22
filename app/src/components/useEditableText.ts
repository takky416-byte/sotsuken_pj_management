import { useCallback, useEffect, useRef, useState } from 'react';
import { decideCommit } from '../lib/editConflict';

/**
 * 入力欄のための状態。他の人が同じ項目を変更しても、入力中の内容は書き換えない。
 *  - 入力を始めていなければ (内容が変わっていなければ)、他の人の変更をそのまま取り込む。
 *  - 入力中に他の人が変更していて、保存しようとしたときは、勝手に上書きせず conflict を返す。
 *    利用者が resolveMine (自分の内容で保存) か resolveTheirs (相手の内容にする) を選ぶ。
 */
export function useEditableText(remote: string, save: (value: string) => void, opts: { trim?: boolean; allowEmpty?: boolean } = {}) {
  const { trim = true, allowEmpty = false } = opts;
  const [value, setValueState] = useState(remote);
  const [conflict, setConflict] = useState<string | null>(null); // 相手の内容
  const vRef = useRef(remote);
  const base = useRef(remote); // 編集を始めたときの保存済みの内容
  const editing = useRef(false);

  const setValue = useCallback((v: string) => { vRef.current = v; setValueState(v); }, []);

  useEffect(() => {
    if (conflict !== null) { if (remote !== conflict) setConflict(remote); return; }
    if (!editing.current || vRef.current === base.current) { base.current = remote; setValue(remote); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remote]);

  const norm = (v: string) => (trim ? v.trim() : v);

  const onFocus = () => {
    editing.current = true;
    if (conflict === null) base.current = remote;
  };

  /** 入力が終わったとき (フォーカスが外れた、Enter) */
  const commit = () => {
    editing.current = false;
    if (conflict !== null) return; // どちらにするか、まだ選んでいない
    const mine = norm(vRef.current);
    if (!allowEmpty && mine === '') { setValue(remote); return; }
    const d = decideCommit(mine, remote, base.current);
    if (d === 'noop') setValue(remote);
    else if (d === 'save') save(mine);
    else setConflict(remote);
  };

  const resolveMine = () => { save(norm(vRef.current)); setConflict(null); };
  const resolveTheirs = () => { if (conflict !== null) { setValue(conflict); base.current = conflict; } setConflict(null); };

  return { value, setValue, onFocus, commit, conflict, resolveMine, resolveTheirs };
}
