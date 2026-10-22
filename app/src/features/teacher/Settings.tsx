import { useState } from 'react';
import { setPeerDailyView } from '../../data/calendar';
import { useSettings } from '../../data/daily';
import { updateTeam, useTeams } from '../../data/teams';

export function Settings() {
  const settings = useSettings();
  const { data: teams } = useTeams();
  const [err, setErr] = useState('');
  if (!settings || !teams) return <p>読み込み中…</p>;
  const run = async (fn: () => Promise<unknown>) => {
    setErr('');
    try { await fn(); } catch (e) { setErr(`できませんでした: ${(e as Error).message}`); }
  };
  return (
    <>
      <h2>設定</h2>
      {err && <p className="error">{err}</p>}
      <div className="card form">
        <label className="check">
          <input type="checkbox" checked={settings.peerDailyView} onChange={(e) => run(() => setPeerDailyView(e.target.checked))} />
          同じチームの日報を、チームのメンバーどうしで見られるようにする
        </label>
        <p className="hint">オフにすると、学生は自分の日報だけが見えます。教員はどちらでも全員分を見られます。</p>
      </div>
      <h3>ミーティング記録の入力</h3>
      <p className="hint">初期は教員だけが入力します。自分たちで進められるチームは、チームの学生にも入力を許可できます。</p>
      <div className="card">
        {[...teams].sort((a, b) => a.id.localeCompare(b.id)).map((t) => (
          <label className="check" key={t.id}>
            <input type="checkbox" checked={t.teamMeetingInput} onChange={(e) => run(() => updateTeam(t.id, { teamMeetingInput: e.target.checked }))} />
            {t.id}チーム: チームの学生も記録を入力できる
          </label>
        ))}
      </div>
    </>
  );
}
