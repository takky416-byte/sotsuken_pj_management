import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { MeetingRecords } from './MeetingRecords';
import { MeetingMinutesEditor } from './MeetingMinutesEditor';
import { TeacherNotes } from './TeacherNotes';
import { DailyFeed, DailyMatrix } from '../../components/DailyViews';
import { TeamBoard } from '../../components/TeamBoard';
import { ReportView } from '../../components/ReportView';
import { WbsGantt } from '../../components/WbsGantt';
import { useClassDays } from '../../data/calendar';
import { useSettings, useTeamDailies } from '../../data/daily';
import { useTasks } from '../../data/tasks';
import { updateTeam, useTeam } from '../../data/teams';
import { isHttpUrl } from '../../data/util';
import { classDatesBetween, fromDailyStart } from '../../lib/daily';
import { addDays, dailyWindowFrom, jstDate } from '../../lib/dates';
import type { Team } from '../../types';


export function TeacherTeam() {
  const { id = '' } = useParams();
  const team = useTeam(id);
  if (team === undefined) return <p>読み込み中…</p>;
  if (team === null) return <p>チームが見つかりません。</p>;
  return <TeamDetail team={team} />;
}

function TeamDetail({ team }: { team: Team }) {
  const [tab, setTab] = useState<'wbs' | 'board' | 'daily' | 'meetings' | 'notes' | 'report'>('wbs');
  return (
    <>
      <Link to="/teacher">← チーム一覧</Link>
      <h2>{team.id}チーム</h2>
      <div className="card">
        <div className="label">メンバー</div>
        <div>{team.members.map((m) => m.name).join('・') || '—'}</div>
        <div className="label">企画</div>
        <div>{team.status === 'active' ? <strong>{team.projectName}</strong> : '企画検討中'}</div>
        <div className="row">
          <Link to={`/meeting/${team.id}`} className="btn ghost-btn">ミーティング画面</Link>
          <Link to={`/teacher/kickoff/${team.id}`} className="btn">{team.status === 'active' ? 'キックオフの内容を編集' : 'キックオフ'}</Link>
          {team.driveUrl && isHttpUrl(team.driveUrl) && (
            <a className="btn ghost-btn" href={team.driveUrl} target="_blank" rel="noreferrer noopener">共有フォルダを開く</a>
          )}
        </div>
      </div>
      <TeamNotice team={team} />
      <div className="tabs">
        <button className={tab === 'wbs' ? 'active' : ''} onClick={() => setTab('wbs')}>WBS・ガントチャート</button>
        <button className={tab === 'report' ? 'active' : ''} onClick={() => setTab('report')}>PJ分析</button>
        <button className={tab === 'board' ? 'active' : ''} onClick={() => setTab('board')}>関与</button>
        <button className={tab === 'daily' ? 'active' : ''} onClick={() => setTab('daily')}>作業ログ</button>
        <button className={tab === 'meetings' ? 'active' : ''} onClick={() => setTab('meetings')}>ミーティング記録</button>
        <button className={tab === 'notes' ? 'active' : ''} onClick={() => setTab('notes')}>教員メモ(専用)</button>
      </div>
      {tab === 'wbs' && <WbsGantt teamId={team.id} actor="teacher" members={team.members} />}
      {tab === 'report' && <ReportView team={team} actor="teacher" />}
      {tab === 'board' && <TeamBoard team={team} viewer="teacher" />}
      {tab === 'daily' && <TeamDaily team={team} />}
      {tab === 'meetings' && (
        <>
          <MeetingMinutesEditor teamId={team.id} />
          <MeetingRecords teamId={team.id} members={team.members} />
        </>
      )}
      {tab === 'notes' && <TeacherNotes teamId={team.id} />}
    </>
  );
}

function TeamDaily({ team }: { team: Team }) {
  const today = jstDate();
  const classDays = useClassDays();
  const settings = useSettings();
  const { data: dailies, error } = useTeamDailies(team.id, dailyWindowFrom(today));
  const { data: tasks } = useTasks(team.id);
  if (error) return <p className="error">{error}</p>;
  if (!classDays || !dailies || !tasks || !settings) return <p>読み込み中…</p>;
  const dates = classDatesBetween(fromDailyStart(classDays, settings.dailyStartDate), dailyWindowFrom(today), addDays(today, 1)).slice(-8);
  return (
    <>
      <h3>提出状況(○ 提出 / × 未提出 / 欠 欠席)</h3>
      <DailyMatrix members={team.members} dates={dates} dailies={dailies} />
      <h3>作業ログの内容</h3>
      <DailyFeed dailies={dailies} members={team.members} tasks={tasks} />
    </>
  );
}

const MESSAGE_MAX = 200;

/** 教員から、このチームへのメッセージと、成果物の提出先 (Google ドライブ)。学生のホームに出る */
function TeamNotice({ team }: { team: Team }) {
  const [text, setText] = useState(team.message?.text ?? '');
  const [url, setUrl] = useState(team.submitUrl ?? '');
  const [err, setErr] = useState('');
  const [saved, setSaved] = useState('');
  const urlOk = url.trim() === '' || isHttpUrl(url.trim());
  const run = async (what: string, fn: () => Promise<unknown>) => {
    setErr(''); setSaved('');
    try { await fn(); setSaved(what); } catch (e) { setErr(`保存できませんでした: ${(e as Error).message}`); }
  };
  const sendMessage = () => run('メッセージを送りました', () => updateTeam(team.id, { message: text.trim() ? { text: text.trim().slice(0, MESSAGE_MAX), at: Date.now() } : null }));
  return (
    <div className="card team-notice">
      <h3>チームへのお知らせ</h3>
      <label className="label" htmlFor={`msg-${team.id}`}>メッセージ(学生のホームに出ます。送り直すと入れ替わります)</label>
      <textarea id={`msg-${team.id}`} rows={2} maxLength={MESSAGE_MAX} value={text} placeholder="例: 来週は中間確認をします。WBSの期間を入れておいてください。" onChange={(e) => { setText(e.target.value); setSaved(''); }} />
      <div className="row">
        <button type="button" onClick={sendMessage}>メッセージを送る</button>
        {team.message && <button type="button" className="ghost" onClick={() => { setText(''); run('メッセージを消しました', () => updateTeam(team.id, { message: null })); }}>メッセージを消す</button>}
        {team.message && <span className="hint">送信: {new Date(team.message.at).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>}
      </div>
      <label className="label" htmlFor={`submit-${team.id}`}>成果物の提出先(Google ドライブのフォルダのURL)</label>
      <div className="row">
        <input id={`submit-${team.id}`} className="grow" value={url} placeholder="https://drive.google.com/drive/folders/..." onChange={(e) => { setUrl(e.target.value); setSaved(''); }} />
        <button type="button" disabled={!urlOk} onClick={() => run('提出先を保存しました', () => updateTeam(team.id, { submitUrl: url.trim() }))}>提出先を保存</button>
      </div>
      {!urlOk && <p className="error">https:// で始まるURLを入れてください。</p>}
      {err && <p className="error">{err}</p>}
      {saved && <p className="hint" role="status">{saved}</p>}
    </div>
  );
}
