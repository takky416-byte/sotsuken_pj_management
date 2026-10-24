import { Link, useNavigate, useParams } from 'react-router-dom';
import { BaseContext } from '../../components/Base';
import { ProfileOverride, type Profile } from '../../auth/AuthProvider';
import { useTeams } from '../../data/teams';
import { StudentApp, StudentNav } from '../student/StudentApp';
import { NoticeBody } from '../../components/Notice';
import { useState } from 'react';

/** 教員が、学生の画面をそのまま (閲覧のみで) 確認する。 */
export function Preview() {
  const { sid = '' } = useParams();
  const nav = useNavigate();
  const { data: teams } = useTeams();
  const [notice, setNotice] = useState(false);
  if (!teams) return <p>読み込み中…</p>;

  const students = [...teams].sort((a, b) => a.id.localeCompare(b.id))
    .flatMap((t) => t.members.map((m) => ({ ...m, teamId: t.id })));
  const picked = students.find((s) => s.sid === sid);

  return (
    <>
      <div className="preview-bar card">
        <strong>学生の画面を確認</strong>
        <select value={picked?.sid ?? ''} aria-label="学生を選ぶ" onChange={(e) => e.target.value && nav(`/teacher/preview/${e.target.value}`)}>
          <option value="">学生を選んでください…</option>
          {students.map((s) => <option key={s.sid} value={s.sid}>{s.teamId}チーム {s.name}</option>)}
        </select>
        {picked && (
          <label className="check"><input type="checkbox" checked={notice} onChange={(e) => setNotice(e.target.checked)} /> 初回の案内を表示</label>
        )}
        <span className="hint">閲覧のみです。操作しても、データは変わりません。</span>
      </div>
      {students.length === 0 && <p className="card">学生がまだ登録されていません。<Link to="/teacher/settings?tab=roster">名簿</Link>から登録してください。</p>}
      {picked && (() => {
        const profile: Profile = { email: '', name: picked.name, role: 'student', teamId: picked.teamId, sid: picked.sid };
        return (
          <ProfileOverride.Provider value={profile}>
            <BaseContext.Provider value={`/teacher/preview/${picked.sid}`}>
              <div className="preview-frame">
                <div className="preview-head">
                  <span>{picked.name}(<strong>{picked.teamId}チーム</strong>)</span>
                  <StudentNav teamId={picked.teamId} />
                </div>
                <fieldset disabled className="preview">
                  {notice ? <NoticeBody /> : <StudentApp />}
                </fieldset>
              </div>
            </BaseContext.Provider>
          </ProfileOverride.Provider>
        );
      })()}
    </>
  );
}
