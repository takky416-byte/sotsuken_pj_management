import type { MemberFacts } from '../lib/facts';
import { shortDate } from '../lib/wbs';

/** メンバーごとの活動の事実 (記録されたデータだけ)。評価ではなく、気づくための一覧。 */
export function FactsTable({ facts, today }: { facts: MemberFacts[]; today: string }) {
  void today;
  return (
    <div>
      <div className="table-wrap">
        <table className="facts">
          <thead>
            <tr><th>メンバー</th><th>最後に動いた日</th><th>7日の更新</th><th>7日の完了</th><th>作業レポート</th><th>担当(未完了)</th><th>期限超過</th><th>約束</th></tr>
          </thead>
          <tbody>
            {facts.map((f) => (
              <tr key={f.sid} className={f.notes.length > 0 ? 'has-notes' : ''}>
                <td><strong>{f.name}</strong></td>
                <td className={f.idleDays === null || f.idleDays >= 7 ? 'bad' : ''}>
                  {f.lastActive ? <>{shortDate(f.lastActive)}<small> ({f.idleDays === 0 ? '今日' : `${f.idleDays}日前`})</small></> : '記録なし'}
                </td>
                <td>{f.updates7}</td>
                <td>{f.done7}</td>
                <td className={f.daily && f.daily.missed >= 2 ? 'bad' : ''}>{f.daily ? `${f.daily.submitted}/${f.daily.days}` : '—'}</td>
                <td>{f.open}</td>
                <td className={f.overdue > 0 ? 'bad' : ''}>{f.overdue}</td>
                <td>{f.promises.total === 0 ? '—' : `${f.promises.done}/${f.promises.total}`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {facts.some((f) => f.notes.length > 0) ? (
        <ul className="plain fact-notes">
          {facts.filter((f) => f.notes.length > 0).map((f) => (
            <li key={f.sid}><strong>{f.name}</strong>: {f.notes.join(' / ')}</li>
          ))}
        </ul>
      ) : <p className="hint">事実として気になる点はありません。</p>}
      <p className="hint">「最後に動いた日」は、タスクの更新と作業レポートの提出のうち新しいほうです。他の人が後から同じタスクを更新すると、先の更新者の記録は上書きされます。数字は、記録されたデータだけから求めています。</p>
    </div>
  );
}
