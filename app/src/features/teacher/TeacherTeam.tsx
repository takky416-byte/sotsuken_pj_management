import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { TeacherNotes } from './TeacherNotes';
import { DailyFeed, DailyMatrix } from '../../components/DailyViews';
import { WbsEditor } from '../../components/WbsEditor';
import { useClassDays } from '../../data/calendar';
import { useSettings, useTeamDailies } from '../../data/daily';
import { useTasks } from '../../data/tasks';
import { useTeam } from '../../data/teams';
import { isHttpUrl } from '../../data/util';
import { classDatesBetween, fromDailyStart } from '../../lib/daily';
import { jstDate } from '../../lib/dates';
import type { Team } from '../../types';

const daysAgo = (date: string, n: number) => new Date(Date.parse(`${date}T00:00:00Z`) - n * 86400000).toISOString().slice(0, 10);

export function TeacherTeam() {
  const { id = '' } = useParams();
  const team = useTeam(id);
  if (team === undefined) return <p>読み込み中…</p>;
  if (team === null) return <p>チームが見つかりません。</p>;
  return <TeamDetail team={team} />;
}

function TeamDetail({ team }: { team: Team }) {
  const [tab, setTab] = useState<'wbs' | 'daily' | 'notes'>('wbs');
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
      <div className="tabs">
        <button className={tab === 'wbs' ? 'active' : ''} onClick={() => setTab('wbs')}>WBS・タスク</button>
        <button className={tab === 'daily' ? 'active' : ''} onClick={() => setTab('daily')}>日報</button>
        <button className={tab === 'notes' ? 'active' : ''} onClick={() => setTab('notes')}>教員メモ(専用)</button>
      </div>
      {tab === 'wbs' && <WbsEditor teamId={team.id} actor="teacher" members={team.members} />}
      {tab === 'daily' && <TeamDaily team={team} />}
      {tab === 'notes' && <TeacherNotes teamId={team.id} />}
    </>
  );
}

function TeamDaily({ team }: { team: Team }) {
  const today = jstDate();
  const classDays = useClassDays();
  const settings = useSettings();
  const { data: dailies, error } = useTeamDailies(team.id, daysAgo(today, 30));
  const { data: tasks } = useTasks(team.id);
  if (error) return <p className="error">{error}</p>;
  if (!classDays || !dailies || !tasks || !settings) return <p>読み込み中…</p>;
  const dates = classDatesBetween(fromDailyStart(classDays, settings.dailyStartDate), daysAgo(today, 30), daysAgo(today, -1)).slice(-8);
  return (
    <>
      <h3>提出状況(○ 提出 / × 未提出 / 欠 欠席)</h3>
      <DailyMatrix members={team.members} dates={dates} dailies={dailies} />
      <h3>日報の内容</h3>
      <DailyFeed dailies={dailies} members={team.members} tasks={tasks} />
    </>
  );
}
