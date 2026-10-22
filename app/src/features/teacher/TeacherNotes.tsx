import { useState } from 'react';
import { addTeacherNote, deleteTeacherNote, useTeacherNotes } from '../../data/meetings';

/** 教員専用メモ。学生の画面にも、共有ミーティング画面にも出ない。 */
export function TeacherNotes({ teamId }: { teamId: string }) {
  const { data: notes, error } = useTeacherNotes(teamId);
  const [v, setV] = useState('');
  const [err, setErr] = useState('');
  if (error) return <p className="error">{error}</p>;
  if (!notes) return <p>読み込み中…</p>;
  const run = async (fn: () => Promise<unknown>) => { setErr(''); try { await fn(); } catch (e) { setErr(`できませんでした: ${(e as Error).message}`); } };
  return (
    <>
      <p className="hint">ここに書いたことは、教員だけが見られます。学生の画面には出ません。</p>
      <div className="card form">
        <textarea rows={3} maxLength={5000} value={v} onChange={(e) => setV(e.target.value)} placeholder="メモ(面談の内容、気になったこと、など)" />
        <div className="row">
          <button disabled={!v.trim()} onClick={() => run(async () => { await addTeacherNote(teamId, v.trim()); setV(''); })}>メモを追加</button>
        </div>
        {err && <p className="error">{err}</p>}
      </div>
      {[...notes].sort((a, b) => b.createdAt - a.createdAt).map((n) => (
        <div className="card" key={n.id}>
          <span className="hint">{new Date(n.createdAt).toLocaleString('ja-JP')}</span>
          <p className="memo">{n.body}</p>
          <button className="ghost danger" onClick={() => run(() => deleteTeacherNote(n.id))}>削除</button>
        </div>
      ))}
      {notes.length === 0 && <p className="hint">メモはまだありません。</p>}
    </>
  );
}
