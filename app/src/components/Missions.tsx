import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { celebrate } from '../lib/celebrate';
import type { Mission, WeeklyMission } from '../lib/missions';
import { useBase } from './Base';

const flagKey = (sid: string, today: string) => `mission-done:${sid}:${today}`;
const seen = (k: string) => { try { return localStorage.getItem(k) === '1'; } catch { return false; } };
const mark = (k: string) => { try { localStorage.setItem(k, '1'); } catch { /* 保存できなくても動く */ } };

/** ホームの「今日のミッション」と「チームの今週のミッション」。点数ではなく、やることの一覧。 */
export function Missions({ sid, today, daily, weekly }: { sid: string; today: string; daily: Mission[]; weekly: WeeklyMission[] }) {
  const base = useBase();
  const doneCount = daily.filter((m) => m.done).length;
  const all = daily.length > 0 && doneCount === daily.length;
  const key = flagKey(sid, today);
  // 全部そろった瞬間に1日1回だけ演出する (開き直しでは出さない)
  useEffect(() => { if (all && !seen(key)) { mark(key); celebrate('今日のミッション、ぜんぶ達成!'); } }, [all, key]);
  const href = (to: Mission['to']) => `${base}/${to}`;
  const weeklyDone = weekly.filter((m) => m.done).length;

  return (
    <>
      <section className={`card missions ${all ? 'all-done' : ''}`}>
        <h3>🚩 今日のミッション <span className="mission-count">{doneCount}/{daily.length}</span></h3>
        <ul className="plain mission-list">
          {daily.map((m) => (
            <li key={m.id} className={`mission ${m.done ? 'done' : ''}`}>
              <span className="mission-check" aria-hidden="true">{m.done ? '✔' : ''}</span>
              <div className="mission-main">
                <strong>{m.label}</strong>
                {!m.done && <div className="hint">{m.hint}</div>}
              </div>
              {!m.done && <Link to={href(m.to)} className="btn ghost-btn">開く</Link>}
            </li>
          ))}
        </ul>
        {all && <p className="mission-clear">ぜんぶ達成! 今日もおつかれさま。</p>}
      </section>

      {weekly.length > 0 && (
        <section className="card missions">
          <h3>🏁 チームの今週のミッション <span className="mission-count">{weeklyDone}/{weekly.length}</span></h3>
          <p className="hint">メンバー全員で達成します。</p>
          <ul className="plain mission-list">
            {weekly.map((m) => (
              <li key={m.id} className={`mission ${m.done ? 'done' : ''}`}>
                <span className="mission-check" aria-hidden="true">{m.done ? '✔' : ''}</span>
                <div className="mission-main">
                  <strong>{m.label}</strong>
                  <div className="hint">{m.detail}{!m.done && ` ／ ${m.hint}`}</div>
                </div>
                {!m.done && <Link to={href(m.to)} className="btn ghost-btn">開く</Link>}
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
