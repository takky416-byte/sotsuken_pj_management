import { useProfile } from '../../auth/AuthProvider';
import { DailyFeed } from '../../components/DailyViews';
import { DailyForm } from './DailyForm';
import { useClassDays } from '../../data/calendar';
import { useMyDailies, useSettings, useTeamDailies } from '../../data/daily';
import { useTasks } from '../../data/tasks';
import { useTeam } from '../../data/teams';
import { celebrate } from '../../lib/celebrate';
import { streakIfSubmitted } from '../../lib/engagement';
import { dailyId } from '../../lib/daily';
import { dailyWindowFrom, formatDate, jstDate } from '../../lib/dates';


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
  if (team === null || team.status === 'planning') return <p className="card">企画検討中です。キックオフ後に日報を書けるようになります。</p>;

  const isClassDay = classDays.some((d) => d.date === today);
  const started = today >= settings.dailyStartDate;
  const mineToday = dailies.find((d) => d.id === dailyId(today, me.sid!));
  return (
    <>
      <h2>日報</h2>
      <p className="hint">
        今日({formatDate(today)})の分を書きます。やったタスクの結果を押して、<strong>何を・どこまでやったか</strong>を、しっかり書いてください。提出した日のうちは、何度でも直せます。
      </p>
      {!started && <p className="card">日報は {formatDate(settings.dailyStartDate)} から始まります。それまでは、試しに書いてみるだけで、未提出にはなりません。</p>}
      {started && !isClassDay && <p className="card">今日は授業日ではありません。書きたいときだけ書いてください(未提出にはなりません)。</p>}
      <div className="home-grid">
        <div className="col">
      {mineToday?.absent
        ? <p className="card">今日は「欠席」として記録されています。</p>
        : <DailyForm key="form" teamId={me.teamId} sid={me.sid} today={today} prev={mineToday} tasks={tasks} onSubmitted={(first) => {
            if (!first) return;
            const n = streakIfSubmitted(dailies, me.sid!, classDays, settings.dailyStartDate, from, today);
            celebrate(n >= 2 ? `提出しました! ${n}日連続` : '提出しました! おつかれさま');
          }} />}

        </div>
        <div className="col">
      <h3>{peer ? 'チームの日報' : '自分の日報'}</h3>
      <DailyFeed
        dailies={dailies.filter((d) => d.date <= today)}
        members={team.members}
        tasks={tasks}
        emptyText="まだ日報がありません。"
      />
        </div>
      </div>
    </>
  );
}
