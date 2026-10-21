import { useEffect, useState } from 'react';
import { api, today } from '../api.js';

const COLS = [['todo', '未着手'], ['doing', '進行中'], ['done', '完了']];
const PRI = { low: '低', mid: '中', high: '高' };
const empty = { title: '', description: '', priority: 'mid', due_date: '' };

export default function Kanban({ uid, readOnly }) {
  const [tasks, setTasks] = useState(null);
  const [form, setForm] = useState(empty);
  const [editing, setEditing] = useState(null);
  const [err, setErr] = useState('');
  const base = `/users/${uid}/tasks`;

  useEffect(() => { api('GET', base).then(setTasks).catch((e) => setErr(e.message)); }, [base]);

  const run = async (fn) => { setErr(''); try { await fn(); } catch (e) { setErr(e.message); } };
  const body = (t) => ({ ...t, due_date: t.due_date || null });

  const add = (e) => {
    e.preventDefault();
    run(async () => {
      const t = await api('POST', base, body(form));
      setTasks([...tasks, t]);
      setForm(empty);
    });
  };
  const update = (id, patch) => run(async () => {
    const t = await api('PUT', `${base}/${id}`, body(patch));
    setTasks(tasks.map((x) => (x.id === id ? t : x)));
  });
  const remove = (id) => confirm('削除しますか?') && run(async () => {
    await api('DELETE', `${base}/${id}`);
    setTasks(tasks.filter((x) => x.id !== id));
  });
  const saveEdit = (e) => {
    e.preventDefault();
    update(editing.id, editing).then(() => setEditing(null));
  };

  if (!tasks) return <p>{err || '読み込み中…'}</p>;

  return (
    <>
      {err && <p className="error">{err}</p>}
      {!readOnly && (
        <form className="card row" onSubmit={add}>
          <input placeholder="タスク名" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
          <select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}>
            {Object.entries(PRI).map(([k, v]) => <option key={k} value={k}>優先度: {v}</option>)}
          </select>
          <input type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} />
          <button type="submit">追加</button>
        </form>
      )}
      <div className="board">
        {COLS.map(([status, label]) => (
          <section
            key={status}
            className="col"
            onDragOver={(e) => !readOnly && e.preventDefault()}
            onDrop={(e) => {
              const id = Number(e.dataTransfer.getData('text/plain'));
              const t = tasks.find((x) => x.id === id);
              if (!readOnly && t && t.status !== status) update(id, { ...t, status });
            }}
          >
            <h3>{label} <span className="count">{tasks.filter((t) => t.status === status).length}</span></h3>
            {tasks.filter((t) => t.status === status).map((t) => {
              const overdue = t.status !== 'done' && t.due_date && t.due_date < today();
              return (
                <article
                  key={t.id}
                  className={`task pri-${t.priority}`}
                  draggable={!readOnly}
                  onDragStart={(e) => e.dataTransfer.setData('text/plain', String(t.id))}
                >
                  {editing?.id === t.id ? (
                    <form onSubmit={saveEdit}>
                      <input value={editing.title} onChange={(e) => setEditing({ ...editing, title: e.target.value })} required />
                      <textarea rows={3} placeholder="メモ" value={editing.description} onChange={(e) => setEditing({ ...editing, description: e.target.value })} />
                      <select value={editing.priority} onChange={(e) => setEditing({ ...editing, priority: e.target.value })}>
                        {Object.entries(PRI).map(([k, v]) => <option key={k} value={k}>優先度: {v}</option>)}
                      </select>
                      <input type="date" value={editing.due_date ?? ''} onChange={(e) => setEditing({ ...editing, due_date: e.target.value })} />
                      <div className="row"><button type="submit">保存</button><button type="button" className="ghost" onClick={() => setEditing(null)}>取消</button></div>
                    </form>
                  ) : (
                    <>
                      <strong>{t.title}</strong>
                      {t.description && <p className="memo">{t.description}</p>}
                      <small className={overdue ? 'danger' : ''}>優先度 {PRI[t.priority]}{t.due_date && ` ／ 期限 ${t.due_date}`}{overdue && ' (超過)'}</small>
                      {!readOnly && (
                        <div className="row">
                          <select value={t.status} onChange={(e) => update(t.id, { ...t, status: e.target.value })}>
                            {COLS.map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                          </select>
                          <button className="ghost" onClick={() => setEditing({ ...t })}>編集</button>
                          <button className="ghost" onClick={() => remove(t.id)}>削除</button>
                        </div>
                      )}
                    </>
                  )}
                </article>
              );
            })}
          </section>
        ))}
      </div>
    </>
  );
}
