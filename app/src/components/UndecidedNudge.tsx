import { Link } from 'react-router-dom';
import { formatDate } from '../lib/dates';
import { useBase } from './Base';
import { Em } from './Em';

/** 前回の作業ログで「次にやること」が未定で、いま担当のタスクもないときの、タスク確認の促し (責めずに、次の一歩を示す) */
export function UndecidedNudge({ nudge }: { nudge: { date: string } | null }) {
  const base = useBase();
  if (!nudge) return null;
  return (
    <section className="card nudge undecided-nudge" role="note" aria-label="タスクの確認のお知らせ">
      <div className="nudge-main">
        <strong><Em e="🧭" />担当のタスクを、決めましょう</strong>
        <p>前回({formatDate(nudge.date)})は、「次にやること」が未定でした。いま担当のタスクがありません。WBSで、次にやるタスクを確認して、「担当する」を押してみましょう。ホームの「担当がいないタスク」からも選べます。</p>
      </div>
      <Link to={`${base}/wbs`} className="btn">WBSを開く</Link>
    </section>
  );
}
