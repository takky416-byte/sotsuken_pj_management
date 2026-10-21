import { useEffect, useState } from 'react';
import { api, today } from '../api.js';

const DAY = 86400000;
const d2n = (s) => Math.floor(Date.parse(s) / DAY);
const n2d = (n) => new Date(n * DAY).toISOString().slice(0, 10);
const empty = { title: '', start_date: '', end_date: '' };

export default function Schedule({ uid }) {
  const [ms, setMs] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [form, setForm] = useState(empty);
  const [err, setErr] = useState('');
  const base = `/users/${uid}`;

  useEffect(() => {
    Promise.all([api('GET', `${base}/milestones`), api('GET', `${base}/tasks`)])
      .then(([m, t]) => { setMs(m); setTasks(t); })
      .catch((e) => setErr(e.message));
  }, [base]);

  const run = async (fn) => { setErr(''); try { await fn(); } catch (e) { setErr(e.message); } };
  const add = (e) => {
    e.preventDefault();
    run(async () => {
      const m = await api('POST', `${base}/milestones`, form);
      setMs([...ms, m].sort((a, b) => a.start_date.localeCompare(b.start_date)));
      setForm(empty);
    });
  };
  const toggle = (m) => run(async () => {
    const u = await api('PUT', `${base}/milestones/${m.id}`, { done: !m.done });
    setMs(ms.map((x) => (x.id === m.id ? u : x)));
  });
  const remove = (m) => confirm(`「${m.title}」を削除しますか?`) && run(async () => {
    await api('DELETE', `${base}/milestones/${m.id}`);
    setMs(ms.filter((x) => x.id !== m.id));
  });

  if (!ms) return <p>{err || '読み込み中…'}</p>;

  const dated = tasks.filter((t) => t.due_date);
  const points = [today(), ...ms.flatMap((m) => [m.start_date, m.end_date]), ...dated.map((t) => t.due_date)].map(d2n);
  const min = Math.min(...points) - 3;
  const max = Math.max(...points) + 3;
  const span = max - min;
  const pct = (n) => `${((n - min) / span) * 100}%`;
  const ticks = [];
  for (let n = min; n <= max; n++) if (n2d(n).endsWith('-01') || n === min) ticks.push(n);

  const todayLine = <i className="g-today" style={{ left: pct(d2n(today()) + 0.5) }} />;

  return (
    <>
      {err && <p className="error">{err}</p>}
      <form className="card row" onSubmit={add}>
        <input placeholder="マイルストーン (例: 中間発表)" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
        <input type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} required />
        <span>〜</span>
        <input type="date" value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} required />
        <button type="submit">追加</button>
      </form>

      <div className="gantt card">
        <div className="g-row g-head">
          <div className="g-label" />
          <div className="g-track">{todayLine}
            {ticks.map((n) => <span key={n} className="g-tick" style={{ left: pct(n) }}>{n2d(n).slice(0, 7)}</span>)}
          </div>
        </div>
        {ms.map((m) => (
          <div className="g-row" key={`m${m.id}`}>
            <div className="g-label">
              <label><input type="checkbox" checked={!!m.done} onChange={() => toggle(m)} /> {m.title}</label>
              <button className="ghost small" onClick={() => remove(m)}>×</button>
            </div>
            <div className="g-track">{todayLine}
              <div
                className={`g-bar ${m.done ? 'done' : m.end_date < today() ? 'late' : ''}`}
                style={{ left: pct(d2n(m.start_date)), width: `${((d2n(m.end_date) - d2n(m.start_date) + 1) / span) * 100}%` }}
                title={`${m.start_date} 〜 ${m.end_date}`}
              />
            </div>
          </div>
        ))}
        {dated.map((t) => (
          <div className="g-row" key={`t${t.id}`}>
            <div className="g-label task-label">{t.title}</div>
            <div className="g-track">{todayLine}
              <div className={`g-dot ${t.status}`} style={{ left: pct(d2n(t.due_date)) }} title={`期限 ${t.due_date}`} />
            </div>
          </div>
        ))}
      </div>
      <small>棒 = マイルストーン / ● = タスクの期限 / 赤線 = 今日。マイルストーンは教員も追加できます。</small>
    </>
  );
}
