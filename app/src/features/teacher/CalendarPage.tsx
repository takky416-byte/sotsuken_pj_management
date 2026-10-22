import { useState } from 'react';
import {
  deleteMilestone, saveClassDays, saveMilestone, useClassDays, useMilestones,
} from '../../data/calendar';
import { formatDate, isDateString, jstDate } from '../../lib/dates';
import { TEAM_IDS } from '../../types';

export function CalendarPage() {
  const milestones = useMilestones('all');
  const classDays = useClassDays();
  const [f, setF] = useState({ title: '', date: '', endDate: '', teamId: '' });
  const [err, setErr] = useState('');
  const [days, setDays] = useState<typeof classDays>(null);
  const list = days ?? classDays;

  const run = async (fn: () => Promise<unknown>) => {
    setErr('');
    try { await fn(); } catch (e) { setErr(`できませんでした: ${(e as Error).message}`); }
  };

  const add = () => run(async () => {
    if (!f.title.trim() || !isDateString(f.date) || (f.endDate && !isDateString(f.endDate))) {
      throw new Error('タイトルと日付(開始)を入力してください');
    }
    await saveMilestone({ title: f.title.trim(), date: f.date, endDate: f.endDate || null, teamId: f.teamId || null });
    setF({ title: '', date: '', endDate: '', teamId: '' });
  });

  const toggleMeeting = (date: string) => run(async () => {
    if (!list) return;
    const next = list.map((d) => (d.date === date ? { ...d, meeting: !d.meeting } : d));
    setDays(next);
    await saveClassDays(next);
  });

  const today = jstDate();
  if (!milestones || !list) return <p>読み込み中…</p>;
  const upcoming = list.filter((d) => d.date >= today);

  return (
    <>
      <h2>カレンダー</h2>
      {err && <p className="error">{err}</p>}

      <h3>マイルストーン</h3>
      <div className="card row">
        <input placeholder="名称" value={f.title} maxLength={100} onChange={(e) => setF({ ...f, title: e.target.value })} />
        <input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} />
        <span>〜</span>
        <input type="date" value={f.endDate} onChange={(e) => setF({ ...f, endDate: e.target.value })} />
        <select value={f.teamId} onChange={(e) => setF({ ...f, teamId: e.target.value })}>
          <option value="">共通</option>
          {TEAM_IDS.map((t) => <option key={t} value={t}>{t}チーム</option>)}
        </select>
        <button onClick={add}>追加</button>
      </div>
      <div className="table-wrap">
        <table className="table">
          <thead><tr><th>日付</th><th>名称</th><th>対象</th><th></th></tr></thead>
          <tbody>
            {milestones.map((m) => (
              <tr key={m.id} className={(m.endDate ?? m.date) < today ? 'past' : ''}>
                <td>{formatDate(m.date)}{m.endDate && m.endDate !== m.date ? `〜${formatDate(m.endDate)}` : ''}</td>
                <td>{m.title}</td>
                <td>{m.teamId ? `${m.teamId}チーム` : '共通'}</td>
                <td><button className="ghost danger" onClick={() => run(() => deleteMilestone(m.id))}>削除</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3>授業日とミーティング (これから {upcoming.length}日)</h3>
      <p className="hint">木曜2限のミーティングをしない日は、チェックを外してください。</p>
      <div className="table-wrap">
        <table className="table">
          <thead><tr><th>日付</th><th>時限</th><th>備考</th><th>ミーティング</th></tr></thead>
          <tbody>
            {upcoming.map((d) => (
              <tr key={d.date}>
                <td>{formatDate(d.date)}</td><td>{d.periods}限</td><td>{d.note}</td>
                <td>{new Date(`${d.date}T00:00:00Z`).getUTCDay() === 4
                  ? <input type="checkbox" checked={d.meeting} onChange={() => toggleMeeting(d.date)} aria-label="ミーティングを行う" />
                  : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
