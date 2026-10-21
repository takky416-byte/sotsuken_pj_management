import { useEffect, useState } from 'react';
import { api, today } from '../api.js';

const monday = () => {
  const d = new Date(today());
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
};
const blank = () => ({ week_of: monday(), done_text: '', issues: '', next_plan: '' });

export default function Logs({ uid, me, readOnly }) {
  const [logs, setLogs] = useState(null);
  const [form, setForm] = useState(blank());
  const [editId, setEditId] = useState(null);
  const [draft, setDraft] = useState({});
  const [err, setErr] = useState('');
  const base = `/users/${uid}/logs`;

  useEffect(() => { api('GET', base).then(setLogs).catch((e) => setErr(e.message)); }, [base]);
  const run = async (fn) => { setErr(''); try { await fn(); } catch (e) { setErr(e.message); } };

  const add = (e) => {
    e.preventDefault();
    run(async () => {
      const l = await api('POST', base, form);
      setLogs([l, ...logs]);
      setForm(blank());
    });
  };
  const save = (id) => run(async () => {
    const l = await api('PUT', `${base}/${id}`, draft);
    setLogs(logs.map((x) => (x.id === id ? { ...x, ...l } : x)));
    setEditId(null);
  });
  const remove = (id) => confirm('このログを削除しますか?') && run(async () => {
    await api('DELETE', `${base}/${id}`);
    setLogs(logs.filter((x) => x.id !== id));
  });
  const comment = (id, body) => run(async () => {
    const c = await api('POST', `${base}/${id}/comments`, { body });
    setLogs(logs.map((x) => (x.id === id ? { ...x, comments: [...x.comments, c] } : x)));
  });

  if (!logs) return <p>{err || '読み込み中…'}</p>;

  const fields = [['done_text', '今週やったこと'], ['issues', '課題・相談したいこと'], ['next_plan', '来週の予定']];

  return (
    <>
      {err && <p className="error">{err}</p>}
      {!readOnly && (
        <form className="card" onSubmit={add}>
          <label>対象週（月曜日）<input type="date" value={form.week_of} onChange={(e) => setForm({ ...form, week_of: e.target.value })} required /></label>
          {fields.map(([k, label]) => (
            <label key={k}>{label}<textarea rows={3} value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} /></label>
          ))}
          <button type="submit">進捗を投稿</button>
        </form>
      )}
      {logs.length === 0 && <p>まだログがありません。</p>}
      {logs.map((l) => (
        <article className="card log" key={l.id}>
          <h3>{l.week_of} の週</h3>
          {editId === l.id ? (
            <>
              {fields.map(([k, label]) => (
                <label key={k}>{label}<textarea rows={3} value={draft[k]} onChange={(e) => setDraft({ ...draft, [k]: e.target.value })} /></label>
              ))}
              <div className="row"><button onClick={() => save(l.id)}>保存</button><button className="ghost" onClick={() => setEditId(null)}>取消</button></div>
            </>
          ) : (
            <>
              {fields.map(([k, label]) => l[k] && <div key={k}><h4>{label}</h4><p className="memo">{l[k]}</p></div>)}
              {!readOnly && (
                <div className="row">
                  <button className="ghost" onClick={() => { setEditId(l.id); setDraft({ week_of: l.week_of, done_text: l.done_text, issues: l.issues, next_plan: l.next_plan }); }}>編集</button>
                  <button className="ghost" onClick={() => remove(l.id)}>削除</button>
                </div>
              )}
            </>
          )}
          <div className="comments">
            {l.comments.map((c) => (
              <div key={c.id} className="comment"><strong>{c.author}</strong> <small>{c.created_at}</small><p className="memo">{c.body}</p></div>
            ))}
            <CommentBox onSubmit={(b) => comment(l.id, b)} label={me.role === 'teacher' ? 'コメント・指導' : '返信'} />
          </div>
        </article>
      ))}
    </>
  );
}

function CommentBox({ onSubmit, label }) {
  const [v, setV] = useState('');
  return (
    <form className="row" onSubmit={(e) => { e.preventDefault(); onSubmit(v); setV(''); }}>
      <input placeholder={label} value={v} onChange={(e) => setV(e.target.value)} required />
      <button type="submit">送信</button>
    </form>
  );
}
