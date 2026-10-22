import { useProfile } from '../../auth/AuthProvider';
import { TeamBoard } from '../../components/TeamBoard';
import { useTeam } from '../../data/teams';

export function StudentTeam() {
  const me = useProfile();
  const team = useTeam(me.teamId);
  if (!me.teamId || !me.sid) return <p>チームが設定されていません。先生に連絡してください。</p>;
  if (team === undefined) return <p>読み込み中…</p>;
  if (team === null || team.status === 'planning') return <p className="card">企画検討中です。キックオフをお待ちください。</p>;
  return (
    <>
      <h2>チームのようす</h2>
      <TeamBoard team={team} viewer={me.sid} />
    </>
  );
}
