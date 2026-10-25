import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useProfile } from '../../auth/AuthProvider';
import { useBase } from '../../components/Base';
import { BookmarkPrompt } from '../../components/BookmarkPrompt';
import { TeamBoard } from '../../components/TeamBoard';
import { Em } from '../../components/Em';
import { say } from '../../lib/tone';
import { DailyNudge } from '../../components/DailyNudge';
import { nudgeOf } from '../../lib/dailyNudge';
import { DailyMissions, WeeklyMissions } from '../../components/Missions';
import { ThanksCard } from '../../components/ThanksCard';
import { useThanks } from '../../data/thanks';
import { Progress } from '../../components/Progress';
import { useClassDays, useMilestones } from '../../data/calendar';
import { useMyDailies, useSettings } from '../../data/daily';
import { saveMeeting, useMeetings } from '../../data/meetings';
import { updateTaskArray, useTasks } from '../../data/tasks';
import { useTeam } from '../../data/teams';
import { isHttpUrl } from '../../data/util';
import { celebrate } from '../../lib/celebrate';
import { dailyId } from '../../lib/daily';
import { dailyWindowFrom, formatDate, jstDate, untilLabel } from '../../lib/dates';
import { dailyMissions, weeklyMissions } from '../../lib/missions';
import {
  dayInfo, doToday, lastNextPlan, myPromises, periodsLabel, unassigned, upcoming, type PlanItem,
} from '../../lib/todayPlan';
import { overallProgress, periodLabel } from '../../lib/wbs';
import type { Task } from '../../types';

const WEEK = ['日', '月', '火', '水', '木', '金', '土'];
const REASON: Record<PlanItem['reason'], string> = { overdue: '期限を過ぎています', doing: '進行中', period: '今が予定の期間' };

