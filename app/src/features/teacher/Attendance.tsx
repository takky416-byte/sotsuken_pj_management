import { useState } from 'react';
import { useClassDays } from '../../data/calendar';
import { setAbsent, useTeamDailies } from '../../data/daily';
import { useTeams } from '../../data/teams';
import { useSettings } from '../../data/daily';
import { dailyId, statusOf } from '../../lib/daily';
import { dailyWindowFrom, formatDate, jstDate } from '../../lib/dates';
import type { Team } from '../../types';

function TeamAttendance({ team, date }: { team: Team; date: string }) {
  const { data: dailies, error } = useTeamDailies(team.id, dailyWindowFrom(jstDate()));
  const [err, setErr] = useState('');
  if (error) return <p className="error">{error}</p>;
  if (!dailies) return <p>読み込み中…</p>;
  const by = new Map(dailies.filter((d) => d.date === date).map((d) => [d.id, d]));

  const toggle = async (sid: string, absent: boolean) => {
    setErr('');
    try { await setAbsent(team.id, sid, date, absent, by.get(dailyId(date, sid))); }
    catch (e) { setErr(`できませんでした: ${(e as Error).message}`); }
  };

  return (
    <div className="card">
      <strong>{team.id}チーム</strong>
      {err && <p className="error">{err}</p>}
      <ul className="plain">
        {team.members.map((m) => {
          const d = by.get(dailyId(date, m.sid));
          const s = statusOf(d);
          return (
            <li key={m.sid} className="att-row">
              <span className="att-name">{m.name}</span>
              <span className={`mk-${s}`}>{s === 'submitted' ? '提出済み' : s === 'absent' ? '欠席' : '未提出'}</span>
              {s === 'missing' && <button className="ghost" onClick={() => toggle(m.sid, true)}>欠席にする</button>}
              {s === 'absent' && <button className="ghost" onClick={() => toggle(m.sid, false)}>欠席を取り消す</button>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function Attendance() {
  const classDays = useClassDays();
  const { data: teams } = useTeams();
  const settings = useSettings();
  const today = jstDate();
  const [picked, setPicked] = useState<string | null>(null);
  if (!classDays || !teams || !settings) return <p>読み込み中…</p>;

  const past = classDays.map((d) => d.date).filter((d) => d <= today && d >= settings.dailyStartDate && d >= dailyWindowFrom(today)).sort().reverse();
  const date = picked ?? past[0];
  const active = [...teams].filter((t) => t.status === 'active').sort((a, b) => a.id.localeCompare(b.id));
  return (
    <>
      <h2>欠席の入力</h2>
      <p className="hint">欠席の日は、日報が未提出として数えられません。欠席にできるのは教員だけです。</p>
      {date ? (
        <label className="inline">授業日
          <select value={date} onChange={(e) => setPicked(e.target.value)}>
            {past.slice(0, 30).map((d) => <option key={d} value={d}>{formatDate(d)}</option>)}
          </select>
        </label>
      ) : <p>授業日がまだありません。</p>}
      {date && active.length === 0 && <p className="card">キックオフ済みのチームがまだありません。</p>}
      {date && active.map((t) => <TeamAttendance key={`${t.id}-${date}`} team={t} date={date} />)}
    </>
  );
}
