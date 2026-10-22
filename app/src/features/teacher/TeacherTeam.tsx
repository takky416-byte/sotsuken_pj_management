import { Link, useParams } from 'react-router-dom';
import { WbsEditor } from '../../components/WbsEditor';
import { useTeam } from '../../data/teams';
import { isHttpUrl } from '../../data/util';

export function TeacherTeam() {
  const { id = '' } = useParams();
  const team = useTeam(id);
  if (team === undefined) return <p>読み込み中…</p>;
  if (team === null) return <p>チームが見つかりません。</p>;
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
          <Link to={`/teacher/kickoff/${team.id}`} className="btn">{team.status === 'active' ? 'キックオフの内容を編集' : 'キックオフ'}</Link>
          {team.driveUrl && isHttpUrl(team.driveUrl) && (
            <a className="btn ghost-btn" href={team.driveUrl} target="_blank" rel="noreferrer noopener">共有フォルダを開く</a>
          )}
        </div>
      </div>
      <h3>WBS・タスク</h3>
      <WbsEditor teamId={team.id} actor="teacher" members={team.members} />
    </>
  );
}
