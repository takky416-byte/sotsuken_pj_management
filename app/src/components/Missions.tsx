import { useContext, useEffect, useState } from 'react';
import { ProfileOverride } from '../auth/AuthProvider';
import { Link } from 'react-router-dom';
import { celebrate } from '../lib/celebrate';
import type { Mission, WeeklyMission } from '../lib/missions';
import { useBase } from './Base';

const WEEKLY_OPEN_KEY = 'weekly-missions-open';
const flagKey = (sid: string, today: string) => `mission-done:${sid}:${today}`;
const seen = (k: string) => { try { return localStorage.getItem(k) === '1'; } catch { return false; } };
const mark = (k: string) => { try { localStorage.setItem(k, '1'); } catch { /* 保存できなくても動く */ } };

/** ホームの「今日のミッション」。点数ではなく、やることの一覧。 */
export function DailyMissions({ sid, today, daily }: { sid: string; today: string; daily: Mission[] }) {
  const base = useBase();
  const preview = useContext(ProfileOverride) !== null; // 教員の「学生の画面」では、お祝いを出さない
  const doneCount = daily.filter((m) => m.done).length;
  const all = daily.length > 0 && doneCount === daily.length;
  const key = flagKey(sid, today);
  // 全部そろった瞬間に1日1回だけ演出する (開き直しでは出さない)
  useEffect(() => { if (!preview && all && !seen(key)) { mark(key); celebrate('今日のミッション、ぜんぶ達成!'); } }, [all, key, preview]);
  const href = (to: Mission['to']) => (to === 'home' ? `${base}/` : `${base}/${to}`);

  return (
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
  );
}

/** ホームの「チームの今週のミッション」 */
export function WeeklyMissions({ weekly }: { weekly: WeeklyMission[] }) {
  const base = useBase();
  const href = (to: Mission['to']) => (to === 'home' ? `${base}/` : `${base}/${to}`);
  const weeklyDone = weekly.filter((m) => m.done).length;
  if (weekly.length === 0) return null;
  // ホームを縦に長くしないよう、既定では閉じておく (見出しと、達成の数は見える)。開き方は、この端末に覚えておく
  const [open, setOpen] = useState(() => { try { return localStorage.getItem(WEEKLY_OPEN_KEY) === '1'; } catch { return false; } });
  const toggle = (v: boolean) => { setOpen(v); try { localStorage.setItem(WEEKLY_OPEN_KEY, v ? '1' : '0'); } catch { /* 保存できなくても動く */ } };
  return (
    <details className="card missions weekly" open={open} onToggle={(e) => toggle((e.currentTarget as HTMLDetailsElement).open)}>
      <summary>
        <h3>🏁 チームの今週のミッション <span className="mission-count">{weeklyDone}/{weekly.length}</span></h3>
      </summary>
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
    </details>
  );
}
