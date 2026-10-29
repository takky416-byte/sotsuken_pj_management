import { useMemo, useState } from 'react';
import { StackTable } from '../../components/StackTable';
import { useAccessLogs } from '../../data/access';
import { useClassDays } from '../../data/calendar';
import { useTeamDailies, useSettings } from '../../data/daily';
import { useAllMeetings } from '../../data/meetings';
import { useTaskLogsSince, useTasks } from '../../data/tasks';
import { useTeams } from '../../data/teams';
import { useThanks } from '../../data/thanks';
import { PERIOD_LABEL, contributionCsv, contributions, periodFrom, type Period } from '../../lib/contribution';
import { RATE_LABEL, SHARE_LABEL, periodDays, rateOf, shares, summarize, weeklyActivity, type RateKey, type ShareKey } from '../../lib/compare';
import { jstDate } from '../../lib/dates';
import { shortDate } from '../../lib/wbs';
import type { Team } from '../../types';

const fromMs = (date: string) => Date.parse(`${date}T00:00:00+09:00`);

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url; a.download = name; a.click();
  URL.revokeObjectURL(url);
}

/** チームの、メンバーごとの数と、週ごとの動き。チームのぶんだけ読む。 */
function useTeamNumbers(team: Team, period: Period, withAccess: boolean) {
  const today = jstDate();
  const settings = useSettings();
  const classDays = useClassDays();
  const from = periodFrom(period, today, team.kickoffAt, settings?.dailyStartDate ?? '2026-10-28');
  const { data: tasks } = useTasks(team.id);
  const { data: taskLogs } = useTaskLogsSince(team.id, fromMs(from));
  const { data: dailies } = useTeamDailies(team.id, from);
  const { data: thanks } = useThanks(team.id, from);
  const { data: meetings } = useAllMeetings(team.id);
  const { data: access } = useAccessLogs(withAccess ? from : '9999-12-31');
  const data = useMemo(() => {
    if (!(tasks && taskLogs && dailies && thanks && meetings && classDays && settings)) return null;
    const mine = withAccess && access ? access.filter((l) => team.members.some((m) => m.sid === l.sid)) : null;
    return {
      rows: contributions({ teamId: team.id, members: team.members, from, today, tasks, taskLogs, dailies, classDays, dailyStart: settings.dailyStartDate, thanks, meetings, access: mine }),
      weekly: weeklyActivity({ members: team.members, from, today, taskLogs, dailies, access: mine }),
      from, today, days: periodDays(from, today),
    };
  }, [team, from, today, tasks, taskLogs, dailies, thanks, meetings, classDays, settings, withAccess, access]);
  return data;
}

