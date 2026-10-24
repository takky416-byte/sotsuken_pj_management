import type { ProjectAnalysis } from '../lib/analysis';
import { mdLabel } from '../lib/report';

const MARK = { good: '●', info: '●', warn: '●' } as const;

/** 進捗の棒 (実績と、予定でここまで終わっているはずの位置) */
export function ProgressMeter({ actual, planned }: { actual: number; planned: number }) {
  return (
    <div className="meter" role="img" aria-label={`実績${actual}%、予定${planned}%`}>
      <div className="meter-bar"><span className="meter-actual" style={{ width: `${actual}%` }} /><i className="meter-plan" style={{ left: `${planned}%` }} /></div>
      <div className="meter-legend"><strong>実績 {actual}%</strong><span>予定 {planned}%</span></div>
    </div>
  );
}

/** プロジェクトの分析 (ミーティング画面と報告書で共通) */
export function AnalysisView({ a, detail = false }: { a: ProjectAnalysis; detail?: boolean }) {
  return (
    <div className="analysis">
      <div className="analysis-top">
        <ProgressMeter actual={a.progressPct} planned={a.plannedPct} />
        <ul className="plain stat-row">
          <li><strong>{a.done}</strong><span>完了</span></li>
          <li><strong>{a.doing}</strong><span>進行中</span></li>
          <li><strong>{a.todo}</strong><span>未着手</span></li>
          <li className={a.overdue.length > 0 ? 'bad' : ''}><strong>{a.overdue.length}</strong><span>期限超過</span></li>
          <li><strong>{a.adhoc.count}</strong><span>WBS外</span></li>
        </ul>
      </div>
      {a.findings.length > 0 && (
        <ul className="plain findings">
          {a.findings.map((f, i) => <li key={i} className={`finding ${f.level}`}><span className="mark" aria-hidden="true">{MARK[f.level]}</span> {f.text}</li>)}
        </ul>
      )}
      {a.phases.length > 0 && (
        <div className="phases">
          {a.phases.map((p) => (
            <div key={p.id} className="phase">
              <span className="phase-name">{p.title}</span>
              <span className="phase-bar"><span style={{ width: `${p.pct}%` }} /></span>
              <span className="phase-pct">{p.pct}%<small> ({p.done}/{p.total})</small></span>
              {detail && <span className="phase-period hint">{p.start ? mdLabel(p.start) : ''}{p.end ? `〜${mdLabel(p.end)}` : ''}</span>}
            </div>
          ))}
        </div>
      )}
      {detail && a.members.length > 0 && (
        <table className="analysis-table">
          <thead><tr><th>メンバー</th><th>担当</th><th>進行中</th><th>完了</th><th>期限超過</th></tr></thead>
          <tbody>{a.members.map((m) => <tr key={m.sid}><td>{m.name}</td><td>{m.assigned}</td><td>{m.doing}</td><td>{m.done}</td><td className={m.overdue > 0 ? 'bad' : ''}>{m.overdue}</td></tr>)}</tbody>
        </table>
      )}
    </div>
  );
}
