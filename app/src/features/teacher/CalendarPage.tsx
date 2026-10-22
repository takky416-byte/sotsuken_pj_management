import { useMemo, useState } from 'react';
import {
  deleteMilestone, saveClassDays, saveMilestone, useClassDays, useMilestones,
} from '../../data/calendar';
import { PERIODS, parseClassDaysCsv, removeDay, upsertDay, validateDay } from '../../lib/classDays';
import { formatDate, isDateString, jstDate } from '../../lib/dates';
import { TEAM_IDS, type ClassDay, type Milestone } from '../../types';

export function CalendarPage() {
  const milestones = useMilestones('all');
  const days = useClassDays();
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');

  const run = async (fn: () => Promise<unknown>, done?: string) => {
    setErr(''); setMsg('');
    try { await fn(); if (done) setMsg(done); } catch (e) { setErr(`できませんでした: ${(e as Error).message}`); }
  };

  if (!milestones || !days) return <p>読み込み中…</p>;
  return (
    <>
      <h2>カレンダー</h2>
      {err && <p className="error">{err}</p>}
      {msg && <p className="ok">{msg}</p>}
      <Milestones milestones={milestones} run={run} />
      <ClassDays days={days} run={run} />
    </>
  );
}

type Run = (fn: () => Promise<unknown>, done?: string) => Promise<void>;

// ---------------- マイルストーン ----------------

