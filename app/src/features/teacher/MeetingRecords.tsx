import { useState } from 'react';
import { deleteMeeting, saveMeeting, useAllMeetings } from '../../data/meetings';
import { formatDate, isDateString, jstDate } from '../../lib/dates';
import type { Meeting, MeetingAction } from '../../lib/meeting';

/** 教員用: そのチームのミーティング記録の一覧。過去の記録の編集・削除と、日付を指定しての追加。 */
export function MeetingRecords({ teamId, members }: { teamId: string; members: { sid: string; name: string }[] }) {
  const { data: meetings, error } = useAllMeetings(teamId);
  const [date, setDate] = useState(jstDate());
  const [err, setErr] = useState('');
  if (error) return <p className="error">{error}</p>;
  if (!meetings) return <p>読み込み中…</p>;

  const run = async (fn: () => Promise<unknown>) => { setErr(''); try { await fn(); } catch (e) { setErr(`できませんでした: ${(e as Error).message}`); } };
  const exists = meetings.some((m) => m.id === date);

  return (
    <>
      <p className="hint">過去の記録の修正や、記録し忘れた回の追加ができます。当日の記録は、ミーティング画面からも入力できます。</p>
      {err && <p className="error">{err}</p>}
      <div className="card row">
        <input aria-label="記録の日付" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        <button disabled={!isDateString(date) || exists} onClick={() => run(() => saveMeeting(teamId, date, 'teacher', { decided: '', actions: [], note: '' }))}>
          {exists ? 'この日の記録はあります' : 'この日の記録を追加'}
        </button>
      </div>
      {meetings.length === 0 && <p className="hint">記録はまだありません。</p>}
      {meetings.map((m) => <Record key={`${m.id}-${m.updatedAt}`} teamId={teamId} m={m} run={run} members={members} />)}
    </>
  );
}

function Record({ teamId, m, run, members }: { teamId: string; m: Meeting; run: (fn: () => Promise<unknown>) => Promise<void>; members: { sid: string; name: string }[] }) {
  const [decided, setDecided] = useState(m.decided);
  const [actions, setActions] = useState<MeetingAction[]>(m.actions);
  const [text, setText] = useState('');
  const [owner, setOwner] = useState('');
  const [sure, setSure] = useState(false);
  const changed = decided !== m.decided || JSON.stringify(actions) !== JSON.stringify(m.actions);

  const addAction = () => { if (text.trim()) { setActions([...actions, { text: text.trim(), done: false, owner: owner || null }]); setText(''); } };

  return (
    <div className="card form">
      <strong>{formatDate(m.id)}</strong>
      <label>決まったこと
        <textarea aria-label={`決まったこと ${m.id}`} rows={2} maxLength={3000} value={decided} onChange={(e) => setDecided(e.target.value)} />
      </label>
      <div className="label">次の1週間でやること</div>
      <ul className="plain">
        {actions.map((a, i) => (
          <li key={i} className="row">
            <label className="check">
              <input type="checkbox" checked={a.done} onChange={() => setActions(actions.map((x, j) => (j === i ? { ...x, done: !x.done } : x)))} />
              {a.owner && <span className="badge">{members.find((x) => x.sid === a.owner)?.name ?? a.owner}</span>}
              <span className={a.done ? 'done-text' : ''}>{a.text}</span>
            </label>
            <button className="ghost icon" aria-label="やることを削除" onClick={() => setActions(actions.filter((_, j) => j !== i))}>×</button>
          </li>
        ))}
      </ul>
      <div className="row">
        <select aria-label={`担当する人 ${m.id}`} value={owner} onChange={(e) => setOwner(e.target.value)}>
          <option value="">チーム全体</option>
          {members.map((x) => <option key={x.sid} value={x.sid}>{x.name}</option>)}
        </select>
        <input aria-label={`やることを追加 ${m.id}`} placeholder="やることを入力して Enter" value={text} maxLength={200}
          onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) addAction(); }} />
      </div>
      <div className="row">
        <button disabled={!changed} onClick={() => run(() => saveMeeting(teamId, m.id, 'teacher', { decided, actions }))}>保存</button>
        {!sure
          ? <button className="ghost danger" onClick={() => { setSure(true); setTimeout(() => setSure(false), 4000); }}>この記録を削除</button>
          : <button className="ghost danger" onClick={() => run(() => deleteMeeting(teamId, m.id))}>本当に削除</button>}
      </div>
    </div>
  );
}
