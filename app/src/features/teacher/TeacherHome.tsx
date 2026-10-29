import { useEffect, useState } from 'react';
import { StackTable } from '../../components/StackTable';
import { Link } from 'react-router-dom';
import { Progress } from '../../components/Progress';
import { useClassDays, useMilestones } from '../../data/calendar';
import { useSettings, useTeamDailies } from '../../data/daily';
import { useMeetings } from '../../data/meetings';
import { isHttpUrl } from '../../data/util';
import { rebuildAllDigests, saveDigest, useDigest } from '../../data/digest';
import { useTasks } from '../../data/tasks';
import { updateTeam, useTeams } from '../../data/teams';
import { dailyWindowFrom, formatDate, jstDate } from '../../lib/dates';
import { teamFlags } from '../../lib/flags';
import { digestOverdue } from '../../lib/digest';
import type { ClassDay, Milestone, Team } from '../../types';


function TeamRow({ team, milestones, classDays, dailyStart, onSeverity }: { team: Team; milestones: Milestone[]; classDays: ClassDay[]; dailyStart: string; onSeverity: (id: string, n: number) => void }) {
  const today = jstDate();
  // タスク全件の代わりに、チームごとの「集計メモ」(1件) を読む。メモがまだないチームだけ、タスクから作って書く (最初の1回)
  const { data: digestDocs } = useDigest(team.id);
  const digest = digestDocs?.[0] ?? null;
  const missingDigest = digestDocs !== null && !digest;
  const { data: tasksForDigest } = useTasks(missingDigest ? team.id : null);
  useEffect(() => { if (missingDigest && tasksForDigest && tasksForDigest.length > 0) void saveDigest(team.id, tasksForDigest); }, [missingDigest, tasksForDigest, team.id]);
  const ready = !!digest || (missingDigest && !!tasksForDigest && tasksForDigest.length === 0);
  const { data: dailies } = useTeamDailies(team.id, dailyWindowFrom(today));
  const { data: meetings } = useMeetings(team.id);
  const lastMeeting = (meetings ?? []).map((m) => m.date).sort().at(-1);
  const next = milestones.find((m) => (m.endDate ?? m.date) >= today && (m.teamId === null || m.teamId === team.id));
  const over = digest ? digestOverdue(digest, today) : { overdue: 0, unassigned: 0 };
  const flags = ready && dailies ? teamFlags(team, over.unassigned, dailies, classDays, today, dailyStart) : null;
  const delayed = over.overdue;
  const active = team.status === 'active';
  // 要確認の多さ (一覧を、要確認の多い順に並べるために、親へ知らせる)
  const severity = flags ? flags.missing.length * 2 + flags.unassignedOverdue : 0;
  useEffect(() => { onSeverity(team.id, severity); }, [team.id, severity, onSeverity]);
  return (
    <tr>
      <td><Link to={`/teacher/team/${team.id}`}><strong>{team.id}</strong></Link>{active && <div><Link to={`/teacher/report/${team.id}`} className="hint">PJ分析</Link></div>}</td>
      <td>{team.members.map((m) => m.name).join('・') || '—'}</td>
      <td>
        {active ? team.projectName : <span className="hint">企画検討中</span>}
        {active && ready && !team.wbsReview && <div className="warn">初期WBSの見直し: 未</div>}
        {active && <div className="hint">提出先: {team.submitUrl ? '設定済み' : <span className="warn">未設定</span>}</div>}
      </td>
      <td>
        {ready ? <Progress done={digest?.done ?? 0} total={digest?.total ?? 0} /> : '…'}
        {delayed > 0 && <div className="warn">期限超過 {delayed}件</div>}
      </td>
      <td>
        {!active || !flags ? '—' : flags.latestDay
          ? (
            <>
              {flags.submitted}/{flags.total}<span className="hint"> ({formatDate(flags.latestDay)})</span>
              {flags.latestMissing.length > 0 && <div className="warn latest-missing">未提出: {flags.latestMissing.join('・')}</div>}
            </>
          )
          : '—'}
      </td>
      <td>
        {flags && (flags.missing.length > 0 || flags.unassignedOverdue > 0) ? (
          <span className="warn">
            {flags.missing.length > 0 && `作業ログが続けて未提出: ${flags.missing.join('・')}`}
            {flags.missing.length > 0 && flags.unassignedOverdue > 0 && ' ／ '}
            {flags.unassignedOverdue > 0 && `担当なしの期限超過 ${flags.unassignedOverdue}件`}
          </span>
        ) : '—'}
      </td>
      <td>
        <div>前回: {lastMeeting ? formatDate(lastMeeting) : '—'}</div>
        <div className="hint">次: {next ? `${formatDate(next.date)} ${next.title}` : '—'}</div>
      </td>
    </tr>
  );
}

