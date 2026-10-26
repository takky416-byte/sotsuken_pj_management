import { useState } from 'react';
import { buildCompanyReport } from '../lib/companyReport';
import { CompanyReportDoc } from './CompanyReportDoc';
import { ReportNotesEditor } from './ReportNotesEditor';
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
 * PJ分析: プロジェクトの概況・分析・ガントチャート・WBS。企業への中間報告で提出できるよう、Excel と PDF(印刷)で出力する。
 * 教員専用のデータは含まれない。
 */
export function ReportView({ team, actor }: { team: Team; actor: string }) {
  const { data: tasks, error } = useTasks(team.id);
  const milestones = useMilestones(team.id);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [showAssignees, setShowAssignees] = useState(true);
  if (error) return <p className="error">{error}</p>;
  if (!tasks || !milestones) return <p>読み込み中…</p>;

  const today = jstDate();
  const a = analyze(tasks, milestones, team.members, today);
  const nameOf = (sid: string) => team.members.find((m) => m.sid === sid)?.name ?? sid;
  const rows = wbsRows(tasks, nameOf);
  const company = buildCompanyReport(team, tasks, milestones, team.reportNotes, today);

  const excel = async () => {
    setBusy(true); setErr('');
    try {
      const { buildReportWorkbook } = await import('../lib/reportExcel');
      const blob = await buildReportWorkbook({ teamId: team.id, projectName: team.projectName, members: team.members, tasks, milestones, analysis: a, today, company, showAssignees });
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
        <label className="check"><input type="checkbox" checked={showAssignees} onChange={(e) => setShowAssignees(e.target.checked)} />WBSに担当者名を載せる</label>
        <span className="hint">企業に提出する報告書(下の「提出用の報告書」と同じ内容)が出ます。PDFは、印刷画面で「送信先: PDFに保存」を選びます(A4横)。Excelには、報告書・WBS・ガントチャートの3シートが入ります。下の「チームの分析」は、チーム内の振り返り用で、出力には入りません。</span>
      </div>
      <ReportNotesEditor team={team} actor={actor} />
      {company.missing.includes('summary') && <p className="warn no-print">「企画の概要と目的」が未記入です。提出の前に、上の「報告書に載せる文章」に書いてください。</p>}
      <details className="card no-print">
        <summary><strong>提出用の報告書(プレビュー)</strong></summary>
        <CompanyReportDoc r={company} />
      </details>
      {err && <p className="error no-print">{err}</p>}

      <div className="print-only"><CompanyReportDoc r={company} rows={rows} teamId={team.id} members={team.members} showAssignees={showAssignees} /></div>

      <div className="no-print">
      <h2 className="analysis-title">チームの分析(チーム内の振り返り用)</h2>
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
    </div>
  );
}
