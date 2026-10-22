import { Link } from 'react-router-dom';
import { Progress } from '../../components/Progress';
import { useMilestones } from '../../data/calendar';
import { useTasks } from '../../data/tasks';
import { useTeams } from '../../data/teams';
import { formatDate, jstDate } from '../../lib/dates';
import { overallProgress } from '../../lib/wbs';
import type { Milestone, Team } from '../../types';

function TeamRow({ team, milestones }: { team: Team; milestones: Milestone[] }) {
  const { data: tasks } = useTasks(team.id);
  const today = jstDate();
  const next = milestones.find((m) => (m.endDate ?? m.date) >= today && (m.teamId === null || m.teamId === team.id));
  const delayed = (tasks ?? []).filter((t) => !t.deleted && t.status !== 'done' && t.status !== 'hold'
    && t.endDate && t.endDate < today).length;
  return (
    <tr>
      <td><Link to={`/teacher/team/${team.id}`}><strong>{team.id}</strong></Link></td>
      <td>{team.members.map((m) => m.name).join('・') || '—'}</td>
      <td>{team.status === 'active' ? team.projectName : <span className="hint">企画検討中</span>}</td>
      <td>{tasks ? <Progress {...overallProgress(tasks)} /> : '…'}</td>
      <td className={delayed ? 'warn' : ''}>{delayed || '—'}</td>
      <td>{next ? `${formatDate(next.date)} ${next.title}` : '—'}</td>
    </tr>
  );
}

export function TeacherHome() {
  const { data: teams, error } = useTeams();
  const milestones = useMilestones('all');
  if (error) return <p className="error">読み込めませんでした: {error}</p>;
  if (!teams || !milestones) return <p>読み込み中…</p>;
  const sorted = [...teams].sort((a, b) => a.id.localeCompare(b.id));
  return (
    <>
      <h2>チーム一覧</h2>
      <div className="table-wrap">
        <table className="table">
          <thead><tr><th>チーム</th><th>メンバー</th><th>企画</th><th>WBS進捗</th><th>期限超過</th><th>次の予定</th></tr></thead>
          <tbody>{sorted.map((t) => <TeamRow key={t.id} team={t} milestones={milestones} />)}</tbody>
        </table>
      </div>
      <p className="hint">日報の提出状況・要確認フラグは、日報の機能を追加したあとに表示されます。</p>
    </>
  );
}
