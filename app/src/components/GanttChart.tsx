import { StackTable } from './StackTable';
import { useEffect, useRef, useState } from 'react';
import { useMilestones } from '../data/calendar';
import { createTasks, newTaskId, updateTask, updateTaskArray, useTasks } from '../data/tasks';
import { celebrate } from '../lib/celebrate';
import { say } from '../lib/tone';
import { addDays, formatDate, jstDate } from '../lib/dates';
import { buildGantt, lightning, nextDates, pct, placeMilestones, weekTicks } from '../lib/gantt';
import { dayAt, dragDates, type DragKind } from '../lib/ganttDrag';
import { parseQuickAdd } from '../lib/quickAdd';
import { appendOrder, newlyCompletedParents, overallProgress } from '../lib/wbs';
import { STATUS_LABEL, type Member, type Task, type TaskStatus } from '../types';

type Drag = { id: string; kind: DragKind; orig: { start: string; end: string }; delta: number; anchor?: string };
const STATUSES: TaskStatus[] = ['todo', 'doing', 'done', 'hold'];

const LANE_PX = 22;
const ROW_PX = 30; // ガントの1行の高さ (稲妻線の位置合わせのため、固定)

/** 予定の全体像。大項目・中項目の期間を棒で表す。日付が未設定の大項目は、中の日付から求める。 */
export function GanttChart({ teamId, actor, members, report = false }: { teamId: string; actor: string; members: Member[]; report?: boolean }) {
  const { data: tasks, error } = useTasks(teamId);
  const milestones = useMilestones(teamId);
  const [deep, setDeep] = useState(report); // 報告書では、小項目まで出す
  const [edit, setEdit] = useState(false);
  const [bolt, setBolt] = useState(true);
  const [err, setErr] = useState('');
  const [direct, setDirect] = useState(false); // ガント上で、バーをなぞって編集する
  const [sel, setSel] = useState<string | null>(null);
  const [drag, setDragState] = useState<Drag | null>(null);
  const dragRef = useRef<Drag | null>(null); // 速い操作でも取りこぼさないよう、描画を待たずに参照する
  const setDrag = (d: Drag | null) => { dragRef.current = d; setDragState(d); };
  const meta = useRef<{ left: number; width: number; day0: number; moved: boolean } | null>(null);
  const [addParent, setAddParent] = useState('');
  const [addTitle, setAddTitle] = useState('');
  const box = useRef<HTMLDivElement>(null);
  const ready = !!tasks && !!milestones;
  // 開いたときに、今日の線が見える位置までスクロールする (スマホなど、横にはみ出すとき)
  useEffect(() => {
    const el = box.current;
    if (!ready || !el) return;
    const today = el.querySelector<HTMLElement>('.gantt-today');
    const name = el.querySelector<HTMLElement>('.gantt-name')?.offsetWidth ?? 0;
    if (today) el.scrollLeft = Math.max(0, today.offsetLeft - name - (el.clientWidth - name) * 0.4);
  }, [ready]);
  if (error) return <p className="error">{error}</p>;
  if (!tasks || !milestones) return <p>読み込み中…</p>;

  const today = jstDate();
  const g = buildGantt(tasks, milestones, today, deep ? 3 : 2);
  const name = (sid: string) => members.find((m) => m.sid === sid)?.name ?? sid;
  const ticks = weekTicks(g);
  const pos = (d: string) => `${pct(g, d)}%`;
  const ms = placeMilestones(milestones, g);
  const parents = new Set(tasks.filter((t) => !t.deleted && t.parentId).map((t) => t.parentId as string));
  const points = lightning(g, today, deep ? 3 : 2, (id) => parents.has(id));
  const todayX = pct(g, today);
  const H = g.rows.length * ROW_PX;
  const msH = Math.max(ROW_PX, ms.lanes * LANE_PX + 2); // マイルストーンの行 (ガントの一番上、目盛りの下)
  const behind = points.filter((p) => p.days < -1).length;

  const live = tasks.filter((t) => !t.deleted);
  const selTask = sel ? live.find((t) => t.id === sel) ?? null : null;
  const save = (id: string, changes: Partial<Omit<Task, 'id'>>) => {
    setErr('');
    return updateTask(teamId, actor, id, changes).catch((e) => setErr(`保存できませんでした: ${(e as Error).message}`));
  };
  const preview = (r: { task: Task; start: string | null; end: string | null }) =>
    drag && drag.id === r.task.id ? dragDates(drag.kind, drag.orig, drag.delta, drag.anchor) : r.start && r.end ? { start: r.start, end: r.end } : null;

  /** バー・空の行を押したときの、ドラッグの開始 */
  const down = (e: React.PointerEvent<HTMLElement>, r: { task: Task; start: string | null; end: string | null }, kind: DragKind) => {
    if (!direct || e.button > 0) return;
    const track = e.currentTarget.closest('.gantt-track') as HTMLElement | null;
    if (!track) return;
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    const rect = track.getBoundingClientRect();
    const day0 = dayAt(e.clientX, rect.left, rect.width, g.days);
    meta.current = { left: rect.left, width: rect.width, day0, moved: false };
    const orig = r.start && r.end ? { start: r.start, end: r.end } : { start: addDays(g.start, day0), end: addDays(g.start, day0) };
    setDrag({ id: r.task.id, kind, orig, delta: 0, anchor: kind === 'new' ? addDays(g.start, day0) : undefined });
  };
  const move = (e: React.PointerEvent<HTMLElement>) => {
    const m = meta.current; const drag = dragRef.current;
    if (!m || !drag) return;
    const delta = dayAt(e.clientX, m.left, m.width, g.days) - m.day0;
    if (delta !== drag.delta) { m.moved = true; setDrag({ ...drag, delta }); }
  };
  const up = () => {
    const m = meta.current; const d = dragRef.current;
    meta.current = null; setDrag(null);
    if (!m || !d) return;
    if (d.kind === 'new' || m.moved) {
      const r = dragDates(d.kind, d.orig, d.delta, d.anchor);
      save(d.id, { startDate: r.start, endDate: r.end });
    }
    setSel(d.id); setAddParent(addParentFor(d.id));
  };
  const addParentFor = (id: string) => {
    const t = live.find((x) => x.id === id);
    return t ? (t.depth <= 2 ? t.id : t.parentId ?? '') : '';
  };
  const setStatus = async (t: Task, status: TaskStatus) => {
    const parents = status === 'done' ? newlyCompletedParents(tasks, t.id, status) : [];
    await save(t.id, { status });
    if (status === 'done') {
      const p = overallProgress(tasks);
      celebrate(say.taskDone(parents.length > 0 ? parents[0].title : null, Math.min(p.total, p.done + 1), p.total));
    }
  };
  const shift = (t: Task, field: 'start' | 'end', n: number) => {
    const s = t.startDate ?? t.endDate; const e = t.endDate ?? t.startDate;
    if (!s || !e) { const d = jstDate(); void save(t.id, { startDate: d, endDate: d }); return; }
    const r = dragDates(field, { start: s, end: e }, n);
    void save(t.id, { startDate: r.start, endDate: r.end });
  };
  const addTask = () => {
    const title = addTitle.trim();
    if (!title) return;
    const parent = live.find((t) => t.id === addParent && t.depth <= 2) ?? null;
    const depth = (parent ? parent.depth + 1 : 1) as 1 | 2 | 3;
    const q = parseQuickAdd(title, members, jstDate());
    setErr(''); setAddTitle('');
    createTasks(teamId, actor, [{ id: newTaskId(teamId), parentId: parent?.id ?? null, depth, title: q.title, detail: '', order: appendOrder(live, parent?.id ?? null), assignees: q.assignees, endDate: q.endDate }])
      .catch((e) => setErr(`追加できませんでした: ${(e as Error).message}`));
  };
  const parentChoices = live.filter((t) => t.depth <= 2).sort((a, b) => a.depth - b.depth || a.order - b.order);

  if (g.rows.length === 0) return <p className="card">タスクがまだありません。</p>;
  return (
    <>
      {!report && <p className="hint">棒は、タスクの開始日〜終了日です(薄い棒は、中のタスクの日付から求めた期間)。日付が空のタスクは、棒が出ません。</p>}
      <div className="row no-print" hidden={report}>
        <label className="check"><input type="checkbox" checked={deep} onChange={(e) => setDeep(e.target.checked)} />小項目も表示する</label>
        <label className="check"><input type="checkbox" checked={bolt} onChange={(e) => setBolt(e.target.checked)} />稲妻線を表示する</label>
        <label className="check"><input type="checkbox" checked={direct} onChange={(e) => { setDirect(e.target.checked); setSel(null); }} />ガントで編集する</label>
        <label className="check"><input type="checkbox" checked={edit} onChange={(e) => setEdit(e.target.checked)} />日付を入力する</label>
      </div>
      {direct && !report && <p className="hint">バーを<strong>ドラッグ</strong>で移動、両端で期間を変更。<strong>空の行をなぞる</strong>と期間が入ります。バーや行を<strong>タップ</strong>すると、状態の変更・タスクの追加ができます。</p>}
      {err && <p className="error">{err}</p>}
      <div className="gantt" ref={box}>
        <div className="gantt-inner">
        <div className="gantt-head">
          <div className="gantt-name" />
          <div className="gantt-track">
            {ticks.map((d) => <span key={d} className="gantt-tick" style={{ left: pos(d) }}>{formatDate(d).replace(/\(.*\)/, '')}</span>)}
          </div>
        </div>
        <div className="gantt-row ms-row" style={{ height: msH }}>
          <div className="gantt-name ms-label">マイルストーン</div>
          <div className="gantt-track" style={{ height: ms.lanes * LANE_PX + 2 }}>
            {milestones.map((m) => {
              const pl = ms.places.find((p) => p.id === m.id)!;
              return (
                <span key={m.id} className={`gantt-ms ${pl.align === 'right' ? 'r' : ''}`}
                  style={{ top: pl.lane * LANE_PX, ...(pl.align === 'left' ? { left: pos(m.date) } : { right: `${100 - pct(g, m.date)}%` }) }}
                  title={`${formatDate(m.date)} ${m.title}`}>◆<small>{m.title}</small></span>
              );
            })}
          </div>
        </div>
        {g.rows.map((r) => {
          const leaf = !parents.has(r.task.id);
          const live1 = direct && leaf;
          const pv = preview(r);
          const dragging = drag?.id === r.task.id;
          return (
            <div className={`gantt-row${sel === r.task.id ? ' selected' : ''}`} key={r.task.id}>
              <div
                className={`gantt-name d${r.depth}${direct ? ' pickable' : ''}`} title={r.task.title}
                onClick={direct ? () => { setSel(sel === r.task.id ? null : r.task.id); setAddParent(addParentFor(r.task.id)); } : undefined}
              >
                {r.task.title}
                {r.task.assignees.length > 0 && <small> {r.task.assignees.map(name).join('・')}</small>}
              </div>
              <div
                className={`gantt-track${live1 && !pv ? ' paintable' : ''}`}
                onPointerDown={live1 && !pv ? (e) => down(e, r, 'new') : undefined}
                onPointerMove={direct ? move : undefined} onPointerUp={direct ? up : undefined} onPointerCancel={direct ? () => { meta.current = null; setDrag(null); } : undefined}
              >
                {ticks.map((d) => <i key={d} className="gantt-grid" style={{ left: pos(d) }} />)}
                {pv && (
                  <span
                    className={`gantt-bar ${r.status}${r.derived ? ' derived' : ''}${r.overdue ? ' overdue' : ''}${live1 ? ' editable' : ''}${dragging ? ' dragging' : ''}`}
                    style={{ left: pos(pv.start), width: `max(${live1 ? 14 : 6}px, ${pct(g, addDays(pv.end, 1)) - pct(g, pv.start)}%)` }}
                    title={`${r.task.title}: ${formatDate(pv.start)}〜${formatDate(pv.end)} / ${STATUS_LABEL[r.status]}${r.overdue ? ' / 期限超過' : ''}`}
                    onPointerDown={live1 ? (e) => down(e, r, 'move') : undefined}
                  >
                    {live1 && <>
                      <i className="grip l" onPointerDown={(e) => down(e, r, 'start')} />
                      <i className="grip r" onPointerDown={(e) => down(e, r, 'end')} />
                    </>}
                  </span>
                )}
                {dragging && pv && <span className="gantt-tip" style={{ left: pos(pv.start) }}>{formatDate(pv.start).replace(/\(.*\)/, '')}〜{formatDate(pv.end).replace(/\(.*\)/, '')}</span>}
              </div>
            </div>
          );
        })}
        <div className="gantt-today" style={{ left: `calc(var(--gantt-name) + (100% - var(--gantt-name)) * ${todayX / 100})` }} title="今日" />
        {bolt && (
          <svg className="gantt-lightning" viewBox={`0 0 100 ${H}`} preserveAspectRatio="none" style={{ height: H, top: ROW_PX + msH }} aria-label="稲妻線" role="img">
            <polyline
              points={[`${todayX},0`, ...points.map((p) => `${p.x},${p.row * ROW_PX + ROW_PX / 2}`), `${todayX},${H}`].join(' ')}
              fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" vectorEffect="non-scaling-stroke"
            />
          </svg>
        )}
        </div>
      </div>
      {direct && !report && (
        <div className="card gantt-panel">
          {selTask ? (
            <>
              <div className="row gantt-panel-head">
                <strong>{selTask.title}</strong>
                <button type="button" className="ghost icon" aria-label="選択をやめる" onClick={() => setSel(null)}>×</button>
              </div>
              {!parents.has(selTask.id) ? (
                <>
                  <div className="seg" role="group" aria-label="状態">
                    {STATUSES.map((st) => (
                      <button key={st} type="button" className={`seg-btn st-${st} ${selTask.status === st ? 'on' : ''}`} aria-pressed={selTask.status === st} onClick={() => setStatus(selTask, st)}>{STATUS_LABEL[st]}</button>
                    ))}
                  </div>
                  <div className="row gantt-nudge">
                    <span>開始 {selTask.startDate ? formatDate(selTask.startDate).replace(/\(.*\)/, '') : '—'}</span>
                    <button type="button" className="ghost" aria-label="開始日を1日前へ" onClick={() => shift(selTask, 'start', -1)}>−1日</button>
                    <button type="button" className="ghost" aria-label="開始日を1日後へ" onClick={() => shift(selTask, 'start', 1)}>＋1日</button>
                    <span>終了 {selTask.endDate ? formatDate(selTask.endDate).replace(/\(.*\)/, '') : '—'}</span>
                    <button type="button" className="ghost" aria-label="終了日を1日前へ" onClick={() => shift(selTask, 'end', -1)}>−1日</button>
                    <button type="button" className="ghost" aria-label="終了日を1日後へ" onClick={() => shift(selTask, 'end', 1)}>＋1日</button>
                    {(selTask.startDate || selTask.endDate) && <button type="button" className="ghost" onClick={() => save(selTask.id, { startDate: null, endDate: null })}>期間を消す</button>}
                  </div>
                  {actor !== 'teacher' && (
                    <div className="row">
                      {selTask.assignees.includes(actor)
                        ? <button type="button" className="ghost" onClick={() => updateTaskArray(teamId, actor, selTask.id, 'assignees', 'remove', actor).catch((e) => setErr(`保存できませんでした: ${(e as Error).message}`))}>担当から外れる</button>
                        : <button type="button" className="ghost" onClick={() => updateTaskArray(teamId, actor, selTask.id, 'assignees', 'add', actor).catch((e) => setErr(`保存できませんでした: ${(e as Error).message}`))}>担当する</button>}
                    </div>
                  )}
                </>
              ) : <p className="hint">親のタスクの状態と期間は、中のタスクから自動で決まります。</p>}
            </>
          ) : <p className="hint">バーや行の名前をタップすると、状態を変えられます。</p>}
          <div className="label">タスクを追加</div>
          <div className="row gantt-add">
            <select aria-label="追加する場所" value={addParent} onChange={(e) => setAddParent(e.target.value)}>
              <option value="">大項目として追加</option>
              {parentChoices.map((t) => <option key={t.id} value={t.id}>{t.depth === 2 ? '　' : ''}{t.title}</option>)}
            </select>
            <input
              aria-label="追加するタスクの名前" placeholder="タスク名 @担当 〜10/30" maxLength={200} value={addTitle}
              onChange={(e) => setAddTitle(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) addTask(); }}
            />
            <button type="button" onClick={addTask} disabled={!addTitle.trim()}>追加</button>
          </div>
          <p className="hint">追加したタスクは、期間がない行として出ます。その行をなぞって、期間を入れましょう。</p>
        </div>
      )}
      <p className="hint">
        <span className="legend todo" />未着手 <span className="legend doing" />進行中 <span className="legend done" />完了 <span className="legend hold" />保留
        <span className="legend overdue" />期限超過 / 赤い縦線は今日
        {bolt && <> / <span className="legend bolt" />稲妻線(今日の線より左は、予定の期間に入っているのに未着手のタスク、右は、予定より早く着手・完了したタスク。{behind > 0 ? `遅れの目安: ${behind}行` : '遅れはありません'})</>}
      </p>
      {edit && !report && (
        <div className="card">
          <div className="label">日付の入力(開始日だけ入れると、1日のタスクになります。終了日は、あとから入れられます)</div>
          <div className="table-wrap">
            <StackTable>
              <thead><tr><th>タスク</th><th>開始日</th><th>終了日</th></tr></thead>
              <tbody>
                {[...g.rows.map((r) => r.task), ...g.undated.filter((u) => !g.rows.some((r) => r.task.id === u.id))].map((t) => {
                  const row = g.rows.find((r) => r.task.id === t.id);
                  const set = (field: 'startDate' | 'endDate', value: string) => {
                    setErr('');
                    updateTask(teamId, actor, t.id, nextDates(t, field, value)).catch((e) => setErr(`保存できませんでした: ${(e as Error).message}`));
                  };
                  return (
                    <tr key={t.id}>
                      <td className={`gantt-edit-name d${t.depth}`}>{t.title}</td>
                      <td><input type="date" aria-label={`開始日 ${t.title}`} value={t.startDate ?? ''} placeholder={row?.derived ? row.start ?? '' : ''} onChange={(e) => set('startDate', e.target.value)} /></td>
                      <td><input type="date" aria-label={`終了日 ${t.title}`} value={t.endDate ?? ''} onChange={(e) => set('endDate', e.target.value)} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </StackTable>
          </div>
        </div>
      )}
      {g.undated.length > 0 && (
        <details className="card">
          <summary>日付が未設定のタスク({g.undated.length}件)</summary>
          <ul className="plain">{g.undated.map((t) => <li key={t.id}>{t.title}</li>)}</ul>
        </details>
      )}
    </>
  );
}