function Milestones({ milestones, run }: { milestones: Milestone[]; run: Run }) {
  const empty = { title: '', date: '', endDate: '', teamId: '' };
  const [f, setF] = useState(empty);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState(empty);
  const today = jstDate();

  const check = (x: typeof empty) => {
    if (!x.title.trim() || !isDateString(x.date) || (x.endDate && !isDateString(x.endDate))) throw new Error('名称と日付(開始)を入力してください');
    if (x.endDate && x.endDate < x.date) throw new Error('終了日は、開始日以降にしてください');
  };

  return (
    <>
      <h3>マイルストーン</h3>
      <div className="card row">
        <input aria-label="名称" placeholder="名称" value={f.title} maxLength={100} onChange={(e) => setF({ ...f, title: e.target.value })} />
        <input aria-label="開始日" type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} />
        <span>〜</span>
        <input aria-label="終了日" type="date" value={f.endDate} onChange={(e) => setF({ ...f, endDate: e.target.value })} />
        <select aria-label="対象" value={f.teamId} onChange={(e) => setF({ ...f, teamId: e.target.value })}>
          <option value="">共通</option>
          {TEAM_IDS.map((t) => <option key={t} value={t}>{t}チーム</option>)}
        </select>
        <button onClick={() => run(async () => {
          check(f);
          await saveMilestone({ title: f.title.trim(), date: f.date, endDate: f.endDate || null, teamId: f.teamId || null });
          setF(empty);
        })}>追加</button>
      </div>
      <div className="table-wrap">
        <table className="table">
          <thead><tr><th>日付</th><th>名称</th><th>対象</th><th></th></tr></thead>
          <tbody>
            {milestones.map((m) => editing === m.id ? (
              <tr key={m.id}>
                <td>
                  <input aria-label="開始日(編集)" type="date" value={draft.date} onChange={(e) => setDraft({ ...draft, date: e.target.value })} />
                  〜<input aria-label="終了日(編集)" type="date" value={draft.endDate} onChange={(e) => setDraft({ ...draft, endDate: e.target.value })} />
                </td>
                <td><input aria-label="名称(編集)" value={draft.title} maxLength={100} onChange={(e) => setDraft({ ...draft, title: e.target.value })} /></td>
                <td>
                  <select aria-label="対象(編集)" value={draft.teamId} onChange={(e) => setDraft({ ...draft, teamId: e.target.value })}>
                    <option value="">共通</option>
                    {TEAM_IDS.map((t) => <option key={t} value={t}>{t}チーム</option>)}
                  </select>
                </td>
                <td>
                  <button onClick={() => run(async () => {
                    check(draft);
                    await saveMilestone({ id: m.id, title: draft.title.trim(), date: draft.date, endDate: draft.endDate || null, teamId: draft.teamId || null, note: m.note });
                    setEditing(null);
                  })}>保存</button>
                  <button className="ghost" onClick={() => setEditing(null)}>取消</button>
                </td>
              </tr>
            ) : (
              <tr key={m.id} className={(m.endDate ?? m.date) < today ? 'past' : ''}>
                <td>{formatDate(m.date)}{m.endDate && m.endDate !== m.date ? `〜${formatDate(m.endDate)}` : ''}</td>
                <td>{m.title}</td>
                <td>{m.teamId ? `${m.teamId}チーム` : '共通'}</td>
                <td>
                  <button className="ghost" onClick={() => { setEditing(m.id); setDraft({ title: m.title, date: m.date, endDate: m.endDate ?? '', teamId: m.teamId ?? '' }); }}>編集</button>
                  <DeleteButton onDelete={() => run(() => deleteMilestone(m.id))} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

/** 2段階の削除 (押すと4秒間だけ「本当に削除」に変わる)。確認のダイアログは出さない。 */
function DeleteButton({ onDelete }: { onDelete: () => void }) {
  const [sure, setSure] = useState(false);
  return sure
    ? <button className="ghost danger" onClick={onDelete}>本当に削除</button>
    : <button className="ghost danger" onClick={() => { setSure(true); setTimeout(() => setSure(false), 4000); }}>削除</button>;
}

// ---------------- 授業日・ミーティング ----------------

function ClassDays({ days, run }: { days: ClassDay[]; run: Run }) {
  const today = jstDate();
  const [showPast, setShowPast] = useState(false);
  const [nd, setNd] = useState<{ date: string; periods: ClassDay['periods']; note: string; meeting: boolean }>({ date: '', periods: '3-4', note: '', meeting: false });
  const [csv, setCsv] = useState('');
  const parsed = useMemo(() => parseClassDaysCsv(csv), [csv]);

  const shown = days.filter((d) => showPast || d.date >= today);
  const save = (next: ClassDay[], done?: string) => run(() => saveClassDays(next), done);
  const change = (d: ClassDay, patch: Partial<ClassDay>) => save(upsertDay(days, { ...d, ...patch }));

  const add = () => run(async () => {
    const problem = validateDay(nd);
    if (problem) throw new Error(problem);
    if (days.some((d) => d.date === nd.date)) throw new Error(`${formatDate(nd.date)}は、すでに授業日です。一覧で変更してください`);
    await saveClassDays(upsertDay(days, { ...nd, note: nd.note.trim() }));
    setNd({ ...nd, date: '', note: '' });
  });

  const importCsv = () => run(async () => {
    let next = days;
    for (const d of parsed.days) next = upsertDay(next, d);
    await saveClassDays(next);
    setCsv('');
  }, `${parsed.days.length}日を追加・更新しました。`);

  return (
    <>
      <h3>授業日とミーティング</h3>
      <p className="hint">
        日報の対象になるのは、ここに登録された授業日です。リマインド(Apps Script)も、この日と時限を見て送ります。
        ミーティングを行う日にチェックを入れてください(どの曜日でも設定できます)。
      </p>

      <div className="card row">
        <input aria-label="授業日の日付" type="date" value={nd.date} onChange={(e) => setNd({ ...nd, date: e.target.value })} />
        <select aria-label="授業日の時限" value={nd.periods} onChange={(e) => setNd({ ...nd, periods: e.target.value as ClassDay['periods'] })}>
          {PERIODS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
        </select>
        <input aria-label="授業日の備考" placeholder="備考(任意)" value={nd.note} maxLength={100} onChange={(e) => setNd({ ...nd, note: e.target.value })} />
        <label className="check"><input type="checkbox" checked={nd.meeting} onChange={(e) => setNd({ ...nd, meeting: e.target.checked })} />ミーティングを行う</label>
        <button onClick={add}>授業日を追加</button>
      </div>

      <details className="card">
        <summary>CSVでまとめて追加・更新</summary>
        <div className="form">
          <label>日付,時限,備考,ミーティング(備考・ミーティングは省略可)
            <textarea rows={4} value={csv} onChange={(e) => setCsv(e.target.value)} placeholder={'2026-11-05,1-2,,あり\n2026-11-10,3-4,休講に注意'} />
          </label>
          <p className="hint">時限は 1-2 か 3-4。ミーティングを省略すると、木曜(1-2限)の日だけ「あり」になります。同じ日付は上書きします。</p>
          {parsed.errors.length > 0 && <ul className="error plain">{parsed.errors.map((e) => <li key={e.line}>{e.line}行目: {e.message}</li>)}</ul>}
          <div className="row"><button disabled={parsed.days.length === 0 || parsed.errors.length > 0} onClick={importCsv}>{parsed.days.length}日を追加・更新する</button></div>
        </div>
      </details>

      <label className="check"><input type="checkbox" checked={showPast} onChange={(e) => setShowPast(e.target.checked)} />過ぎた授業日も表示する</label>
      <div className="table-wrap">
        <table className="table">
          <thead><tr><th>日付</th><th>時限</th><th>備考</th><th>ミーティング</th><th></th></tr></thead>
          <tbody>
            {shown.map((d) => (
              <DayRow key={`${d.date}-${d.periods}-${d.note}-${d.meeting}`} day={d} past={d.date < today}
                onChange={(patch) => change(d, patch)} onDelete={() => save(removeDay(days, d.date))} />
            ))}
            {shown.length === 0 && <tr><td colSpan={5} className="hint">表示できる授業日がありません。</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}

function DayRow({ day, past, onChange, onDelete }: {
  day: ClassDay; past: boolean; onChange: (patch: Partial<ClassDay>) => void; onDelete: () => void;
}) {
  const [note, setNote] = useState(day.note);
  return (
    <tr className={past ? 'past' : ''}>
      <td>{formatDate(day.date)}</td>
      <td>
        <select aria-label={`時限 ${day.date}`} value={day.periods} onChange={(e) => onChange({ periods: e.target.value as ClassDay['periods'] })}>
          {PERIODS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
        </select>
      </td>
      <td>
        <input aria-label={`備考 ${day.date}`} value={note} maxLength={100} onChange={(e) => setNote(e.target.value)}
          onBlur={() => note !== day.note && onChange({ note: note.trim() })} />
      </td>
      <td><input type="checkbox" aria-label={`ミーティング ${day.date}`} checked={day.meeting} onChange={(e) => onChange({ meeting: e.target.checked })} /></td>
      <td><DeleteButton onDelete={onDelete} /></td>
    </tr>
  );
}
