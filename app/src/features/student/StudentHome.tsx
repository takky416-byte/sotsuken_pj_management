import { Link } from 'react-router-dom';
import { useBase } from '../../components/Base';
import { useProfile } from '../../auth/AuthProvider';
import { Progress } from '../../components/Progress';
import { useMilestones } from '../../data/calendar';
import { useTasks } from '../../data/tasks';
import { useTeam } from '../../data/teams';
import { formatDate, jstDate } from '../../lib/dates';
import { overallProgress } from '../../lib/wbs';
import { isHttpUrl } from '../../data/util';

export function StudentHome() {
  const me = useProfile();
  const base = useBase();
  const team = useTeam(me.teamId);
  const milestones = useMilestones(me.teamId ?? 'none');
  const { data: tasks } = useTasks(me.teamId);

  if (!me.teamId) return <p>チームが設定されていません。先生に連絡してください。</p>;
  if (team === undefined) return <p>読み込み中…</p>;
  if (team === null) return <p>チームの情報がまだ登録されていません。</p>;

  const today = jstDate();
  const upcoming = (milestones ?? []).filter((m) => (m.endDate ?? m.date) >= today).slice(0, 5);

  return (
    <>
      <h2>{team.id}チーム</h2>
      {team.status === 'planning' ? (
        <p className="card">企画検討中です。キックオフをお待ちください。</p>
      ) : (
        <div className="card">
          <div className="label">企画</div>
          <strong className="big">{team.projectName}</strong>
          <div className="row">
            <Link to={`${base}/wbs`} className="btn">WBSを開く</Link>
            {team.driveUrl && isHttpUrl(team.driveUrl) && (
              <a className="btn ghost-btn" href={team.driveUrl} target="_blank" rel="noreferrer noopener">共有フォルダを開く</a>
            )}
            {tasks && <Progress {...overallProgress(tasks)} />}
          </div>
        </div>
      )}

      <div className="card">
        <div className="label">これからの予定</div>
        {upcoming.length === 0 && <p className="hint">予定はありません。</p>}
        <ul className="plain">
          {upcoming.map((m) => (
            <li key={m.id}>
              <strong>{formatDate(m.date)}{m.endDate && m.endDate !== m.date ? `〜${formatDate(m.endDate)}` : ''}</strong>
              {'  '}{m.title}{m.teamId && <span className="badge">チーム</span>}
            </li>
          ))}
        </ul>
      </div>

      <div className="card">
        <div className="label">メンバー</div>
        <div>{team.members.map((m) => m.name).join('・') || '—'}</div>
      </div>
    </>
  );
}