export function TeacherHome() {
  const { data: teams, error } = useTeams();
  const milestones = useMilestones('all');
  const classDays = useClassDays();
  const settings = useSettings();
  const [severity, setSeverity] = useState<Record<string, number>>({});
  const [flagFirst, setFlagFirst] = useState(true);
  const [rebuilding, setRebuilding] = useState(false);
  const [rebuildErr, setRebuildErr] = useState('');
  const onSeverity = (id: string, n: number) => setSeverity((s) => (s[id] === n ? s : { ...s, [id]: n }));
  if (error) return <p className="error">読み込めませんでした: {error}</p>;
  if (!teams || !milestones || !classDays || !settings) return <p>読み込み中…</p>;
  const sorted = [...teams].sort((a, b) => (flagFirst ? (severity[b.id] ?? 0) - (severity[a.id] ?? 0) : 0) || a.id.localeCompare(b.id));
  return (
    <>
      <h2>チーム一覧</h2>
      <div className="row">
        <label className="check"><input type="checkbox" checked={flagFirst} onChange={(e) => setFlagFirst(e.target.checked)} />要確認のチームを上に並べる</label>
        <button type="button" className="ghost" disabled={rebuilding} title="全チームのタスクを読み直して、WBS進捗・期限超過の数を作り直します(読み取りが約500回増えます)"
          onClick={() => { setRebuilding(true); rebuildAllDigests(teams.map((t) => t.id)).catch((e) => setRebuildErr((e as Error).message)).finally(() => setRebuilding(false)); }}>
          {rebuilding ? '更新中…' : '最新にする'}
        </button>
        {rebuildErr && <span className="error">{rebuildErr}</span>}
      </div>
      <div className="table-wrap">
        <StackTable>
          <thead>
            <tr>
              <th>チーム</th><th>メンバー</th><th>企画</th><th>WBS進捗</th>
              <th>作業ログ(直近の授業日)</th><th>要確認</th><th>ミーティング(前回・次の予定)</th>
            </tr>
          </thead>
          <tbody>{sorted.map((t) => <TeamRow key={t.id} team={t} milestones={milestones} classDays={classDays} dailyStart={settings.dailyStartDate} onSeverity={onSeverity} />)}</tbody>
        </StackTable>
      </div>
      <SubmitList teams={sorted} />
      <Broadcast teams={sorted} />
      <p className="hint">
        WBS進捗・期限超過は、タスクを変えるたびに更新される集計から出しています(ダッシュボードを開く読み取りを減らすため)。数が合わないと感じたら、「最新にする」を押してください。
        「要確認」は目安です。授業日に2回続けて作業ログが未提出(欠席は除く)、担当者がいなくて期限を過ぎたタスク、を表示します。
        評価や単位認定には使いません。
      </p>
    </>
  );
}

/** 全チームの、成果物の提出先 (Google ドライブ) を、一覧で確かめる */
function SubmitList({ teams }: { teams: Team[] }) {
  const set = teams.filter((t) => t.submitUrl).length;
  return (
    <details className="card submit-list">
      <summary><strong>成果物の提出先の一覧</strong> <span className="hint">({set}/{teams.length}チームが設定済み)</span></summary>
      <ul className="plain">
        {teams.map((t) => (
          <li key={t.id}>
            <strong>{t.id}チーム</strong>{' '}
            {t.submitUrl && isHttpUrl(t.submitUrl)
              ? <a href={t.submitUrl} target="_blank" rel="noreferrer noopener">{t.submitUrl}</a>
              : <span className="warn">未設定</span>}
          </li>
        ))}
      </ul>
      <p className="hint">設定は、各チームの詳細(チームへのお知らせ)でします。</p>
    </details>
  );
}

const MESSAGE_MAX = 200;

/** 全チーム(または選んだチーム)に、同じメッセージを一度に送る。学生のホームに出る。 */
function Broadcast({ teams }: { teams: Team[] }) {
  const [text, setText] = useState('');
  const [picked, setPicked] = useState<Set<string>>(() => new Set(teams.filter((t) => t.status === 'active').map((t) => t.id)));
  const [done, setDone] = useState('');
  const [err, setErr] = useState('');
  const toggle = (id: string) => setPicked((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const send = async () => {
    setErr(''); setDone('');
    const ids = teams.filter((t) => picked.has(t.id)).map((t) => t.id);
    try {
      const message = text.trim() ? { text: text.trim().slice(0, MESSAGE_MAX), at: Date.now() } : null;
      await Promise.all(ids.map((id) => updateTeam(id, { message })));
      setDone(message ? `${ids.length}チームに送りました` : `${ids.length}チームのメッセージを消しました`);
    } catch (e) { setErr(`送れませんでした: ${(e as Error).message}`); }
  };
  return (
    <details className="card broadcast">
      <summary><strong>全チームにメッセージを送る</strong></summary>
      <p className="hint">学生のホームの上に出ます。送り直すと入れ替わります。空のまま送ると、メッセージが消えます。1チームだけに送るときは、チームの詳細から。</p>
      <textarea rows={2} maxLength={MESSAGE_MAX} value={text} aria-label="全チームへのメッセージ" placeholder="例: 来週は中間確認をします。WBSの期間を入れておいてください。" onChange={(e) => { setText(e.target.value); setDone(''); }} />
      <div className="row broadcast-teams" role="group" aria-label="送るチーム">
        {teams.map((t) => <label key={t.id} className="check"><input type="checkbox" checked={picked.has(t.id)} onChange={() => toggle(t.id)} />{t.id}</label>)}
      </div>
      <div className="row">
        <button type="button" disabled={picked.size === 0} onClick={send}>{picked.size}チームに送る</button>
        {done && <span className="hint" role="status">{done}</span>}
      </div>
      {err && <p className="error">{err}</p>}
    </details>
  );
}
