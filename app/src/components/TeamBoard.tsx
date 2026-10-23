import { StackTable } from './StackTable';
import { useState } from 'react';
import { useClassDays } from '../data/calendar';
import { useMyDailies, useSettings, useTeamDailies } from '../data/daily';
import { useMeetings } from '../data/meetings';
import { useTasks } from '../data/tasks';
import { deleteThanks, sendThanks, useThanks } from '../data/thanks';
import { dailyWindowFrom, formatDate, jstDate } from '../lib/dates';
import { attention, engagement } from '../lib/engagement';
import type { Team } from '../types';

import { STAMPS, THANKS_PER_DAY, stampNote } from '../lib/thanksView';

/**
 * チームのようす (直近3週間)。日報・担当・約束・ありがとうの目安を、メンバーごとに並べる。
 * 点数や順位は出さない。教員には、確認したほうがよい点を添える。
 * viewer: 学生は自分の学生ID、教員は 'teacher'。
 */
export function TeamBoard({ team, viewer }: { team: Team; viewer: string }) {
  const teacher = viewer === 'teacher';
  const today = jstDate();
  const from = dailyWindowFrom(today);
  const settings = useSettings();
  const classDays = useClassDays();
  const { data: tasks } = useTasks(team.id);
  const { data: meetings } = useMeetings(team.id);
  const { data: thanks } = useThanks(team.id, from);
  const peer = teacher || (settings?.peerDailyView ?? false);
  const all = useTeamDailies(peer ? team.id : null, from);
  const mine = useMyDailies(peer ? null : team.id, viewer, from);
  const dailies = peer ? all.data : mine.data;

  const [to, setTo] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [err, setErr] = useState('');

  if (!settings || !classDays || !tasks || !meetings || !thanks || !dailies) return <p>読み込み中…</p>;

  const common = {
    members: team.members, tasks, meetings, thanks, classDays, today, windowFrom: from,
    dailyStart: settings.dailyStartDate,
    kickoffDate: team.kickoffAt ? jstDate(new Date(team.kickoffAt)) : null,
  };
  // 自分の分しか読めないときは、他の人の日報は集計しない (読めない日報を「未提出」と誤って数えない)
  const stats = peer
    ? engagement({ ...common, dailies })
    : engagement({ ...common, dailies: null }).map((s) => (s.sid === viewer ? engagement({ ...common, members: [{ sid: s.sid, name: s.name }], dailies })[0] : s));

  const nameOf = (sid: string) => (sid === 'teacher' ? '先生' : team.members.find((m) => m.sid === sid)?.name ?? sid);
  const sentToday = thanks.filter((t) => t.from === viewer && t.date === today).length;
  const left = THANKS_PER_DAY - sentToday;

  const send = async (stamp?: string) => {
    if (!to) return;
    // 押したらすぐに閉じる (続けて別の人に送れるように)。送れなかったときは、表の下にメッセージを出す
    const target = to; const text = stamp ?? note;
    setTo(null); setNote(''); setErr('');
    try { await sendThanks(team.id, viewer, target, text); }
    catch (e) { setErr(`送れませんでした: ${(e as Error).message}`); }
  };

  return (
    <>
      <p className="hint">
        直近3週間のようすです。点数や順位ではなく、チームで状況を見るための目安です。
        {!peer && ' (日報は、自分の分だけ表示されます)'}
      </p>
      <div className="table-wrap">
        <StackTable className="board">
          <thead>
            <tr><th>メンバー</th><th>日報</th><th>日報で触れたタスク</th><th>担当</th><th>完了</th><th>期限超過</th><th>WBS外</th><th>約束</th><th>ありがとう</th><th /></tr>
          </thead>
          <tbody>
            {stats.map((s) => {
              const warn = teacher ? attention(s) : [];
              return (
                <tr key={s.sid} className={s.sid === viewer ? 'me' : ''}>
                  <td><strong>{s.name}</strong>{warn.length > 0 && <div className="warn-note">{warn.join(' / ')}</div>}</td>
                  <td>{s.daily ? <>{s.daily.submitted}/{s.daily.days}日{s.daily.streak >= 2 && <span className="streak" title="連続で提出した授業日">🔥{s.daily.streak}</span>}</> : '—'}</td>
                  <td>{s.touched ?? '—'}</td>
                  <td>{s.assigned}</td>
                  <td>{s.done}</td>
                  <td className={s.overdue > 0 ? 'bad' : ''}>{s.overdue}</td>
                  <td title="日報で「WBSにない作業」として追加した作業">{s.adhoc}</td>
                  <td>{s.promises.total === 0 ? '—' : `${s.promises.done}/${s.promises.total}`}</td>
                  <td>受 {s.thanks.received} / 送 {s.thanks.sent}</td>
                  <td>
                    {s.sid !== viewer && (
                      <button className="ghost" disabled={!teacher && left <= 0} onClick={() => { setTo(to === s.sid ? null : s.sid); setNote(''); }}
                        aria-label={`${s.name}にありがとう`}>👏 ありがとう</button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </StackTable>
      </div>

      {err && <p className="error">{err}</p>}
      {to && (
        <div className="card form">
          <div className="label">{nameOf(to)}さんに、ありがとう{!teacher && <span className="hint">(今日はあと{left}回)</span>}</div>
          <div className="stamps" role="group" aria-label="スタンプ(押すとそのまま送れます)">
            {STAMPS.map((s) => <button key={s.label} type="button" className="stamp" onClick={() => send(stampNote(s))}><span aria-hidden="true">{s.emoji}</span>{s.label}</button>)}
          </div>
          <input aria-label="ありがとうの一言" placeholder="一言(任意。例: レビューしてくれて助かった)" maxLength={100} value={note}
            onChange={(e) => setNote(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) send(); }} />
          <div className="row">
            <button onClick={() => send()}>送る</button>
            <button className="ghost" onClick={() => setTo(null)}>やめる</button>
          </div>
        </div>
      )}

      <h3>最近のありがとう</h3>
      {thanks.length === 0 && <p className="hint">まだありません。助けてもらったことを、1タップで伝えられます。</p>}
      <ul className="plain thanks">
        {thanks.slice(0, 10).map((t) => (
          <li key={t.id}>
            <span className="hint">{formatDate(t.date)}</span> {nameOf(t.from)} → <strong>{nameOf(t.to)}</strong>
            {t.note && <>「{t.note}」</>}
            {(teacher || t.from === viewer) && <button className="ghost icon" aria-label="取り消す" onClick={() => deleteThanks(team.id, t.id).catch(() => undefined)}>×</button>}
          </li>
        ))}
      </ul>
    </>
  );
}
