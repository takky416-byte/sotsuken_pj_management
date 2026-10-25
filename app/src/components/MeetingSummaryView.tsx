import { Em } from './Em';
import { formatDate } from '../lib/dates';
import { splitLatest, type MeetingSummary } from '../lib/meetingSummary';

function Body({ s }: { s: MeetingSummary }) {
  const list = (title: string, items: string[]) => items.length > 0 && (
    <div className="ms-block"><div className="label">{title}</div><ul className="plain">{items.map((x, i) => <li key={i}>{x}</li>)}</ul></div>
  );
  return (
    <>
      <p className="msg-text ms-summary">{s.summary}</p>
      {list('決まったこと', s.decided)}
      {list('次の1週間でやること', s.actions)}
      {list('詰まり・気になること', s.concerns)}
    </>
  );
}

/** 学生のホーム: 前回のミーティングの要旨 (先生が確認して公開したもの)。新しい回を開いて見せ、前の回はたたむ。 */
export function MeetingSummaryCard({ summaries }: { summaries: MeetingSummary[] }) {
  const { latest, older } = splitLatest(summaries);
  if (!latest) return null;
  return (
    <section className="card meeting-summary" aria-label="前回のミーティングの要旨">
      <h3><Em e="📝" />前回のミーティングの要旨 <span className="hint">{formatDate(latest.date)}</span></h3>
      <Body s={latest} />
      {older.length > 0 && (
        <details className="ms-older">
          <summary>これまでの要旨({older.length})</summary>
          {older.map((s) => (
            <div key={s.id} className="ms-old">
              <div className="label">{formatDate(s.date)}</div>
              <Body s={s} />
            </div>
          ))}
        </details>
      )}
    </section>
  );
}
