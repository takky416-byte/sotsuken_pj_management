import { useMemo, useState } from 'react';
import { DailyFeed } from '../../components/DailyViews';
import { useTeamDailies } from '../../data/daily';
import { useTasks } from '../../data/tasks';
import { useTeams } from '../../data/teams';
import { statusOf } from '../../lib/daily';
import { dailyWindowFrom, jstDate } from '../../lib/dates';
import { filterDailies } from '../../lib/logFilter';
import type { Team } from '../../types';

type View = 'team' | 'person';
type Filter = { view: View; sid: string; from: string; to: string; q: string };

/** チームの作業ログ (自分のチームの分だけ読む)。チームごと・個人ごとの見方で出す。 */
function TeamLogs({ team, f }: { team: Team; f: Filter }) {
  const { data: dailies, error } = useTeamDailies(team.id, f.from);
  const { data: tasks } = useTasks(team.id);
  const titles = useMemo(() => new Map((tasks ?? []).map((t) => [t.id, t.title])), [tasks]);
  if (error) return <p className="error">{error}</p>;
  if (!dailies || !tasks) return <p className="hint">{team.id}チーム: 読み込み中…</p>;
  const titleOf = (id: string) => titles.get(id) ?? '';
  const mine = filterDailies(dailies, titleOf, { sid: f.sid, from: f.from, to: f.to, q: f.q }).filter((d) => statusOf(d) === 'submitted');
  const members = f.view === 'person' ? team.members.filter((m) => !f.sid || m.sid === f.sid) : [];
  return (
    <section className="card log-section">
      <h3>{team.id}チーム{team.projectName ? <span className="hint">　{team.projectName}</span> : null} <span className="pill">{mine.length}件</span></h3>
      {f.view === 'team' ? (
        <DailyFeed dailies={mine} members={team.members} tasks={tasks} emptyText="条件に合う作業ログはありません。" />
      ) : (
        members.map((m) => {
          const own = mine.filter((d) => d.sid === m.sid);
          return (
            <div key={m.sid} className="log-person">
              <h4>{m.name} <span className="pill">{own.length}件</span></h4>
              <DailyFeed dailies={own} members={team.members} tasks={tasks} emptyText="条件に合う作業ログはありません。" />
            </div>
          );
        })
      )}
    </section>
  );
}

/** 教員の「作業ログ」一覧。チームごと・個人ごとに、日付・文字で絞り込んで見る。 */
export function DailyLogsPage() {
  const today = jstDate();
  const { data: teams } = useTeams();
  const [f, setF] = useState<Filter>({ view: 'team', sid: '', from: dailyWindowFrom(today), to: '', q: '' });
  const [team, setTeam] = useState('');
  if (!teams) return <p>読み込み中…</p>;
  const sorted = [...teams].filter((t) => t.members.length > 0).sort((a, b) => a.id.localeCompare(b.id));
  const shown = team ? sorted.filter((t) => t.id === team) : sorted;
  const members = sorted.find((t) => t.id === team)?.members ?? [];
  const set = (c: Partial<Filter>) => setF((x) => ({ ...x, ...c }));
  return (
    <>
      <h3>作業ログ</h3>
      <p className="hint">学生の作業ログを、チームごと・個人ごとに見られます。チームを選ぶと、そのチームだけを読み込みます(「すべて」は、全チームを読み込むので、必要なときだけにしてください)。</p>
      <div className="seg view-switch" role="group" aria-label="見方">
        <button type="button" className={`seg-btn ${f.view === 'team' ? 'on' : ''}`} aria-pressed={f.view === 'team'} onClick={() => set({ view: 'team' })}>チームごと</button>
        <button type="button" className={`seg-btn ${f.view === 'person' ? 'on' : ''}`} aria-pressed={f.view === 'person'} onClick={() => set({ view: 'person' })}>個人ごと</button>
      </div>
      <div className="row log-filters">
        <label>チーム
          <select aria-label="チーム" value={team} onChange={(e) => { setTeam(e.target.value); set({ sid: '' }); }}>
            <option value="">すべて</option>
            {sorted.map((t) => <option key={t.id} value={t.id}>{t.id}チーム</option>)}
          </select>
        </label>
        <label>個人
          <select aria-label="個人" value={f.sid} disabled={!team} onChange={(e) => set({ sid: e.target.value })}>
            <option value="">{team ? '全員' : '(チームを選ぶと選べます)'}</option>
            {members.map((m) => <option key={m.sid} value={m.sid}>{m.name}</option>)}
          </select>
        </label>
        <label>いつから<input type="date" aria-label="いつから" value={f.from} onChange={(e) => set({ from: e.target.value || dailyWindowFrom(today) })} /></label>
        <label>いつまで<input type="date" aria-label="いつまで" value={f.to} onChange={(e) => set({ to: e.target.value })} /></label>
        <label className="grow">文字で絞り込む<input type="search" aria-label="文字で絞り込む" placeholder="説明・次にやること・タスク名(空白で区切ると、すべてを含むもの)" value={f.q} onChange={(e) => set({ q: e.target.value })} /></label>
      </div>
      {shown.length === 0 && <p className="card">学生が登録されているチームがありません。</p>}
      {shown.map((t) => <TeamLogs key={t.id} team={t} f={f} />)}
    </>
  );
}
