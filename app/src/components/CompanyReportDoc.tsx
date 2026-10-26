import { formatDate } from '../lib/dates';
import type { CompanyReport } from '../lib/companyReport';
import { mdLabel, type WbsRow } from '../lib/report';
import type { Member } from '../types';
import { GanttChart } from './GanttChart';

const range = (s: string | null, e: string | null) => (s ? `${mdLabel(s)}${e && e !== s ? `〜${mdLabel(e)}` : ''}` : e ? mdLabel(e) : '');

/**
 * 企業に提出する報告書 (印刷・PDF)。画面の「チームの分析」とは別の内容で、外に出してよい情報だけを載せる。
 * rows を渡すと、付録 (ガントチャート・WBS) も付く。showAssignees: WBSに担当者名を載せるか。
 */
export function CompanyReportDoc({ r, rows, teamId, members, showAssignees }: {
  r: CompanyReport; rows?: WbsRow[]; teamId?: string; members?: Member[]; showAssignees?: boolean;
}) {
  const none = <span className="cr-none">(特記事項なし)</span>;
  return (
    <article className="company-report">
      <header className="cr-head">
        <h1>{r.title}</h1>
        <table className="cr-meta">
          <tbody>
            <tr><th>チーム</th><td>{r.teamId}チーム</td><th>報告日</th><td>{formatDate(r.today)}</td></tr>
            <tr><th>企画名</th><td>{r.projectName}</td><th>報告期間</th><td>{r.from ? `${formatDate(r.from)} 〜 ${formatDate(r.today)}` : formatDate(r.today)}</td></tr>
            <tr><th>メンバー</th><td colSpan={3}>{r.members.join('・')}</td></tr>
          </tbody>
        </table>
      </header>

      <section>
        <h2>1. プロジェクトの概要</h2>
        {r.summary ? <p className="cr-text">{r.summary}</p> : <p className="cr-none">(概要・目的を記入してください)</p>}
      </section>

      <section>
        <h2>2. 進捗状況</h2>
        <table className="cr-table cr-summary">
          <tbody>
            <tr><th>総合</th><td><strong className={`cr-judge j-${r.judgement}`}>{r.judgement}</strong></td>
              <th>計画に対する進捗</th><td>計画 {r.plannedPct}% / 実績 {r.actualPct}%</td>
              <th>タスク</th><td>全{r.counts.total}件(完了 {r.counts.done} / 進行中 {r.counts.doing} / 未着手 {r.counts.todo}{r.counts.hold > 0 ? ` / 保留 ${r.counts.hold}` : ''})</td></tr>
          </tbody>
        </table>
        <table className="cr-table">
          <thead><tr><th>工程</th><th>期間</th><th>完了 / 全体</th><th>進捗</th><th>状況</th></tr></thead>
          <tbody>
            {r.phases.map((p) => (
              <tr key={p.title}><td>{p.title}</td><td>{range(p.start, p.end)}</td><td>{p.done} / {p.total}</td><td>{p.pct}%</td><td>{p.state}</td></tr>
            ))}
          </tbody>
        </table>
      </section>

      <section>
        <h2>3. マイルストーン</h2>
        {r.milestones.length === 0 ? none : (
          <table className="cr-table">
            <thead><tr><th>日付</th><th>内容</th><th>状況</th></tr></thead>
            <tbody>
              {r.milestones.map((m) => (
                <tr key={`${m.date}${m.title}`}><td>{range(m.date, m.endDate)}</td><td>{m.title}</td><td>{m.state === '済' ? '済' : `予定(あと${m.daysLeft}日)`}</td></tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section>
        <h2>4. 直近の実績(過去2週間に完了したタスク)</h2>
        {r.recent.length === 0 ? none : <ul>{r.recent.map((t) => <li key={t.title + t.phase}>{t.title}<span className="cr-phase">({t.phase})</span></li>)}</ul>}
      </section>

      <section>
        <h2>5. 課題と対応</h2>
        {r.overdue.length > 0 && (
          <>
            <p>計画より遅れているタスク:</p>
            <ul>{r.overdue.map((t) => <li key={t.title + t.end}>{t.title}<span className="cr-phase">({t.phase}。予定 {mdLabel(t.end)})</span></li>)}</ul>
          </>
        )}
        {r.issuesText ? <p className="cr-text">{r.issuesText}</p> : r.overdue.length === 0 ? none : <p className="cr-none">(対応方針を記入してください)</p>}
      </section>

      <section>
        <h2>6. 今後の予定(今後4週間)</h2>
        {r.upcoming.length === 0 ? none : (
          <table className="cr-table">
            <thead><tr><th>タスク</th><th>工程</th><th>期間</th></tr></thead>
            <tbody>{r.upcoming.map((t) => <tr key={t.title + t.phase}><td>{t.title}</td><td>{t.phase}</td><td>{range(t.start, t.end)}</td></tr>)}</tbody>
          </table>
        )}
        {r.nextText && <p className="cr-text">{r.nextText}</p>}
      </section>

      {rows && teamId && members && (
        <>
          <section className="cr-appendix">
            <h2>付録1. ガントチャート</h2>
            <GanttChart teamId={teamId} actor="teacher" members={members} report />
          </section>
          <section className="cr-appendix">
            <h2>付録2. WBS</h2>
            <table className="wbs-print">
              <thead><tr><th>番号</th><th>タスク</th>{showAssignees && <th>担当</th>}<th>状態</th><th>期間</th><th>進捗</th></tr></thead>
              <tbody>
                {rows.map((w) => (
                  <tr key={w.id} className={`d${w.depth}${w.leaf ? '' : ' parent'}`}>
                    <td>{w.no}</td><td className={`t-d${w.depth}`}>{w.title}</td>
                    {showAssignees && <td>{w.assignees}</td>}
                    <td>{w.statusLabel}</td><td>{range(w.start, w.end)}</td><td>{w.progress}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </>
      )}
    </article>
  );
}