/** チームの中の比較: 表・メンバーの割合(積み上げ棒)・週ごとの動き(ヒートマップ) */
function TeamContribution({ team, period, withAccess }: { team: Team; period: Period; withAccess: boolean }) {
  const data = useTeamNumbers(team, period, withAccess);
  const [key, setKey] = useState<ShareKey>('wbs');
  const rows = data?.rows ?? null;
  const from = data?.from ?? '';
  const today = data?.today ?? '';
  if (!rows) return <p className="hint">{team.id}チーム: 読み込み中…</p>;
  const rate = (a: number, b: number) => (b === 0 ? '—' : `${a}/${b}`);
  return (
    <section className="log-section">
      <div className="row">
        <h3>{team.id}チーム {team.projectName && <small>{team.projectName}</small>}</h3>
        <span className="hint">{shortDate(from)}〜{shortDate(today)}</span>
        <button type="button" className="ghost" onClick={() => download(`利用状況_${team.id}チーム_${from}_${today}.csv`, contributionCsv(rows))}>CSVで書き出す</button>
      </div>
      <div className="table-wrap">
        <StackTable className="facts">
          <thead>
            <tr>
              <th>メンバー</th><th>作業ログ<br />提出/授業日</th><th>WBSを直接変更</th><th>作業ログ経由の更新</th><th>追加した<br />タスク</th><th>完了に<br />した回数</th>
              <th>いまの担当<br />完了/全体</th><th>期限超過</th>{withAccess && <><th>アクセス日数</th><th>画面表示</th></>}<th>ありがとう<br />送/受</th><th>約束<br />果たした/全体</th><th>最後に動いた日</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.sid}>
                <td><strong>{r.name}</strong></td>
                <td>{rate(r.daily.submitted, r.daily.days)}</td>
                <td>{r.wbsEdits}</td><td>{r.viaDaily}</td><td>{r.created}</td><td>{r.completed}</td>
                <td>{rate(r.assigned.done, r.assigned.total)}</td>
                <td>{r.overdue}</td>
                {withAccess && <><td>{r.access?.days ?? '—'}</td><td>{r.access?.views ?? '—'}</td></>}
                <td>{r.thanksSent}/{r.thanksReceived}</td>
                <td>{rate(r.promises.done, r.promises.total)}</td>
                <td>{r.lastActive ? shortDate(r.lastActive) : '記録なし'}</td>
              </tr>
            ))}
          </tbody>
        </StackTable>
      </div>
      <div className="cmp-block">
        <div className="row">
          <strong>メンバーの割合</strong>
          <label>指標
            <select aria-label="割合の指標" value={key} onChange={(e) => setKey(e.target.value as ShareKey)}>
              {(Object.keys(SHARE_LABEL) as ShareKey[]).filter((k) => withAccess || k !== 'access').map((k) => <option key={k} value={k}>{SHARE_LABEL[k]}</option>)}
            </select>
          </label>
        </div>
        <ShareBars items={shares(rows, key)} />
        <p className="hint">チーム全体を100%として、メンバーごとの割合です。人数で均等に分けた割合({rows.length > 0 ? Math.round(100 / rows.length) : 0}%)が目安の線です。</p>
      </div>
      {data && (
        <div className="cmp-block">
          <strong>週ごとの動き</strong>
          <Heatmap weekly={data.weekly} withAccess={withAccess} />
          <p className="hint">1週間に動いた回数(WBSの変更・作業ログの提出{withAccess ? '・アクセスした日' : ''})の多さを、色の濃さで示します。週は月曜はじまりです。</p>
        </div>
      )}
    </section>
  );
}

/** メンバーの割合の積み上げ(横棒)。均等な割合の位置に線を引く。 */
function ShareBars({ items }: { items: { sid: string; name: string; value: number; pct: number | null }[] }) {
  if (items.every((i) => i.pct === null)) return <p className="hint">この期間は、記録がありません。</p>;
  const even = 100 / items.length;
  return (
    <ul className="plain share-bars">
      {items.map((i) => (
        <li key={i.sid}>
          <span className="share-name">{i.name}</span>
          <span className="share-track" role="img" aria-label={`${i.name}: ${i.value}(${Math.round(i.pct ?? 0)}%)`}>
            <i className="share-fill" style={{ width: `${i.pct ?? 0}%` }} />
            <i className="share-even" style={{ left: `${even}%` }} />
          </span>
          <span className="share-val">{i.value}<small> ({Math.round(i.pct ?? 0)}%)</small></span>
        </li>
      ))}
    </ul>
  );
}

