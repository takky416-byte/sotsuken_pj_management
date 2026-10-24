import { useState } from 'react';
import { useMilestones } from '../data/calendar';
import { downloadBlob } from '../data/export';
import { useTasks } from '../data/tasks';
import { analyze } from '../lib/analysis';
import { formatDate, jstDate } from '../lib/dates';
import { mdLabel, wbsRows } from '../lib/report';
import type { Team } from '../types';
import { AnalysisView } from './AnalysisView';
import { GanttChart } from './GanttChart';
import { STALE_MESSAGE, isStaleChunkError, mayReloadForUpdate } from '../lib/staleChunk';

/**
 * 報告書: プロジェクトの概況・分析・ガントチャート・WBS。企業への中間報告で提出できるよう、Excel と PDF(印刷)で出力する。
 * 教員専用のデータは含まれない。
 */
export function ReportView({ team, actor }: { team: Team; actor: string }) {
  const { data: tasks, error } = useTasks(team.id);
  const milestones = useMilestones(team.id);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  if (error) return <p className="error">{error}</p>;
  if (!tasks || !milestones) return <p>読み込み中…</p>;

  const today = jstDate();
  const a = analyze(tasks, milestones, team.members, today);
  const nameOf = (sid: string) => team.members.find((m) => m.sid === sid)?.name ?? sid;
  const rows = wbsRows(tasks, nameOf);

  const excel = async () => {
    setBusy(true); setErr('');
    try {
      const { buildReportWorkbook } = await import('../lib/reportExcel');
      const blob = await buildReportWorkbook({ teamId: team.id, projectName: team.projectName, members: team.members, tasks, milestones, analysis: a, today });
      downloadBlob(`sotsuken-${team.id}-report-${today}.xlsx`, blob);
    } catch (e) {
      if (isStaleChunkError(e)) {
        if (mayReloadForUpdate()) { window.location.reload(); return; }
        setErr(STALE_MESSAGE);
      } else setErr(`Excelを作れませんでした: ${(e as Error).message}`);
    }
    finally { setBusy(false); }
  };

  return (
    <div className="report">
      <div className="report-actions no-print">
        <button type="button" onClick={excel} disabled={busy}>{busy ? '作成中…' : 'Excelで保存(.xlsx)'}</button>
        <button type="button" className="ghost" onClick={() => window.print()}>PDFで保存(印刷)</button>
        <span className="hint">PDFは、印刷画面で「送信先: PDFに保存」を選びます(A4横)。Excelには、概況・WBS・ガントチャートの3シートが入ります。</span>
      </div>
      {err && <p className="error no-print">{err}</p>}

      <header className="report-head">
        <h2>{team.id}チーム プロジェクト概況レポート</h2>
        <div className="report-meta">
          <div><span className="label">企画</span> {team.projectName}</div>
          <div><span className="label">メンバー</span> {team.members.map((m) => m.name).join('・')}</div>
          <div><span className="label">作成日</span> {formatDate(today)}</div>
        </div>
      </header>

      <section className="card"><h3>概況と分析</h3><AnalysisView a={a} detail /></section>

      <section className="card report-gantt">
        <h3>ガントチャート</h3>
        <GanttChart teamId={team.id} actor={actor} members={team.members} report />
      </section>

      <section className="card">
        <h3>WBS</h3>
        <table className="wbs-print">
          <thead><tr><th>番号</th><th>タスク</th><th>担当</th><th>状態</th><th>期間</th><th>進捗</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className={`d${r.depth}${r.leaf ? '' : ' parent'}`}>
                <td>{r.no}</td>
                <td className={`t-d${r.depth}`}>{r.title}</td>
                <td>{r.assignees}</td>
                <td><span className={`st-chip st-${r.status}`}>{r.statusLabel}</span></td>
                <td>{r.start ? mdLabel(r.start) : ''}{r.end && r.end !== r.start ? `〜${mdLabel(r.end)}` : ''}{r.derived && <small> (自動)</small>}</td>
                <td>{r.progress}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
