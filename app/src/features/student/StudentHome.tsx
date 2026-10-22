import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../../firebase';
import { useProfile } from '../../auth/AuthProvider';

type Team = { status: 'planning' | 'active'; projectName?: string; driveUrl?: string };

export function StudentHome() {
  const me = useProfile();
  const [team, setTeam] = useState<Team | null | undefined>(undefined);

  useEffect(() => {
    if (!me.teamId) return;
    return onSnapshot(doc(db, 'teams', me.teamId), (s) => setTeam(s.exists() ? (s.data() as Team) : null));
  }, [me.teamId]);

  if (!me.teamId) return <p>チームが設定されていません。先生に連絡してください。</p>;
  if (team === undefined) return <p>読み込み中…</p>;
  if (team === null) return <p>チームの情報がまだ登録されていません。</p>;

  return (
    <>
      <h2>{me.teamId}チーム</h2>
      {team.status === 'planning'
        ? <p className="card">企画検討中です。キックオフをお待ちください。</p>
        : <p className="card">企画: {team.projectName}</p>}
    </>
  );
}
