import { FIXED_KINDS, statusOf, type Daily, type DayStatus } from '../lib/daily';
import { formatDate } from '../lib/dates';
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
                const s = statusOf(by.get(`${d}_${m.sid}`));
                return <td key={d} className={`mk-${s}`} title={s === 'submitted' ? '提出済み' : s === 'absent' ? '欠席' : '未提出'}>{MARK[s]}</td>;
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** 日報の内容を、新しい日付順に並べる。 */
export function DailyFeed({ dailies, members, tasks, emptyText }: {
  dailies: Daily[];
  members: Member[];
  tasks: Task[];
  emptyText?: string;
}) {
  const name = new Map(members.map((m) => [m.sid, m.name]));
  const title = new Map(tasks.map((t) => [t.id, t.title]));
  const shown = dailies.filter((d) => statusOf(d) === 'submitted')
    .sort((a, b) => b.date.localeCompare(a.date) || a.sid.localeCompare(b.sid, 'en', { numeric: true }));
  if (shown.length === 0) return <p className="hint">{emptyText ?? 'まだ日報がありません。'}</p>;
  const kindLabel = new Map<string, string>(FIXED_KINDS.map((k) => [k.kind, k.label]));
  return (
    <div className="feed">
      {shown.map((d) => (
        <div className="card" key={d.id}>
          <strong>{formatDate(d.date)}</strong> {name.get(d.sid) ?? d.sid}
          <ul className="plain">
            {d.entries.map((e, i) => (
              <li key={i}>
                <span className="badge">{e.kind === 'task' ? 'タスク' : kindLabel.get(e.kind)}</span>
                {' '}{e.kind === 'task' ? (title.get(e.taskId ?? '') ?? '(削除されたタスク)') : ''}
                {e.note && <span className="note">　{e.note}</span>}
              </li>
            ))}
          </ul>
          {d.blocker.trim() && <div className="blocker">困っていること: {d.blocker}</div>}
        </div>
      ))}
    </div>
  );
}
