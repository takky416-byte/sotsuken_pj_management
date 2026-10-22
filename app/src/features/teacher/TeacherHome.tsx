import { useEffect, useState } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../../firebase';

type Team = { id: string; status: 'planning' | 'active'; projectName?: string };

export function TeacherHome() {
  const [teams, setTeams] = useState<Team[] | null>(null);

  useEffect(() => onSnapshot(collection(db, 'teams'), (s) =>
    setTeams(s.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Team, 'id'>) })).sort((a, b) => a.id.localeCompare(b.id)))), []);

  if (!teams) return <p>読み込み中…</p>;
  return (
    <>
      <h2>チーム一覧</h2>
      {teams.length === 0 && <p>チームがまだ登録されていません。</p>}
      <div className="grid">
        {teams.map((t) => (
          <div className="card" key={t.id}>
            <strong>{t.id}チーム</strong>
            <div>{t.status === 'active' ? t.projectName : '企画検討中'}</div>
          </div>
        ))}
      </div>
    </>
  );
}