/** 学生のホーム: 開いたら、今日何をやるか・次に何をやるかが分かる画面。 */
export function StudentHome() {
  const me = useProfile();
  const base = useBase();
  const team = useTeam(me.teamId);
  const today = jstDate();
  const milestones = useMilestones(me.teamId ?? 'none');
  const { data: tasks, error: e1 } = useTasks(me.teamId);
  const { data: meetings, error: e2 } = useMeetings(me.teamId);
  const { data: mine, error: e3 } = useMyDailies(me.teamId, me.sid, dailyWindowFrom(today));
  const classDays = useClassDays();
  const settings = useSettings();
  const { data: thanks, error: e4 } = useThanks(me.teamId, dailyWindowFrom(today));
  const [err, setErr] = useState('');

  if (!me.teamId || !me.sid) return <p>チームが設定されていません。先生に連絡してください。</p>;
  if (team === undefined) return <p>読み込み中…</p>;
  if (team === null) return <p>チームの情報がまだ登録されていません。</p>;
  if (team.status === 'planning') {
    return (
      <>
        <h2>{team.id}チーム</h2>
        <p className="card">企画検討中です。キックオフをお待ちください。</p>
      </>
    );
  }
  // どれかが読み込めないとき (権限・通信・設定の不備) に、「読み込み中」のまま止まらないよう、理由を出す
  const loadError = e1 ?? e2 ?? e3 ?? e4;
  if (loadError) return <p className="error">読み込めませんでした: {loadError}</p>;
  if (!tasks || !meetings || !mine || !classDays || !settings || !thanks) return <p>読み込み中…</p>;

  const sid = me.sid;
  const run = async (fn: () => Promise<unknown>) => { setErr(''); try { await fn(); } catch (e) { setErr(`できませんでした: ${(e as Error).message}`); } };
  const info = dayInfo(classDays, today, settings.dailyStartDate, mine.find((d) => d.id === dailyId(today, sid)));
  const plan = doToday(tasks, sid, today);
  const soon = upcoming(tasks, sid, today);
  const free = unassigned(tasks, today);
  const promises = myPromises(meetings, sid);
  const lastNext = lastNextPlan(mine);
  const upMs = (milestones ?? []).filter((m) => (m.endDate ?? m.date) >= today).slice(0, 3);
  const d = new Date(`${today}T00:00:00Z`);
  const canEditMeeting = team.teamMeetingInput;

  const takeOver = (t: Task) => run(() => updateTaskArray(team.id, sid, t.id, 'assignees', 'add', sid));
  const donePromise = (meetingId: string, index: number) => run(async () => {
    const m = meetings.find((x) => x.id === meetingId);
    if (!m) return;
    await saveMeeting(team.id, meetingId, sid, { actions: m.actions.map((a, i) => (i === index ? { ...a, done: true } : a)) });
    celebrate(say.promiseKept());
  });

  return (
    <>
      <div className="home-top">
      <section className="hero">
        <div className="hero-text">
          <div className="hero-date">{d.getUTCMonth() + 1}月{d.getUTCDate()}日({WEEK[d.getUTCDay()]})</div>
          <h2 className="hero-hello">こんにちは、{me.name}さん</h2>
          <p className="hero-sub">
            {info.isClassDay ? <>今日は<strong>授業日</strong>です({info.periods ? periodsLabel(info.periods) : ''})。</>
              : info.next ? <>次の授業日は <strong>{formatDate(info.next.date)}</strong> です。</> : '授業日の予定は、まだありません。'}
          </p>
        </div>
        <DailyCta status={info.status} base={base} isClassDay={info.isClassDay} started={info.started} />
      </section>
      <DailyNudge nudge={nudgeOf(mine, sid, today, classDays, settings.dailyStartDate, dailyWindowFrom(today))} isClassDay={info.isClassDay} />
      <BookmarkPrompt email={me.email} />
      </div>
      {err && <p className="error">{err}</p>}

      <div className="home-grid">
        <div className="col">

      <section className="card">
        <h3><Em e="🎯" />今日やること</h3>
        {plan.length === 0 && promises.length === 0 && (
          <p className="hint">今日の担当タスクはありません。{free.length > 0 ? '下の「担当がいないタスク」から、やるものを選べます。' : <>WBS で、次のタスクを決めましょう。</>}</p>
        )}
        <ul className="plain todo-list">
          {plan.map(({ task: t, reason }) => (
            <li key={t.id} className={`todo-item reason-${reason}`}>
              <div className="todo-main">
                <Link to={`${base}/wbs`} className="todo-title">{t.title}</Link>
                <div className="hint">
                  <span className={`reason-badge r-${reason}`}>{REASON[reason]}</span> {periodLabel(t.startDate, t.endDate)}
                </div>
              </div>
              <Link to={`${base}/daily`} className="btn ghost-btn">作業ログに書く</Link>
            </li>
          ))}
          {promises.map((p) => (
            <li key={`${p.meetingId}-${p.index}`} className="todo-item reason-promise">
              <div className="todo-main">
                <span className="todo-title">{p.action.text}</span>
                <div className="hint"><span className="reason-badge r-promise">ミーティングの約束</span> {formatDate(p.meetingId)}</div>
              </div>
              {canEditMeeting && <button type="button" className="ghost" onClick={() => donePromise(p.meetingId, p.index)}>できた</button>}
            </li>
          ))}
        </ul>
        <p className="hint">着手・完了は、作業ログで「進んだ・完了した」を選んで知らせます。授業時間外の作業も、次の授業の作業ログにまとめて書きます。</p>
      </section>

      <section className="card">
        <h3><Em e="➡️" />次にやること</h3>
        {lastNext && (
          <blockquote className="next-quote">
            <div className="hint">前回の作業ログで決めたこと({formatDate(lastNext.date)})</div>
            {lastNext.text}
          </blockquote>
        )}
        {soon.length > 0 && (
          <>
            <div className="label">これから始まる、あなたのタスク</div>
            <ul className="plain">
              {soon.map((t) => <li key={t.id} className="soon-item"><strong>{t.title}</strong> <span className="hint">{periodLabel(t.startDate, t.endDate)}</span></li>)}
            </ul>
          </>
        )}
        {free.length > 0 && (
          <>
            <div className="label">担当がいないタスク(やるものを選べます)</div>
            <ul className="plain todo-list">
              {free.map((t) => (
                <li key={t.id} className="todo-item">
                  <div className="todo-main"><span className="todo-title">{t.title}</span><div className="hint">{periodLabel(t.startDate, t.endDate)}</div></div>
                  <button type="button" className="ghost" onClick={() => takeOver(t)}>担当する</button>
                </li>
              ))}
            </ul>
          </>
        )}
        {!lastNext && soon.length === 0 && free.length === 0 && <p className="hint">次にやることは、作業ログの「つぎにやること」に書くと、ここに出ます。</p>}
      </section>

        </div>
        <div className="col">
      <DailyMissions sid={sid} today={today} daily={dailyMissions(tasks, sid, today, { dailySubmitted: info.status === 'submitted', isClassDay: info.isClassDay, thankedToday: thanks.some((t) => t.from === sid && t.date === today) })} />

      <WeeklyMissions weekly={weeklyMissions(tasks, team.members, today, thanks)} />

      <ThanksCard teamId={team.id} sid={sid} members={team.members} tasks={tasks} thanks={thanks} today={today} />

      <section className="card plan-card">
        <h3><Em e="🗓" />マイルストーンと企画</h3>
        {upMs.length === 0 && <p className="hint">マイルストーンは、まだありません。</p>}
        <ul className="plain">
          {upMs.map((m) => (
            <li key={m.id} className="ms-item"><span className="ms-until">{untilLabel(today, m.date, m.endDate)}</span> <strong>{formatDate(m.date)}{m.endDate && m.endDate !== m.date ? `〜${formatDate(m.endDate)}` : ''}</strong> {m.title}{m.teamId && <span className="badge">チーム</span>}</li>
          ))}
        </ul>
        <div className="plan-project">
          <div><span className="label">企画</span> <strong>{team.projectName}</strong></div>
          <div className="hint">{team.members.map((m) => m.name).join('・') || '—'}</div>
          <div className="row">
            <Link to={`${base}/wbs`} className="btn ghost-btn">WBSを開く</Link>
            {team.driveUrl && isHttpUrl(team.driveUrl) && (
              <a className="btn ghost-btn" href={team.driveUrl} target="_blank" rel="noreferrer noopener">共有フォルダ</a>
            )}
            <Progress {...overallProgress(tasks)} />
          </div>
        </div>
      </section>
        </div>
      </div>

      <section className="home-team">
        <h3><Em e="👥" />チームのようす</h3>
        <TeamBoard team={team} viewer={sid} />
      </section>
    </>
  );
}

function DailyCta({ status, base, isClassDay, started }: { status: 'submitted' | 'missing' | 'absent' | 'free'; base: string; isClassDay: boolean; started: boolean }) {
  if (status === 'absent') return <div className="cta cta-done">今日は「欠席」として記録されています。</div>;
  if (status === 'submitted') {
    return (
      <div className="cta cta-done">
        <span><Em e="✅" />今日の作業ログは提出済みです</span>
        <Link to={`${base}/daily`} className="btn ghost-btn">見直す・直す</Link>
      </div>
    );
  }
  return (
    <div className={`cta ${status === 'missing' ? 'cta-todo' : ''}`}>
      <span>{status === 'missing' ? '今日の作業ログが、まだ出ていません' : !started ? '作業ログは、運用開始日から始まります(それまでは、試しに書けます)' : isClassDay ? '' : '作業ログは、授業日に書きます(書きたいときは、いつでも)'}</span>
      <Link to={`${base}/daily`} className="btn big-btn">作業ログを書く</Link>
    </div>
  );
}
