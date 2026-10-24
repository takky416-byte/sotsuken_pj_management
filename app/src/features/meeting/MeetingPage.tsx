import { useEffect, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { useProfile } from '../../auth/AuthProvider';
import { useBase } from '../../components/Base';
import { Em } from '../../components/Em';
import { AnalysisView } from '../../components/AnalysisView';
import { FactsTable } from '../../components/FactsTable';
import { IdleHelper } from '../../components/IdleHelper';
import { MeetingStepper } from '../../components/MeetingStepper';
import { memberFacts } from '../../lib/facts';
import { DailyMatrix } from '../../components/DailyViews';
import { Progress } from '../../components/Progress';
import { useClassDays, useMilestones } from '../../data/calendar';
import { useMyDailies, useSettings, useTeamDailies } from '../../data/daily';
import {
  addComment, openMeeting, saveMeeting, useComments, useMeetings,
} from '../../data/meetings';
import { useTasks } from '../../data/tasks';
import { useThanks } from '../../data/thanks';
import { weekStart } from '../../lib/missions';
import { useTeam } from '../../data/teams';
import { analyze } from '../../lib/analysis';
import { classDatesBetween, fromDailyStart } from '../../lib/daily';
import { addDays, dailyWindowFrom, formatDate, jstDate } from '../../lib/dates';
import {
  carryOver, meetingOrder, neighborTeam, previousMeeting, type Meeting, type MeetingAction,
} from '../../lib/meeting';
import {
  delayedTasks, stuckItems, touchedByMember, unassignedTasks, untouchedTasks,
} from '../../lib/meetingView';
import { overallProgress } from '../../lib/wbs';
import type { Team } from '../../types';


/** /meeting → 教員は今日の順番の先頭のチーム、学生は自分のチームへ */
export function MeetingIndex() {
  const me = useProfile();
  const base = useBase();
  const classDays = useClassDays();
  const settings = useSettings();
  if (me.role === 'student') return <Navigate to={`${base}/meeting/${me.teamId ?? 'A'}`} replace />;
  if (!classDays || !settings) return <p>読み込み中…</p>;
  return <Navigate to={`/meeting/${meetingOrder(classDays, jstDate(), settings.rotateOrder)[0]}`} replace />;
}

export function MeetingPage() {
  const { teamId = '' } = useParams();
  const me = useProfile();
  const base = useBase();
  const team = useTeam(teamId);
  // 学生は自分のチームだけ
  if (me.role === 'student' && me.teamId !== teamId) return <Navigate to={`${base}/meeting/${me.teamId ?? 'A'}`} replace />;
  if (team === undefined) return <p>読み込み中…</p>;
  if (team === null) return <p>チームが見つかりません。</p>;
  return <MeetingScreen key={team.id} team={team} />;
}

/**
 * 学生と同じディスプレイに映す画面。学生に見せてよいデータだけを読み込む。
 * 教員専用のデータ (teacherNotes など) は、この画面では一切購読しない。
 */
function MeetingScreen({ team }: { team: Team }) {
  const me = useProfile();
  const base = useBase();
  const teacher = me.role === 'teacher';
  const today = jstDate();
  const settings = useSettings();
  const classDays = useClassDays();
  const { data: tasks } = useTasks(team.id);
  const { data: meetings } = useMeetings(team.id);
  const milestones = useMilestones(team.id);
  const { data: comments } = useComments(team.id);
  const { data: thanks } = useThanks(team.id, dailyWindowFrom(today));
  const [step, setStep] = useState(0);
  const [showAll, setShowAll] = useState(false);
  const show = (i: number) => showAll || step === i;

  // 作業ログ: 教員と、設定で閲覧が許可されているときはチーム全員分。それ以外は自分の分だけ。
  const peer = teacher || (settings?.peerDailyView ?? false);
  const from = dailyWindowFrom(today);
  const all = useTeamDailies(peer ? team.id : null, from);
  const mine = useMyDailies(peer ? null : team.id, me.sid, from);
  const dailies = peer ? all.data : mine.data;

  const todayDoc = meetings?.find((m) => m.id === today);
  const isMeetingDay = !!classDays?.some((d) => d.date === today && d.meeting);

  // 教員がミーティング日に開くと、その日の記録を作る (= 確認した記録)
  useEffect(() => {
    if (teacher && meetings && isMeetingDay && !todayDoc && team.status === 'active') {
      openMeeting(team.id, today, 'teacher').catch(() => undefined);
    }
  }, [teacher, meetings, isMeetingDay, todayDoc, team.id, team.status, today]);

  if (!settings || !classDays || !tasks || !meetings || !milestones || !dailies || !comments || !thanks) return <p>読み込み中…</p>;

  const canEdit = teacher || team.teamMeetingInput;
  const prev = previousMeeting(meetings, today);
  const since = prev ? addDays(prev.date, 1) : addDays(today, -7);
  const dates = classDatesBetween(fromDailyStart(classDays, settings.dailyStartDate), since < from ? from : since, addDays(today, 1));
  const range = dailies.filter((d) => d.date >= since && d.date <= today);
  const members = peer ? team.members : team.members.filter((m) => m.sid === me.sid);
  const order = meetingOrder(classDays, today, settings.rotateOrder);
  const next = neighborTeam(order, team.id, 1);
  const before = neighborTeam(order, team.id, -1);

  const analysis = analyze(tasks, milestones, team.members, today);
  const facts = memberFacts({
    members, tasks, dailies: peer ? dailies : null, meetings, classDays, today, dailyStart: settings.dailyStartDate, windowFrom: from,
    kickoffDate: team.kickoffAt ? jstDate(new Date(team.kickoffAt)) : null,
  });
  const actor = teacher ? 'teacher' : me.sid ?? '';
  const delayed = delayedTasks(tasks, today);
  const unassigned = unassignedTasks(tasks);
  const untouched = untouchedTasks(tasks, dailies, today);
  const upcoming = milestones.filter((m) => (m.endDate ?? m.date) >= today).slice(0, 3);
  const touched = touchedByMember(tasks, range);
  const stuckList = stuckItems(range);
  const nameOf = (sid: string) => team.members.find((m) => m.sid === sid)?.name ?? sid;

  const run = (fn: () => Promise<unknown>) => fn().catch(() => undefined);

  return (
    <div className="meeting">
      <div className="meeting-head">
        <h2>{team.id}チーム {team.status === 'active' ? `「${team.projectName}」` : '(企画検討中)'}</h2>
        <span className="hint">{formatDate(today)}{isMeetingDay ? ' ミーティング' : ''}</span>
        <span className="spacer" />
        {teacher && (
          <div className="switcher">
            {before ? <Link className="btn ghost-btn" to={`/meeting/${before}`}>← {before}</Link> : <span />}
            {order.map((id) => (
              <Link key={id} to={`/meeting/${id}`} className={`chip-link ${id === team.id ? 'on' : ''}`}>{id}</Link>
            ))}
            {next ? <Link className="btn" to={`/meeting/${next}`}>{next} →</Link> : <span />}
          </div>
        )}
      </div>

      <MeetingStepper step={step} onStep={setStep} all={showAll} onAll={setShowAll} />

      <div className="meeting-grid">
        {show(0) && (<>
        <section className="card">
          <h3>前回のアクション{prev && <span className="hint">({formatDate(prev.date)})</span>}</h3>
          {!prev || prev.actions.length === 0
            ? <p className="hint">前回の記録はありません。</p>
            : (
              <ul className="plain">
                {prev.actions.map((a, i) => (
                  <li key={i}>
                    <label className="check">
                      <input
                        type="checkbox" checked={a.done} disabled={!canEdit}
                        onChange={() => run(() => saveMeeting(team.id, prev.id, teacher ? 'teacher' : me.sid ?? '', {
                          actions: prev.actions.map((x, j) => (j === i ? { ...x, done: !x.done } : x)),
                        }))}
                      />
                      {a.owner && <span className="badge">{nameOf(a.owner)}</span>}
                      <span className={a.done ? 'done-text' : ''}>{a.text}</span>
                    </label>
                  </li>
                ))}
              </ul>
            )}
          {prev?.decided && <p className="note">前回決めたこと: {prev.decided}</p>}
        </section>

        </>)}
        {show(1) && (<>
        <section className="card analysis-card">
          <h3>事実の確認 <span className="hint">(記録されたデータ)</span></h3>
          <FactsTable facts={facts} today={today} />
        </section>

        <section className="card">
          <h3>今週の活動<span className="hint">(○提出 ×未提出 欠 欠席)</span></h3>
          <DailyMatrix members={members} dates={dates} dailies={dailies} />
          <ul className="plain touched">
            {members.map((m) => (
              <li key={m.sid}><strong>{m.name}</strong>
                {'  '}{(touched.get(m.sid) ?? []).join('、') || <span className="hint">作業ログでタスクに触れていません</span>}
              </li>
            ))}
          </ul>
        </section>

        <section className="card">
          <h3>WBSの進み具合</h3>
          <div className="row">
            <Progress {...overallProgress(tasks)} />
            <span className="hint">{overallProgress(tasks).done}/{overallProgress(tasks).total} 完了</span>
          </div>
          <TaskList label="期限を過ぎている" tasks={delayed} warn />
          <TaskList label="作業ログで触れられていない(進行中・予定期間内)" tasks={untouched} />
          <TaskList label="担当がいない" tasks={unassigned} />
          <div className="label">これからの予定</div>
          <ul className="plain">
            {upcoming.map((m) => <li key={m.id}><strong>{formatDate(m.date)}</strong> {m.title}{m.teamId && <span className="badge">チーム</span>}</li>)}
            {upcoming.length === 0 && <li className="hint">予定はありません</li>}
          </ul>
        </section>

        <section className="card analysis-card">
          <h3><Em e="📊" />プロジェクト分析{me.role === 'student' && <Link to={`${base}/report`} className="hint"> 報告書を開く</Link>}</h3>
          <AnalysisView a={analysis} />
        </section>

        </>)}
        {show(2) && (<>
        <section className="card">
          <h3>詰まっていること</h3>
          <p className="hint">チームで相談して、解決しましょう。</p>
          {stuckList.length === 0 ? <p className="hint">「詰まった」の作業ログはありません。</p> : (
            <ul className="plain">
              {stuckList.map((c, i) => (
                <li key={i} className="blocker">
                  <strong>{nameOf(c.sid)}</strong> <span className="hint">{formatDate(c.date)}</span>
                  {c.taskId && <> 「{tasks.find((t) => t.id === c.taskId)?.title ?? '(削除されたタスク)'}」</>}<br />{c.text}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card">
          <h3>手待ちの人と、タスクの振り分け</h3>
          <IdleHelper teamId={team.id} actor={actor} tasks={tasks} members={members} today={today} canEdit />
        </section>
        </>)}
      </div>

      {show(3) && (<>
      <section className="card record">
        <h3>今日決めること {todayDoc && <span className="hint">(記録済み)</span>}</h3>
        {team.status !== 'active' ? <p className="hint">キックオフ後に記録できます。</p> : (
          <RecordForm
            key={todayDoc?.id ?? 'none'} doc={todayDoc} canEdit={canEdit} members={team.members} prevActions={prev?.actions ?? []}
            onSave={(data) => run(() => saveMeeting(team.id, today, teacher ? 'teacher' : me.sid ?? '', data))}
          />
        )}
      </section>

      {(() => {
        const week = thanks.filter((t) => t.date >= weekStart(today));
        return (
          <section className="card">
            <h3><Em e="🙏" />今週のありがとう <span className="hint">({week.length}件)</span></h3>
            {week.length === 0 && <p className="hint">まだありません。助けてもらったことを、ホームから伝えましょう。</p>}
            <ul className="plain">
              {week.slice(0, 8).map((t) => (
                <li key={t.id}>{nameOf(t.from)} → <strong>{nameOf(t.to)}</strong>{t.note && <> 「{t.note}」</>}</li>
              ))}
            </ul>
          </section>
        );
      })()}

      <section className="card">
        <h3>先生からのコメント</h3>
        {[...comments].sort((a, b) => b.createdAt - a.createdAt).slice(0, 8).map((c) => (
          <p key={c.id} className="comment"><span className="hint">{new Date(c.createdAt).toLocaleDateString('ja-JP')}</span> {c.body}</p>
        ))}
        {comments.length === 0 && <p className="hint">コメントはありません。</p>}
        {teacher && <CommentBox onAdd={(body) => run(() => addComment(team.id, body, { type: 'meeting', id: today }))} />}
      </section>
      </>)}
    </div>
  );
}

function TaskList({ label, tasks, warn }: { label: string; tasks: { id: string; title: string; endDate: string | null }[]; warn?: boolean }) {
  if (tasks.length === 0) return null;
  return (
    <div>
      <div className="label">{label} ({tasks.length})</div>
      <ul className={`plain ${warn ? 'warn-list' : ''}`}>
        {tasks.slice(0, 6).map((t) => <li key={t.id}>{t.title}{t.endDate && <span className="hint"> 〜{formatDate(t.endDate)}</span>}</li>)}
        {tasks.length > 6 && <li className="hint">ほか {tasks.length - 6}件</li>}
      </ul>
    </div>
  );
}

function RecordForm({ doc: m, canEdit, members, prevActions, onSave }: {
  doc: Meeting | undefined;
  canEdit: boolean;
  members: Team['members'];
  prevActions: MeetingAction[];
  onSave: (data: Partial<{ decided: string; actions: MeetingAction[]; note: string }>) => void;
}) {
  const [decided, setDecided] = useState(m?.decided ?? '');
  const [actions, setActions] = useState<MeetingAction[]>(m?.actions ?? []);
  const [text, setText] = useState('');
  const [owner, setOwner] = useState('');
  const nameOf = (sid: string) => members.find((x) => x.sid === sid)?.name ?? sid;
  const carry = carryOver(prevActions, actions);
  useEffect(() => { setDecided(m?.decided ?? ''); setActions(m?.actions ?? []); }, [m?.decided, m?.actions]);

  const save = (next: MeetingAction[]) => { setActions(next); onSave({ actions: next }); };
  const add = () => { if (text.trim()) { save([...actions, { text: text.trim(), done: false, owner: owner || null }]); setText(''); } };

  return (
    <div className="form">
      <label>決まったこと
        <textarea rows={3} maxLength={3000} value={decided} disabled={!canEdit} onChange={(e) => setDecided(e.target.value)}
          onBlur={() => decided !== (m?.decided ?? '') && onSave({ decided })} />
      </label>
      <div className="label">次の1週間でやること(次回、結果を確認します)</div>
      <ul className="plain">
        {actions.map((a, i) => (
          <li key={i} className="row">
            <label className="check">
              <input type="checkbox" checked={a.done} disabled={!canEdit}
                onChange={() => save(actions.map((x, j) => (j === i ? { ...x, done: !x.done } : x)))} />
              {a.owner && <span className="badge">{nameOf(a.owner)}</span>}
              <span className={a.done ? 'done-text' : ''}>{a.text}</span>
            </label>
            {canEdit && <button className="ghost icon" aria-label="削除" onClick={() => save(actions.filter((_, j) => j !== i))}>×</button>}
          </li>
        ))}
      </ul>
      {canEdit && (
        <div className="row">
          <select aria-label="担当する人" value={owner} onChange={(e) => setOwner(e.target.value)}>
            <option value="">チーム全体</option>
            {members.map((x) => <option key={x.sid} value={x.sid}>{x.name}</option>)}
          </select>
          <input
            placeholder="やることを入力して Enter" value={text} maxLength={200}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) add(); }}
          />
        </div>
      )}
      {canEdit && carry.length > 0 && (
        <button className="ghost" onClick={() => save([...actions, ...carry])}>前回の未完了 {carry.length}件を引き継ぐ</button>
      )}
      {!canEdit && <p className="hint">記録は先生が入力します。</p>}
    </div>
  );
}

function CommentBox({ onAdd }: { onAdd: (body: string) => void }) {
  const [v, setV] = useState('');
  return (
    <div className="row">
      <input placeholder="学生にも見えるコメント" value={v} maxLength={2000} onChange={(e) => setV(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing && v.trim()) { onAdd(v.trim()); setV(''); } }} />
      <button className="ghost" disabled={!v.trim()} onClick={() => { onAdd(v.trim()); setV(''); }}>送信</button>
    </div>
  );
}
