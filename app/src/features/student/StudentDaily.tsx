import { useProfile } from '../../auth/AuthProvider';
import { DailyFeed } from '../../components/DailyViews';
import { DailyForm } from './DailyForm';
import { useClassDays } from '../../data/calendar';
import { useMyDailies, useSettings, useTeamDailies } from '../../data/daily';
import { useTasks } from '../../data/tasks';
import { useTeam } from '../../data/teams';
import { celebrate } from '../../lib/celebrate';
import { say } from '../../lib/tone';
import { streakIfSubmitted } from '../../lib/engagement';
import { dailyId } from '../../lib/daily';
import { dailyWindowFrom, formatDate, jstDate } from '../../lib/dates';
import { sinceOf } from '../../lib/dailyDraft';
import { nudgeOf } from '../../lib/dailyNudge';
import { DailyNudge } from '../../components/DailyNudge';


export function StudentDaily() {
  const me = useProfile();
  const team = useTeam(me.teamId);
  const today = jstDate();
  const from = dailyWindowFrom(today);
  const settings = useSettings();
  const classDays = useClassDays();
  const { data: tasks } = useTasks(me.teamId);
  const peer = settings?.peerDailyView ?? false;
  const mine = useMyDailies(peer ? null : me.teamId, me.sid, from);
  const all = useTeamDailies(peer ? me.teamId : null, from);
  const dailies = peer ? all.data : mine.data;

  if (!me.teamId || !me.sid) return <p>チームが設定されていません。先生に連絡してください。</p>;
  if (team === undefined || !tasks || !dailies || !classDays || !settings) return <p>読み込み中…</p>;
  if (team === null || team.status === 'planning') return <p className="card">企画検討中です。キックオフ後に作業ログを書けるようになります。</p>;

  const isClassDay = classDays.some((d) => d.date === today);
  const started = today >= settings.dailyStartDate;
  const mineToday = dailies.find((d) => d.id === dailyId(today, me.sid!));
  const { since, prevDate } = sinceOf(dailies, me.sid, today);
  return (
    <>
      <h2>作業ログ</h2>
      <p className="hint">{formatDate(today)}の授業の作業ログです。提出した日のうちは、何度でも直せます。</p>
      <DailyNudge nudge={nudgeOf(dailies, me.sid, today, classDays, settings.dailyStartDate, from)} isClassDay={isClassDay} link={false} />
      {!started && <p className="hint">作業ログは {formatDate(settings.dailyStartDate)} から始まります。それまでは、試しに書けます。</p>}
      {started && !isClassDay && <p className="hint">今日は授業日ではありません。書きたいときだけ書いてください。</p>}
      <div className="home-grid">
        <div className="col">
      {mineToday?.absent
        ? <p className="card">今日は「欠席」として記録されています。</p>
        : <DailyForm key="form" teamId={me.teamId} sid={me.sid} today={today} prev={mineToday} tasks={tasks} since={since} prevDate={prevDate} onSubmitted={(first) => {
            if (!first) return;
            const n = streakIfSubmitted(dailies, me.sid!, classDays, settings.dailyStartDate, from, today);
            celebrate(say.dailySubmitted(n));
          }} />}

        </div>
        <div className="col">
      <h3>{peer ? 'チームの作業ログ' : '自分の作業ログ'}</h3>
      <DailyFeed
        dailies={dailies.filter((d) => d.date <= today)}
        members={team.members}
        tasks={tasks}
        emptyText="まだ作業ログがありません。"
      />
        </div>
      </div>
    </>
  );
}
