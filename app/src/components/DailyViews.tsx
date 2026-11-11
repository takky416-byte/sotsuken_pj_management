import { useState } from 'react';
import { Pager } from './Pager';
import { pageOf } from '../lib/paging';
import { FIXED_KINDS, NO_WORK_REASON_LABEL, RESULT_LABEL, statusOf, type Daily, type DayStatus } from '../lib/daily';
import { formatDate } from '../lib/dates';
import { Markdown } from './Markdown';
import type { Member, Task } from '../types';

const MARK: Record<DayStatus, string> = { submitted: '○', absent: '欠', missing: '×' };

/** メンバー × 授業日 の提出状況。ミーティング画面と教員のチーム詳細で使う。 */
export function DailyMatrix({ members, dates, dailies }: { members: Member[]; dates: string[]; dailies: Daily[] }) {
  const by = new Map(dailies.map((d) => [`${d.date}_${d.sid}`, d]));
  if (dates.length === 0) return <p className="hint">表示できる授業日がまだありません。</p>;
  return (
    <div className="table-wrap">
      <table className="table matrix">
        <thead>
          <tr><th></th>{dates.map((d) => <th key={d}>{formatDate(d)}</th>)}</tr>
        </thead>
        <tbody>
          {members.map((m) => (
            <tr key={m.sid}>
              <th>{m.name}</th>
              {dates.map((d) => {
                const doc = by.get(`${d}_${m.sid}`);
                const s = statusOf(doc);
                if (s === 'submitted' && doc?.noWork) return <td key={d} className="mk-nowork" title="作業なしで提出">無</td>;
                return <td key={d} className={`mk-${s}`} title={s === 'submitted' ? '提出済み' : s === 'absent' ? '欠席' : '未提出'}>{MARK[s]}</td>;
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** 作業ログの内容を、新しい日付順に並べる。 */
export function DailyFeed({ dailies, members, tasks, emptyText, pageSize }: {
  dailies: Daily[];
  members: Member[];
  tasks: Task[];
  emptyText?: string;
  /** 1ページの件数。なければ、すべてを並べる */
  pageSize?: number;
}) {
  const [page, setPage] = useState(1);
  const name = new Map(members.map((m) => [m.sid, m.name]));
  const title = new Map(tasks.map((t) => [t.id, t.title]));
  const shown = dailies.filter((d) => statusOf(d) === 'submitted')
    .sort((a, b) => b.date.localeCompare(a.date) || a.sid.localeCompare(b.sid, 'en', { numeric: true }));
  if (shown.length === 0) return <p className="hint">{emptyText ?? 'まだ作業ログがありません。'}</p>;
  const pg = pageSize ? pageOf(shown.length, page, pageSize) : null;
  const visible = pg ? shown.slice(pg.start, pg.end) : shown;
  const kindLabel = new Map<string, string>(FIXED_KINDS.map((k) => [k.kind, k.label]));
  return (
    <div className="feed">
      {pageSize && <Pager total={shown.length} page={page} size={pageSize} onPage={setPage} />}
      {visible.map((d) => (
        <div className="card" key={d.id}>
          <strong>{formatDate(d.date)}</strong> {name.get(d.sid) ?? d.sid}
          {d.noWork && <p className="hint nowork-note"><span className="badge">作業なし</span> 今日は何も作業していない{d.noWorkReason ? `(${NO_WORK_REASON_LABEL[d.noWorkReason]})` : ''}</p>}
          <ul className="plain">
            {d.entries.map((e, i) => (
              <li key={i}>
                <span className="badge">{e.kind === 'task' ? 'タスク' : kindLabel.get(e.kind)}</span>
                {' '}{e.kind === 'task' ? (title.get(e.taskId ?? '') ?? '(削除されたタスク)') : ''}
                {e.result && <span className={`result-badge r-${e.result}`}>{RESULT_LABEL[e.result]}</span>}
                {e.note && <Markdown className="note" text={e.note} />}
              </li>
            ))}
          </ul>
          {d.next?.trim() && <div className="next-plan"><strong>次にやること</strong><Markdown text={d.next} /></div>}
          {d.nextUndecided && <div className="next-plan"><strong>次にやること</strong> <span className="hint">まだ決まっていない</span></div>}
        </div>
      ))}
      {pageSize && <Pager total={shown.length} page={page} size={pageSize} onPage={(n) => { setPage(n); }} />}
    </div>
  );
}
