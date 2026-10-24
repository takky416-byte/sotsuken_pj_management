import { Link } from 'react-router-dom';
import { nudgeMessage, type Nudge } from '../lib/dailyNudge';
import { useTone } from '../lib/tone';
import { useBase } from './Base';
import { Em } from './Em';

/** 作業ログの間があいているときの、やさしい促し。出し終わると、自然に消える。 */
export function DailyNudge({ nudge, isClassDay, link = true }: { nudge: Nudge; isClassDay: boolean; link?: boolean }) {
  const base = useBase();
  const tone = useTone();
  const m = nudgeMessage(nudge, isClassDay, tone);
  if (!m) return null;
  return (
    <section className="card nudge" role="note" aria-label="作業ログのお知らせ">
      <div className="nudge-main">
        <strong><Em e="🌱" />{m.title}</strong>
        <p>{m.body}</p>
      </div>
      {link && <Link to={`${base}/daily`} className="btn">作業ログを書く</Link>}
    </section>
  );
}
