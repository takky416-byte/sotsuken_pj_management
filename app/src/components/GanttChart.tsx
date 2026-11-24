import { StackTable } from './StackTable';
import { useReadOnly } from '../auth/ReadOnly';
import { memo, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { useMilestones } from '../data/calendar';
import { createTasks, newTaskId, updateTask, updateTaskArray, useTasks } from '../data/tasks';
import { celebrate } from '../lib/celebrate';
import { say } from '../lib/tone';
import { addDays, formatDate, jstDate } from '../lib/dates';
import { boltPolyline, buildGantt, lightning, nextDates, pct, placeMilestones, weekTicks } from '../lib/gantt';
import { dayAt, dragDates, type DragKind } from '../lib/ganttDrag';
import { parseQuickAdd } from '../lib/quickAdd';
import { appendOrder, newlyCompletedParents, overallProgress, ownedWithAncestors } from '../lib/wbs';
import { MemberFilter } from './MemberFilter';
import { STATUS_LABEL, type Member, type Task, type TaskStatus } from '../types';

type Drag = { id: string; kind: DragKind; orig: { start: string; end: string }; delta: number; anchor?: string };
const STATUSES: TaskStatus[] = ['todo', 'doing', 'done', 'hold'];

const LANE_PX = 22;
const ROW_PX = 30; // ガントチャートの1行の高さ (稲妻線の位置合わせのため、固定)

type GanttRowData = ReturnType<typeof buildGantt>['rows'][number];
type RowHandlers = {
  down: (e: React.PointerEvent<HTMLElement>, r: { task: Task; start: string | null; end: string | null }, kind: DragKind) => void;
  move: (e: React.PointerEvent<HTMLElement>) => void;
  up: () => void;
  pick: (id: string) => void;
  plus: (id: string) => void;
  cancel: () => void;
};

/**
 * ガントチャートの1行。memo にして、自分の行のデータが変わらないかぎり、描き直さない
 * (ドラッグ中は、動かしている行だけが変わる。全行を作り直すと、小項目まで出したときに、動きがもたつく)。
 */
const GanttRowView = memo(function GanttRowView({ r, g, ticks, tickLefts, leaf, selected, direct, ro, report, drag, assignText, onPick, onPlus, onDown, onMove, onUp, onCancel }: {
  r: GanttRowData; g: ReturnType<typeof buildGantt>; ticks: string[]; tickLefts: string[]; leaf: boolean; selected: boolean; direct: boolean; ro: boolean; report: boolean;
  drag: Drag | null; assignText: string;
  onPick: (id: string) => void; onPlus: (id: string) => void;
  onDown: RowHandlers['down']; onMove: RowHandlers['move']; onUp: () => void; onCancel: () => void;
}) {
  const pos = (d: string) => `${pct(g, d)}%`;
  const who = assignText ? `担当: ${assignText}` : '担当: 未定';
  const live1 = direct && leaf;
  const pv = drag ? dragDates(drag.kind, drag.orig, drag.delta, drag.anchor) : r.start && r.end ? { start: r.start, end: r.end } : null;
  const dragging = !!drag;
  return (
    <div className={`gantt-row${selected ? ' selected' : ''}`}>
      <div
        className={`gantt-name d${r.depth}${direct ? ' pickable' : ''}`} title={`${r.task.title}\n${who}`}
        onClick={direct ? () => onPick(r.task.id) : undefined}
      >
        <span className="gantt-name-text">
          {r.task.title}
          {r.task.assignees.length > 0 && <small> {assignText}</small>}
        </span>
        {!report && !ro && (
          <button
            type="button" className="ghost gantt-plus no-print" aria-label={`「${r.task.title}」に${r.depth >= 3 ? '同じ階層のタスクを' : 'タスクを中に'}追加`}
            title={r.depth >= 3 ? 'この下に、同じ階層のタスクを追加' : 'この中に、タスクを追加'}
            onClick={(e) => { e.stopPropagation(); onPlus(r.task.id); }}
          >＋</button>
        )}
      </div>
      <div
        className={`gantt-track${live1 && !pv ? ' paintable' : ''}`}
        onPointerDown={live1 && !pv ? (e) => onDown(e, r, 'new') : undefined}
        onPointerMove={direct ? onMove : undefined} onPointerUp={direct ? onUp : undefined} onPointerCancel={direct ? onCancel : undefined}
      >
        {ticks.map((d, i) => <i key={d} className="gantt-grid" style={{ left: tickLefts[i] }} />)}
        {pv && (
          <span
            className={`gantt-bar ${r.status}${r.derived ? ' derived' : ''}${r.overdue ? ' overdue' : ''}${live1 ? ' editable' : ''}${dragging ? ' dragging' : ''}`}
            style={{ left: pos(pv.start), width: `max(${live1 ? 14 : 6}px, ${pct(g, addDays(pv.end, 1)) - pct(g, pv.start)}%)` }}
            title={`${r.task.title}\n${who}\n${formatDate(pv.start)}〜${formatDate(pv.end)} / ${STATUS_LABEL[r.status]}${r.overdue ? ' / 期限超過' : ''}`}
            onPointerDown={live1 ? (e) => onDown(e, r, 'move') : undefined}
          >
            {live1 && <>
              <i className="grip l" onPointerDown={(e) => onDown(e, r, 'start')} />
              <i className="grip r" onPointerDown={(e) => onDown(e, r, 'end')} />
            </>}
          </span>
        )}
        {dragging && pv && <span className="gantt-tip" style={{ left: pos(pv.start) }}>{formatDate(pv.start).replace(/\(.*\)/, '')}〜{formatDate(pv.end).replace(/\(.*\)/, '')}</span>}
      </div>
    </div>
  );
});

/** 予定の全体像。大項目・中項目の期間を棒で表す。日付が未設定の大項目は、中の日付から求める。 */
export function GanttChart({ teamId, actor, members, report = false }: { teamId: string; actor: string; members: Member[]; report?: boolean }) {
  const ro = useReadOnly(); // 閲覧専用の教員は、見るだけ (棒のドラッグ・タスクの追加はしない)
  const { data: tasks, error } = useTasks(teamId);
  const milestones = useMilestones(teamId);
  const [deep, setDeep] = useState(report); // PJ分析では、小項目まで出す
  const [edit, setEdit] = useState(false);
  const [bolt, setBolt] = useState(true);
  const [err, setErr] = useState('');
  const [direct, setDirect] = useState(false); // ガントチャート上で、バーをなぞって編集する
  const [sel, setSel] = useState<string | null>(null);
  const [drag, setDragState] = useState<Drag | null>(null);
  const dragRef = useRef<Drag | null>(null); // 速い操作でも取りこぼさないよう、描画を待たずに参照する
  const setDrag = (d: Drag | null) => { dragRef.current = d; setDragState(d); };
  const meta = useRef<{ left: number; width: number; day0: number; moved: boolean } | null>(null);
  const [addParent, setAddParent] = useState('');
  const [addTitle, setAddTitle] = useState('');
  const [inline, setInline] = useState<string | null>(null); // 行の「＋」から、その場で追加するときの、追加先 (''は大項目)
  const [inlineTitle, setInlineTitle] = useState('');
  const box = useRef<HTMLDivElement>(null);
  const ready = !!tasks && !!milestones;
  const today = jstDate();
  // 重い計算は、データ (tasks など) が変わったときだけやり直す。ドラッグ中の動きごとに、全行を作り直さない
  const [who, setWho] = useState(''); // 担当者で絞り込む (メンバーの sid。空は全員)
  const gAll = useMemo(() => (tasks && milestones ? buildGantt(tasks, milestones, today, deep ? 3 : 2) : null), [tasks, milestones, today, deep]);
  // 絞り込みは、全員ぶんで日付を求めたあとに、行を選ぶ (親の期間が、その人の分だけに縮まないように)。その人の担当と、その上の階層を残す
  const whoShown = useDeferredValue(who); // 選んだ瞬間は、プルダウンだけ切り替え、行の入れ替えは、少し遅れて追いつく
  const gm = useMemo(() => {
    if (!gAll || !tasks || !whoShown) return gAll;
    const keep = ownedWithAncestors(tasks, whoShown);
    return { ...gAll, rows: gAll.rows.filter((r) => keep.has(r.task.id)), undated: gAll.undated.filter((t) => t.assignees.includes(whoShown)) };
  }, [gAll, tasks, whoShown]);
  const parentSet = useMemo(() => new Set((tasks ?? []).filter((t) => !t.deleted && t.parentId).map((t) => t.parentId as string)), [tasks]);
  const ticksM = useMemo(() => (gm ? weekTicks(gm) : []), [gm]);
  const tickLeftsM = useMemo(() => (gm ? ticksM.map((d) => `${pct(gm, d)}%`) : []), [gm, ticksM]);
  // 行の部品 (memo) に渡す操作は、いつも同じ関数にする (中身は、最新の画面の状態を見る)
  const hr = useRef<RowHandlers>({ down: () => undefined, move: () => undefined, up: () => undefined, pick: () => undefined, plus: () => undefined, cancel: () => undefined });
  const onDown = useCallback<RowHandlers['down']>((e, r, kind) => hr.current.down(e, r, kind), []);
  const onMove = useCallback<RowHandlers['move']>((e) => hr.current.move(e), []);
  const onUp = useCallback(() => hr.current.up(), []);
  const onPick = useCallback((id: string) => hr.current.pick(id), []);
  const onPlus = useCallback((id: string) => hr.current.plus(id), []);
  const onCancel = useCallback(() => hr.current.cancel(), []);
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

  const g = gm as NonNullable<typeof gm>;
  const name = (sid: string) => members.find((m) => m.sid === sid)?.name ?? sid;
  const ticks = ticksM;
  const pos = (d: string) => `${pct(g, d)}%`;
  const ms = placeMilestones(milestones, g);
  const parents = parentSet;
  const points = lightning(g, today, deep ? 3 : 2, (id) => parents.has(id));
  const todayX = pct(g, today);
  const H = g.rows.length * ROW_PX;
  const msH = report ? 0 : Math.max(ROW_PX, ms.lanes * LANE_PX + 2); // マイルストーンの行 (ガントチャートの一番上、目盛りの下)。報告書では、この行を出さないので 0
  const behind = points.filter((p) => p.days < -1).length;

  const live = tasks.filter((t) => !t.deleted);
  const selTask = sel ? live.find((t) => t.id === sel) ?? null : null;
  const save = (id: string, changes: Partial<Omit<Task, 'id'>>) => {
    setErr('');
    return updateTask(teamId, actor, id, changes).catch((e) => setErr(`保存できませんでした: ${(e as Error).message}`));
  };

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
  const submitAdd = (rawTitle: string, parentId: string) => {
    const title = rawTitle.trim();
    if (!title) return;
    const parent = live.find((t) => t.id === parentId && t.depth <= 2) ?? null;
    const depth = (parent ? parent.depth + 1 : 1) as 1 | 2 | 3;
    const q = parseQuickAdd(title, members, jstDate());
    setErr('');
    createTasks(teamId, actor, [{ id: newTaskId(teamId), parentId: parent?.id ?? null, depth, title: q.title, detail: '', order: appendOrder(live, parent?.id ?? null), assignees: q.assignees, endDate: q.endDate }])
      .catch((e) => setErr(`追加できませんでした: ${(e as Error).message}`));
  };
  const addTask = () => { const t = addTitle; setAddTitle(''); submitAdd(t, addParent); };
  const addInline = () => { const t = inlineTitle; setInlineTitle(''); submitAdd(t, inline ?? ''); }; // 続けて、いくつも入れられるよう、閉じない
  hr.current = {
    down, move, up,
    pick: (id) => { setSel(sel === id ? null : id); setAddParent(addParentFor(id)); },
    plus: (id) => { setInline(addParentFor(id)); setInlineTitle(''); },
    cancel: () => { meta.current = null; setDrag(null); },
  };
  const parentChoices = live.filter((t) => t.depth <= 2).sort((a, b) => a.depth - b.depth || a.order - b.order);

  if ((gAll?.rows.length ?? 0) === 0) return <p className="card">タスクがまだありません。</p>; // 絞り込みで0件のときは、絞り込みを戻せるよう、画面を出したままにする
  return (
    <>
      {whoShown && g.rows.length === 0 && <p className="hint">{members.find((m) => m.sid === whoShown)?.name ?? ''}さんが担当のタスクは、まだありません。「担当で絞り込む」を「全員」にすると、すべて見られます。</p>}
      {!report && <p className="hint">棒は、タスクの開始日〜終了日です(薄い棒は、中のタスクの日付から求めた期間)。日付が空のタスクは、棒が出ません。</p>}
      <div className="row no-print" hidden={report}>
        <label className="check"><input type="checkbox" checked={deep} onChange={(e) => setDeep(e.target.checked)} />小項目も表示する</label>
        <MemberFilter members={members} value={who} onChange={setWho} meSid={actor !== 'teacher' ? actor : null} />
        <label className="check"><input type="checkbox" checked={bolt} onChange={(e) => setBolt(e.target.checked)} />稲妻線を表示する</label>
        {!ro && <label className="check"><input type="checkbox" checked={direct} onChange={(e) => { setDirect(e.target.checked); setSel(null); }} />ガントチャートで編集する</label>}
        {!ro && <label className="check"><input type="checkbox" checked={edit} onChange={(e) => setEdit(e.target.checked)} />日付を入力する</label>}
      </div>
      {direct && !report && <p className="hint">バーを<strong>ドラッグ</strong>で移動、両端で期間を変更。<strong>空の行をなぞる</strong>と期間が入ります。バーや行を<strong>タップ</strong>すると、状態の変更ができます。各行の<strong>＋</strong>で、その行の中にタスクを追加できます。</p>}
      {err && <p className="error">{err}</p>}
      <div className="gantt" ref={box}>
        <div className="gantt-inner">
        <div className="gantt-head">
          <div className="gantt-name" />
          <div className="gantt-track">
            {ticks.map((d) => <span key={d} className="gantt-tick" style={{ left: pos(d) }}>{formatDate(d).replace(/\(.*\)/, '')}</span>)}
          </div>
        </div>
        {!report && <div className="gantt-row ms-row" style={{ height: msH }}>
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
        </div>}
        {g.rows.map((r) => (
          <GanttRowView
            key={r.task.id} r={r} g={g} ticks={ticks} tickLefts={tickLeftsM} leaf={!parents.has(r.task.id)} selected={sel === r.task.id}
            direct={direct} ro={ro} report={report} drag={drag && drag.id === r.task.id ? drag : null}
            assignText={r.task.assignees.map(name).join('・')}
            onPick={onPick} onPlus={onPlus} onDown={onDown} onMove={onMove} onUp={onUp} onCancel={onCancel}
          />
        ))}
        {!report && (
          <div className="gantt-addrow no-print">
            {inline === null
              ? <button type="button" className="ghost" onClick={() => { setInline(''); setInlineTitle(''); }}>＋ 大項目を追加</button>
              : (
                <div className="row gantt-add">
                  <span className="hint">{inline ? `「${live.find((t) => t.id === inline)?.title ?? ''}」の中に追加` : '大項目として追加'}</span>
                  <input
                    autoFocus aria-label="ここに追加するタスクの名前" placeholder="タスク名 @担当 〜10/30 (Enterで追加。続けて入力できます)" maxLength={200} value={inlineTitle}
                    onChange={(e) => setInlineTitle(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) addInline(); if (e.key === 'Escape') setInline(null); }}
                  />
                  <button type="button" onClick={addInline} disabled={!inlineTitle.trim()}>追加</button>
                  <button type="button" className="ghost" onClick={() => setInline(null)}>閉じる</button>
                </div>
              )}
          </div>
        )}
        <div className="gantt-today" style={{ left: `calc(var(--gantt-name) + (100% - var(--gantt-name)) * ${todayX / 100})` }} title="今日" />
        {bolt && (
          <svg className="gantt-lightning" viewBox={`0 0 100 ${H}`} preserveAspectRatio="none" style={{ height: H, top: ROW_PX + msH }} aria-label="稲妻線" role="img">
            <polyline
              points={boltPolyline(g.rows.length, points, todayX, ROW_PX)}
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
                  {actor === 'teacher' && (
                    <div className="seg" role="group" aria-label="状態">
                    {STATUSES.map((st) => (
                      <button key={st} type="button" className={`seg-btn st-${st} ${selTask.status === st ? 'on' : ''}`} aria-pressed={selTask.status === st} onClick={() => setStatus(selTask, st)}>{STATUS_LABEL[st]}</button>
                    ))}
                  </div>
                  )}
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
          ) : <p className="hint">バーや行の名前をタップすると、期間の調整・担当・タスクの追加ができます。</p>}
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
        {bolt && <> / <span className="legend bolt" />稲妻線(今日の線より左は、予定の期間に入っているのに未着手のタスクと、終了予定日を過ぎても完了していない進行中のタスク、右は、予定より早く着手・完了したタスク。{behind > 0 ? `遅れの目安: ${behind}行` : '遅れはありません'})</>}
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
