import { Em } from './Em';
import { formatDate } from '../lib/dates';
import { splitLatest, type MeetingMinutes } from '../lib/meetingMinutes';

/** 学生のホーム: 前回のミーティングの議事録 (先生が公開したもの)。新しい回を開いて見せ、前の回はたたむ。 */
export function MeetingMinutesCard({ minutes }: { minutes: MeetingMinutes[] }) {
  const { latest, older } = splitLatest(minutes);
  if (!latest) return null;
  return (
    <section className="card meeting-summary" aria-label="前回のミーティングの議事録">
      <h3><Em e="📝" />前回のミーティングの議事録 <span className="hint">{formatDate(latest.date)}</span></h3>
      <div className="minutes-text">{latest.text}</div>
      {older.length > 0 && (
        <details className="ms-older">
          <summary>これまでの議事録({older.length})</summary>
          {older.map((m) => (
            <div key={m.id} className="ms-old">
              <div className="label">{formatDate(m.date)}</div>
              <div className="minutes-text">{m.text}</div>
            </div>
          ))}
        </details>
      )}
    </section>
  );
}
