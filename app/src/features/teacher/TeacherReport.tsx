import { Link, useNavigate, useParams } from 'react-router-dom';
import { ReportView } from '../../components/ReportView';
import { useTeams } from '../../data/teams';

/** 教員の「PJ分析」: チームを選んで、学生と同じ PJ分析・報告書 (Excel・PDF) を見る */
export function TeacherReport() {
  const { id } = useParams();
  const nav = useNavigate();
  const { data: teams, error } = useTeams();
  if (error) return <p className="error">読み込めませんでした: {error}</p>;
  if (!teams) return <p>読み込み中…</p>;
  const sorted = [...teams].sort((a, b) => a.id.localeCompare(b.id));
  const team = sorted.find((t) => t.id === id) ?? null;
  return (
    <>
      <div className="pj-head no-print">
        <h2>PJ分析</h2>
        {team && <Link to={`/meeting/${team.id}`} className="btn big-btn">ミーティング画面</Link>}
      </div>
      <div className="row no-print" role="group" aria-label="チームを選ぶ">
        {sorted.map((t) => (
          <button key={t.id} type="button" className={t.id === team?.id ? '' : 'ghost'} aria-pressed={t.id === team?.id}
            onClick={() => nav(`/teacher/report/${t.id}`)}>
            {t.id}チーム{t.status === 'planning' ? '(企画検討中)' : ''}
          </button>
        ))}
      </div>
      {!team && <p className="hint">チームを選ぶと、そのチームのPJ分析と、Excel・PDFの報告書が出ます。</p>}
      {team && team.status === 'planning' && <p className="card">{team.id}チームは、企画検討中です。キックオフ後に見られます。</p>}
      {team && team.status !== 'planning' && <ReportView key={team.id} team={team} actor="teacher" />}
    </>
  );
}
