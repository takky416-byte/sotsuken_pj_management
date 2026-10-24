import { useProfile } from '../../auth/AuthProvider';
import { WbsGantt } from '../../components/WbsGantt';
import { useTeam } from '../../data/teams';

export function StudentWbs({ initial = 'list' }: { initial?: 'list' | 'gantt' }) {
  const me = useProfile();
  const team = useTeam(me.teamId);
  if (!me.teamId || !me.sid) return <p>チームが設定されていません。先生に連絡してください。</p>;
  if (team === undefined) return <p>読み込み中…</p>;
  if (team === null || team.status === 'planning') return <p className="card">企画検討中です。キックオフをお待ちください。</p>;
  return (
    <>
      <h2>WBS・ガント</h2>
      <p className="hint">タスクはチームの誰でも追加・変更できます。担当は空欄のままでもかまいません。階層は3つまでです(大項目 → 中項目 → 小項目)。担当と状態は、いちばん下のタスクに付けます。右の棒が、予定の期間(ガント)です。</p>
      <WbsGantt teamId={me.teamId} actor={me.sid} members={team.members} initial={initial} />
    </>
  );
}
