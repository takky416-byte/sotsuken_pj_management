import { StackTable } from '../../components/StackTable';
import { Link } from 'react-router-dom';
import { Progress } from '../../components/Progress';
import { useClassDays, useMilestones } from '../../data/calendar';
import { useSettings, useTeamDailies } from '../../data/daily';
import { useMeetings } from '../../data/meetings';
import { useTasks } from '../../data/tasks';
import { useTeams } from '../../data/teams';
import { dailyWindowFrom, formatDate, jstDate } from '../../lib/dates';
import { teamFlags } from '../../lib/flags';
import { overallProgress } from '../../lib/wbs';
import type { ClassDay, Milestone, Team } from '../../types';


function TeamRow({ team, milestones, classDays, dailyStart }: { team: Team; milestones: Milestone[]; classDays: ClassDay[]; dailyStart: string }) {
  const today = jstDate();
  const { data: tasks } = useTasks(team.id);
  const { data: dailies } = useTeamDailies(team.id, dailyWindowFrom(today));
  const { data: meetings } = useMeetings(team.id);
  const lastMeeting = (meetings ?? []).map((m) => m.date).sort().at(-1);
  const next = milestones.find((m) => (m.endDate ?? m.date) >= today && (m.teamId === null || m.teamId === team.id));
  const flags = tasks && dailies ? teamFlags(team, tasks, dailies, classDays, today, dailyStart) : null;
  const delayed = (tasks ?? []).filter((t) => !t.deleted && t.status !== 'done' && t.status !== 'hold'
    && t.endDate && t.endDate < today).length;
  const active = team.status === 'active';
  return (
    <tr>
      <td><Link to={`/teacher/team/${team.id}`}><strong>{team.id}</strong></Link></td>
      <td>{team.members.map((m) => m.name).join('・') || '—'}</td>
      <td>{active ? team.projectName : <span className="hint">企画検討中</span>}</td>
      <td>{tasks ? <Progress {...overallProgress(tasks)} /> : '…'}</td>
      <td className={delayed ? 'warn' : ''}>{delayed || '—'}</td>
      <td>
        {!active || !flags ? '—' : flags.latestDay
          ? <>{flags.submitted}/{flags.total}<span className="hint"> ({formatDate(flags.latestDay)})</span></>
          : '—'}
      </td>
      <td>
        {flags && (flags.missing.length > 0 || flags.unassignedOverdue > 0) ? (
          <span className="warn">
            {flags.missing.length > 0 && `作業レポートが続けて未提出: ${flags.missing.join('・')}`}
            {flags.missing.length > 0 && flags.unassignedOverdue > 0 && ' ／ '}
            {flags.unassignedOverdue > 0 && `担当なしの期限超過 ${flags.unassignedOverdue}件`}
          </span>
        ) : '—'}
      </td>
      <td>{lastMeeting ? formatDate(lastMeeting) : '—'}</td>
      <td>{next ? `${formatDate(next.date)} ${next.title}` : '—'}</td>
    </tr>
  );
}

export function TeacherHome() {
  const { data: teams, error } = useTeams();
  const milestones = useMilestones('all');
  const classDays = useClassDays();
  const settings = useSettings();
  if (error) return <p className="error">読み込めませんでした: {error}</p>;
  if (!teams || !milestones || !classDays || !settings) return <p>読み込み中…</p>;
  const sorted = [...teams].sort((a, b) => a.id.localeCompare(b.id));
  return (
    <>
      <h2>チーム一覧</h2>
      <div className="table-wrap">
        <StackTable>
          <thead>
            <tr>
              <th>チーム</th><th>メンバー</th><th>企画</th><th>WBS進捗</th><th>期限超過</th>
              <th>作業レポート(直近の授業日)</th><th>要確認</th><th>前回の確認</th><th>次の予定</th>
            </tr>
          </thead>
          <tbody>{sorted.map((t) => <TeamRow key={t.id} team={t} milestones={milestones} classDays={classDays} dailyStart={settings.dailyStartDate} />)}</tbody>
        </StackTable>
      </div>
      <p className="hint">
        「要確認」は目安です。授業日に2回続けて作業レポートが未提出(欠席は除く)、担当者がいなくて期限を過ぎたタスク、を表示します。
        評価や単位認定には使いません。
      </p>
    </>
  );
}
