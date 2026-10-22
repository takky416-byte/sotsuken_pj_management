import { useEffect, useMemo, useState } from 'react';
import { useProfile } from '../../auth/AuthProvider';
import { DailyFeed } from '../../components/DailyViews';
import { useClassDays } from '../../data/calendar';
import { saveDaily, useMyDailies, useSettings, useTeamDailies } from '../../data/daily';
import { useTasks } from '../../data/tasks';
import { useTeam } from '../../data/teams';
import { FIXED_KINDS, dailyId, entriesMissingNote, statusOf, type Daily, type DailyEntry, type DailyKind } from '../../lib/daily';
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
        今日({formatDate(today)})の分を書きます。できたことを選んで、<strong>選んだ項目ごとに一言</strong>(何をしたか)を添えてください。提出した日のうちは、何度でも直せます。
      </p>
      {!started && <p className="card">日報は {formatDate(settings.dailyStartDate)} から始まります。それまでは、試しに書いてみるだけで、未提出にはなりません。</p>}
      {started && !isClassDay && <p className="card">今日は授業日ではありません。書きたいときだけ書いてください(未提出にはなりません)。</p>}
      {mineToday?.absent
        ? <p className="card">今日は「欠席」として記録されています。</p>
        : <DailyForm key="form" teamId={me.teamId} sid={me.sid} today={today} prev={mineToday} tasks={tasks} />}

      <h3>{peer ? 'チームの日報' : '自分の日報'}</h3>
      <DailyFeed
        dailies={dailies.filter((d) => d.date <= today)}
        members={team.members}
        tasks={tasks}
        emptyText="まだ日報がありません。"
      />
    </>
  );
}

function DailyForm({ teamId, sid, today, prev, tasks }: {
  teamId: string; sid: string; today: string; prev: Daily | undefined; tasks: ReturnType<typeof useTasks>['data'] & object;
}) {
  const live = useMemo(() => tasks.filter((t) => !t.deleted), [tasks]);
  const [taskNotes, setTaskNotes] = useState<Map<string, string>>(
    new Map((prev?.entries ?? []).filter((e) => e.kind === 'task' && e.taskId).map((e) => [e.taskId!, e.note])));
  const [kindNotes, setKindNotes] = useState<Map<DailyKind, string>>(
    new Map((prev?.entries ?? []).filter((e) => e.kind !== 'task').map((e) => [e.kind, e.note])));
  const [blocker, setBlocker] = useState(prev?.blocker ?? '');
  const [extra, setExtra] = useState('');
  const [state, setState] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [err, setErr] = useState('');
  useEffect(() => setState('idle'), [taskNotes, kindNotes, blocker]);

  // 候補: 自分が担当、または進行中のタスク。すでに選んだものも残す。
  const candidates = live.filter((t) =>
    taskNotes.has(t.id) || (t.status !== 'hold' && t.status !== 'done' && (t.assignees.includes(sid) || t.status === 'doing')));
  const others = live.filter((t) => !candidates.some((c) => c.id === t.id));

  const toggleTask = (id: string) => setTaskNotes((m) => { const n = new Map(m); if (n.has(id)) n.delete(id); else n.set(id, ''); return n; });
  const toggleKind = (k: DailyKind) => setKindNotes((m) => { const n = new Map(m); if (n.has(k)) n.delete(k); else n.set(k, ''); return n; });

  const entries: DailyEntry[] = [
    ...[...taskNotes].map(([taskId, note]) => ({ kind: 'task' as const, taskId, note: note.trim() })),
    ...[...kindNotes].map(([kind, note]) => ({ kind, note: note.trim() })),
  ];
  const missing = entriesMissingNote(entries);
  const canSubmit = missing.length === 0 && (entries.length > 0 || blocker.trim() !== '');
  const noteMissing = (note: string | undefined) => (note ?? '').trim() === '';

  const submit = async () => {
    setState('saving'); setErr('');
    try {
      await saveDaily(teamId, sid, today, entries, blocker.trim(), prev);
      setState('saved');
    } catch (e) {
      setState('idle');
      setErr(`提出できませんでした: ${(e as Error).message}`);
    }
  };

  const submitted = statusOf(prev) === 'submitted';
  return (
    <div className="card form">
      <div className="label">今日やったこと(あてはまるものを選んでください)</div>
      {candidates.length === 0 && <p className="hint">選べるタスクがまだありません。下の「調査・勉強」などを選ぶか、WBSにタスクを追加してください。</p>}
      {candidates.map((t) => (
        <div className="pick" key={t.id}>
          <label className={`chip ${taskNotes.has(t.id) ? 'on' : ''}`}>
            <input type="checkbox" checked={taskNotes.has(t.id)} onChange={() => toggleTask(t.id)} />
            {t.title}
          </label>
          {taskNotes.has(t.id) && (
            <input
              className={`note-input ${noteMissing(taskNotes.get(t.id)) ? 'need' : ''}`} placeholder="何をしたか一言(必須)" maxLength={200}
              value={taskNotes.get(t.id)} onChange={(e) => setTaskNotes((m) => new Map(m).set(t.id, e.target.value))}
            />
          )}
        </div>
      ))}
      {others.length > 0 && (
        <select value={extra} onChange={(e) => { if (e.target.value) toggleTask(e.target.value); setExtra(''); }} aria-label="ほかのタスクを選ぶ">
          <option value="">ほかのタスクを選ぶ…</option>
          {others.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
        </select>
      )}
      {FIXED_KINDS.map(({ kind, label }) => (
        <div className="pick" key={kind}>
          <label className={`chip ${kindNotes.has(kind) ? 'on' : ''}`}>
            <input type="checkbox" checked={kindNotes.has(kind)} onChange={() => toggleKind(kind)} />
            {label}
          </label>
          {kindNotes.has(kind) && (
            <input
              className={`note-input ${noteMissing(kindNotes.get(kind)) ? 'need' : ''}`} placeholder="何をしたか一言(必須)" maxLength={200}
              value={kindNotes.get(kind)} onChange={(e) => setKindNotes((m) => new Map(m).set(kind, e.target.value))}
            />
          )}
        </div>
      ))}
      <label>困っていること・先生に相談したいこと(任意)
        <textarea rows={2} maxLength={1000} value={blocker} onChange={(e) => setBlocker(e.target.value)} />
      </label>
      {err && <p className="error">{err}</p>}
      {missing.length > 0 && <p className="error">選んだ項目に、一言を書いてください({missing.length}件)。</p>}
      <div className="row">
        <button disabled={!canSubmit || state === 'saving'} onClick={submit}>
          {submitted ? '更新する' : '提出する'}
        </button>
        {state === 'saved' && <span className="ok">提出しました。今日のうちは、何度でも直せます。</span>}
        {state === 'idle' && submitted && <span className="hint">提出済み</span>}
      </div>
    </div>
  );
}