function Heatmap({ weekly, withAccess }: { weekly: ReturnType<typeof weeklyActivity>; withAccess: boolean }) {
  void withAccess;
  return (
    <div className="table-wrap">
      <table className="heat">
        <thead><tr><th />{weekly.weeks.map((w) => <th key={w}>{shortDate(w)}〜</th>)}</tr></thead>
        <tbody>
          {weekly.rows.map((r) => (
            <tr key={r.sid}>
              <th>{r.name}</th>
              {r.counts.map((n, i) => (
                <td key={weekly.weeks[i]} className={n === 0 ? 'zero' : ''} title={`${r.name} ${shortDate(weekly.weeks[i])}の週: ${n}回`}
                  style={n > 0 ? { background: `color-mix(in srgb, var(--accent) ${Math.max(15, Math.round((n / weekly.max) * 85))}%, var(--card))` } : undefined}>{n}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** チーム間の比較の1行 (表の1行と、ドットプロットの1行)。チームのぶんだけ読む。 */
function CompareRow({ team, period, withAccess, rate }: { team: Team; period: Period; withAccess: boolean; rate: RateKey }) {
  const data = useTeamNumbers(team, period, withAccess);
  if (!data) return <tr><td>{team.id}</td><td colSpan={8} className="hint">読み込み中…</td></tr>;
  const sm = summarize(team.id, data.rows, data.days);
  const pct = (x: number | null) => (x === null ? '—' : `${Math.round(x * 100)}%`);
  const dots = data.rows.map((r) => ({ r, v: rateOf(r, rate, data.days) }));
  return (
    <tr>
      <td><strong>{team.id}</strong></td><td>{sm.members}</td>
      <td className="dotcell">
        <span className="dotplot" role="img" aria-label={`${team.id}チームの${RATE_LABEL[rate]}`}>
          {dots.filter((d) => d.v !== null).map((d) => <i key={d.r.sid} className="dp" style={{ left: `${(d.v as number) * 100}%` }} title={`${d.r.name}: ${pct(d.v)}`} />)}
          {(() => { const m = sm[rate === 'daily' ? 'daily' : rate === 'access' ? 'access' : 'done']; return m === null ? null : <i className="dp-avg" style={{ left: `${m * 100}%` }} title={`平均 ${pct(m)}`} />; })()}
        </span>
      </td>
      <td>{pct(sm.daily)}</td><td>{withAccess ? pct(sm.access) : '—'}</td><td>{pct(sm.done)}</td>
      <td>{sm.completedPerMember.toFixed(1)}</td><td className={sm.overdue > 0 ? 'bad' : ''}>{sm.overdue}</td>
      <td>{sm.skew === null ? '—' : `${Math.round(sm.skew)}%`}</td>
    </tr>
  );
}

function CompareTeams({ teams, period, withAccess }: { teams: Team[]; period: Period; withAccess: boolean }) {
  const [rate, setRate] = useState<RateKey>('daily');
  return (
    <>
      <div className="row log-filters">
        <label>点で見る指標
          <select aria-label="点で見る指標" value={rate} onChange={(e) => setRate(e.target.value as RateKey)}>
            {(Object.keys(RATE_LABEL) as RateKey[]).filter((k) => withAccess || k !== 'access').map((k) => <option key={k} value={k}>{RATE_LABEL[k]}</option>)}
          </select>
        </label>
      </div>
      <div className="table-wrap">
        <StackTable className="facts">
          <thead>
            <tr><th>チーム</th><th>人数</th><th>{RATE_LABEL[rate]}<br /><small>点=メンバー、縦線=平均(0〜100%)</small></th><th>作業ログ<br />提出率</th><th>アクセス<br />した日の割合</th><th>担当タスク<br />完了率</th><th>1人あたり<br />完了にした回数</th><th>期限超過<br />(合計)</th><th>偏り<br /><small>いちばん多い人の割合</small></th></tr>
          </thead>
          <tbody>{teams.map((t) => <CompareRow key={t.id} team={t} period={period} withAccess={withAccess} rate={rate} />)}</tbody>
        </StackTable>
      </div>
      <ul className="hint">
        <li>率は、メンバーの率の平均です(人数の違いに左右されません)。並び順はチーム名順で、順位ではありません。</li>
        <li>ハード系は機材の待ち時間があり、ソフト系とは作業の量や進み方が違います。数の差が、そのまま取り組みの差とは限りません。</li>
        <li><strong>偏り</strong>は、WBSの変更のうち、いちばん多い人が占める割合です(均等なら 100÷人数 %)。高いときは、特定の人に作業が集まっている可能性があります。</li>
      </ul>
    </>
  );
}

/** 教員だけが見る、メンバーの関与・貢献の分析。キックオフからの通算などを、数で見る。 */
export function ContributionPanel() {
  const { data: teams } = useTeams();
  const [team, setTeam] = useState('');
  const [period, setPeriod] = useState<Period>('kickoff');
  const [withAccess, setWithAccess] = useState(true);
  const [scope, setScope] = useState<'inside' | 'between'>('inside');
  const [loadAll, setLoadAll] = useState(false); // チーム間の比較は、全チームを読むので、押したときだけ
  if (!teams) return <p>読み込み中…</p>;
  const sorted = [...teams].filter((t) => t.members.length > 0).sort((a, b) => a.id.localeCompare(b.id));
  const shown = team === 'all' ? sorted : sorted.filter((t) => t.id === team);
  return (
    <>
      <p className="hint">
        メンバーの関与を、記録されたデータから数えます。点数や順位はつけません。数は目安で、内容の質は作業ログや成果物で確かめてください
        (たとえば、WBSの変更が多くても、中身が薄いことがあります)。チームを選ぶと、そのチームのぶんだけを読み込みます。
      </p>
      <div className="seg view-switch" role="group" aria-label="比べ方">
        <button type="button" className={`seg-btn ${scope === 'inside' ? 'on' : ''}`} aria-pressed={scope === 'inside'} onClick={() => setScope('inside')}>チームの中(メンバーどうし)</button>
        <button type="button" className={`seg-btn ${scope === 'between' ? 'on' : ''}`} aria-pressed={scope === 'between'} onClick={() => setScope('between')}>チームどうし</button>
      </div>
      <div className="row log-filters">
        {scope === 'inside' && <label>チーム
          <select aria-label="分析するチーム" value={team} onChange={(e) => setTeam(e.target.value)}>
            <option value="">選んでください</option>
            {sorted.map((t) => <option key={t.id} value={t.id}>{t.id}チーム</option>)}
            <option value="all">すべて(全チームを読み込みます)</option>
          </select>
        </label>}
        <label>期間
          <select aria-label="期間" value={period} onChange={(e) => setPeriod(e.target.value as Period)}>
            {(Object.keys(PERIOD_LABEL) as Period[]).map((p) => <option key={p} value={p}>{PERIOD_LABEL[p]}</option>)}
          </select>
        </label>
        <label className="check"><input type="checkbox" checked={withAccess} onChange={(e) => setWithAccess(e.target.checked)} />アクセスも数える</label>
      </div>
      {scope === 'between' && (loadAll
        ? <CompareTeams key={`${period}:${withAccess}`} teams={sorted} period={period} withAccess={withAccess} />
        : <div className="card"><p>全チームのぶんを読み込んで、比べます(読み取りが増えるので、必要なときだけ)。</p><button type="button" onClick={() => setLoadAll(true)}>全チームを読み込んで比べる</button></div>)}
      {scope === 'inside' && !team && <p className="card">チームを選ぶと、メンバーごとの数が出ます。</p>}
      {scope === 'inside' && shown.map((t) => <TeamContribution key={`${t.id}:${period}:${withAccess}`} team={t} period={period} withAccess={withAccess} />)}
      {scope === 'inside' && team && (
        <ul className="hint">
          <li><strong>作業ログ 提出/授業日</strong>: 期間内の授業日のうち、提出した日(欠席の日は数えません)。</li>
          <li><strong>WBSを直接変更</strong>: WBSの画面で、追加・修正・削除・並べ替えをした回数。<strong>作業ログ経由の更新</strong>は、作業ログの提出でWBSが更新された回数。</li>
          <li><strong>完了にした回数</strong>: タスクの状態を「完了」にした回数(変更履歴にあるもの)。<strong>いまの担当</strong>は、いちばん下の階層で、保留を除いた、いまの数。</li>
          <li><strong>アクセス</strong>: アプリを開いた日数と、画面の表示回数。<strong>ありがとう</strong>は、送った数/もらった数。<strong>約束</strong>は、ミーティングで担当になった約束。</li>
          <li>変更履歴は、記録が始まった日(10/24)より前の変更は残っていません。まとめて追加・移動した操作は、1件として数えます。</li>
        </ul>
      )}
    </>
  );
}
