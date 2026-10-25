import { Link } from 'react-router-dom';
import { useProfile } from '../../auth/AuthProvider';
import { useBase } from '../../components/Base';
import { ReportView } from '../../components/ReportView';
import { useTeam } from '../../data/teams';

/** PJ分析: プロジェクトの状況を見る画面。ここから、進捗確認ミーティングを始める。 */
export function StudentReport() {
  const me = useProfile();
  const base = useBase();
  const team = useTeam(me.teamId);
  if (!me.teamId || !me.sid) return <p>チームが設定されていません。先生に連絡してください。</p>;
  if (team === undefined) return <p>読み込み中…</p>;
  if (team === null || team.status === 'planning') return <p className="card">企画検討中です。キックオフ後に使えます。</p>;
  return (
    <>
      <div className="pj-head">
        <h2>PJ分析</h2>
        <Link to={`${base}/meeting/${team.id}`} className="btn big-btn">ミーティングを始める</Link>
      </div>
      <ReportView team={team} actor={me.sid} />
    </>
  );
}
