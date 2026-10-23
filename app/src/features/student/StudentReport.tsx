import { useProfile } from '../../auth/AuthProvider';
import { ReportView } from '../../components/ReportView';
import { useTeam } from '../../data/teams';

export function StudentReport() {
  const me = useProfile();
  const team = useTeam(me.teamId);
  if (!me.teamId || !me.sid) return <p>チームが設定されていません。先生に連絡してください。</p>;
  if (team === undefined) return <p>読み込み中…</p>;
  if (team === null || team.status === 'planning') return <p className="card">企画検討中です。キックオフ後に使えます。</p>;
  return <ReportView team={team} actor={me.sid} />;
}
