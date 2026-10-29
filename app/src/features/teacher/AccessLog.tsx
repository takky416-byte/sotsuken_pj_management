import { Fragment, useState } from 'react';
import { useAccessLogs } from '../../data/access';
import { useClassDays } from '../../data/calendar';
import { useTeams } from '../../data/teams';
import { SCREEN_LABEL, accessSummary, timeLabel } from '../../lib/access';
import { addDays, formatDate, jstDate } from '../../lib/dates';

const DAYS = 14;

/** 教員だけが見る、学生のアクセス履歴。いつ・どの画面を開いたか。 */
export function AccessLogPage() {
  const today = jstDate();
  const from = addDays(today, -(DAYS - 1)); // 表示する日数ぶんだけ読む
  const { data: logs, error } = useAccessLogs(from);
  const { data: teams } = useTeams();
  const classDays = useClassDays();
  const [team, setTeam] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  if (error) return <p className="error">{error}</p>;
  if (!logs || !teams || !classDays) return <p>読み込み中…</p>;

  const students = teams.flatMap((t) => t.members.map((m) => ({ sid: m.sid, name: m.name, teamId: t.id })));
  const rows = accessSummary(logs, students, today, DAYS).filter((r) => !team || r.teamId === team);
  const isClass = new Set(classDays.map((d) => d.date));
  const accessedToday = rows.filter((r) => r.daysSince === 0).length;
  const absent3 = rows.filter((r) => r.daysSince === null || r.daysSince >= 3).length;
  const rel = (n: number | null) => (n === null ? '記録なし' : n === 0 ? '今日' : `${n}日前`);

  return (
    <>
      <h3>アクセス履歴</h3>
      <p className="hint">
        学生がアプリを開いた記録です(教員だけが見られます)。記録するのは、日付・初回/最終の時刻・開いた回数・画面の表示回数・画面の種類だけで、
        入力した内容や操作の詳細は記録しません。画面の表示は2分ごとにまとめて書くため、時刻には最大2分ほどの差があります。
      </p>
      <div className="row">
        <label>チーム
          <select aria-label="チームで絞り込む" value={team} onChange={(e) => setTeam(e.target.value)}>
            <option value="">すべて</option>
            {[...teams].sort((a, b) => a.id.localeCompare(b.id)).map((t) => <option key={t.id} value={t.id}>{t.id}チーム</option>)}
          </select>
        </label>
        <span className="pill">今日アクセス: <strong>{accessedToday}</strong>/{rows.length}人</span>
        <span className={`pill ${absent3 > 0 ? 'warn' : ''}`}>3日以上アクセスなし: <strong>{absent3}</strong>人</span>
      </div>

      <div className="table-wrap">
        <table className="access">
          <thead>
            <tr><th>チーム</th><th>名前</th><th>最終アクセス</th><th>直近{DAYS}日 <span className="hint">(◆=授業日)</span></th><th>日数</th><th>よく見る画面</th></tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <Fragment key={r.sid}>
                <tr className={r.daysSince === null || r.daysSince >= 3 ? 'quiet' : ''}>
                  <td>{r.teamId}</td>
                  <td><button type="button" className="linklike" aria-expanded={open === r.sid} onClick={() => setOpen(open === r.sid ? null : r.sid)}>{r.name}</button></td>
                  <td>{r.lastAt ? <>{formatDate(r.lastDate as string)} {timeLabel(r.lastAt)} <small>({rel(r.daysSince)})</small></> : '記録なし'}</td>
                  <td>
                    <span className="dots" role="img" aria-label={`直近${DAYS}日のうち${r.activeDays}日アクセス`}>
                      {r.dates.map((d) => (
                        <i key={d.date} className={`dot ${d.log ? 'on' : ''} ${isClass.has(d.date) ? 'cls' : ''}`}
                          title={`${formatDate(d.date)}${isClass.has(d.date) ? ' 授業日' : ''}: ${d.log ? `${timeLabel(d.log.firstAt)}〜${timeLabel(d.log.lastAt)} / ${d.log.visits}回 / 表示${d.log.views}` : 'アクセスなし'}`} />
                      ))}
                    </span>
                  </td>
                  <td>{r.activeDays}/{DAYS}</td>
                  <td>{r.topScreens.slice(0, 3).map(([k, n]) => `${SCREEN_LABEL[k] ?? k} ${n}`).join(' / ') || '—'}</td>
                </tr>
                {open === r.sid && (
                  <tr className="access-detail">
                    <td colSpan={6}>
                      <ul className="plain">
                        {[...r.dates].reverse().filter((d) => d.log).map((d) => (
                          <li key={d.date}>
                            <strong>{formatDate(d.date)}</strong>{isClass.has(d.date) && <span className="badge">授業日</span>}{' '}
                            {timeLabel(d.log!.firstAt)}〜{timeLabel(d.log!.lastAt)} / 開いた{d.log!.visits}回 / 表示{d.log!.views}回
                            <span className="hint"> ({Object.entries(d.log!.screens ?? {}).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${SCREEN_LABEL[k] ?? k} ${n}`).join('、')})</span>
                          </li>
                        ))}
                        {r.activeDays === 0 && <li className="hint">直近{DAYS}日のアクセスはありません。</li>}
                      </ul>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length === 0 && <p className="card">学生がまだ登録されていません。</p>}
    </>
  );
}
