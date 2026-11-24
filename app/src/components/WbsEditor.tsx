import { useSearchParams } from 'react-router-dom';
import { MdTextarea } from './MdTextarea';
import { useReadOnly } from '../auth/ReadOnly';
import { memo, useCallback, useEffect, useMemo, useRef, useState, type ClipboardEvent, type KeyboardEvent } from 'react';
import { STATUS_LABEL, type Member, type Task, type TaskStatus } from '../types';
import {
  applyPatches, createTasks, newTaskId, setDeleted, updateTask, updateTaskArray, useTasks,
} from '../data/tasks';
import { planImport } from '../lib/importPlan';
import { parseOutline } from '../lib/outline';
import {
  appendOrder, childrenOf, descendantsOf, effectiveStatuses, flatten, newlyCompletedParents, periodLabel, periodOf, orderAfter, orphansOf, ownedWithAncestors, unassignedWithAncestors, shortDate, overallProgress, parentChoices, planIndent, planMove, planOutdent, planReparent, planRescue, progressOf,
} from '../lib/wbs';
import { celebrate } from '../lib/celebrate';
import { say } from '../lib/tone';
import { formatDate, jstDate } from '../lib/dates';
import { boltXsFor, buildGantt, lightning, nextDates, pct, placeMilestones, weekTicks } from '../lib/gantt';
import { useMilestones } from '../data/calendar';
import { parseQuickAdd } from '../lib/quickAdd';
import { addDays } from '../lib/dates';
import { useEditableText } from './useEditableText';
import { Toast, type ToastState } from './Toast';

type Props = { teamId: string; actor: string; members: Member[]; /** 各行の右に、期間の棒 (ガントチャート) を並べる */ timeline?: boolean };

export function WbsEditor({ teamId, actor, members, timeline = false }: Props) {
  const { data: tasks, error } = useTasks(teamId);
  const milestones = useMilestones(teamId);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [msOpen, setMsOpenRaw] = useState(() => { try { return localStorage.getItem('wbs-ms-open') !== '0'; } catch { return true; } });
  const setMsOpen = (f: (v: boolean) => boolean) => setMsOpenRaw((v) => { const n = f(v); try { localStorage.setItem('wbs-ms-open', n ? '1' : '0'); } catch { /* 保存できなくても使える */ } return n; });
  const [bolt, setBolt] = useState(true);
  const [onlyMine, setOnlyMine] = useState(false);
  const [sp] = useSearchParams();
  const [onlyFree, setOnlyFree] = useState(() => sp.get('free') === '1'); // 見直しカードから、担当のない項目だけで開く
  const [openId, setOpenId] = useState<string | null>(null);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [addingUnder, setAddingUnder] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastState>(null);
  const [pop, setPop] = useState<{ id: string; kind: 'assign' | 'period' } | null>(null);
  const [showTrash, setShowTrash] = useState(false);
  const [editMode, setEditMode] = useState(() => actor !== 'teacher' && sp.get('edit') === '1'); // 学生は、ふだんは閲覧モード。「編集モードにする」で編集できる
  const [err, setErr] = useState('');
  const closeToast = useCallback(() => setToast(null), []);
  const act = useRef<RowActions>(null as unknown as RowActions);

  const nameOf = useMemo(() => {
    const m = new Map(members.map((x) => [x.sid, x.name]));
    return (sid: string) => (sid === 'teacher' ? '教員' : m.get(sid) ?? sid);
  }, [members]);

  /** 保存できたら true */
  const run = async (fn: () => Promise<unknown>): Promise<boolean> => {
    setErr('');
    try { await fn(); return true; } catch (e) { setErr(`保存できませんでした: ${(e as Error).message}`); return false; }
  };

  const today = jstDate();
  // 行ごとに何度も使う値は、データ (tasks など) が変わったときだけ作る。開閉・入力のたびに、全行ぶんを計算し直さない
  const derived = useMemo(() => {
    if (!tasks) return null;
    const g = timeline ? buildGantt(tasks, milestones ?? [], today, 3) : null;
    const ticks = g ? weekTicks(g) : [];
    const live = tasks.filter((t) => !t.deleted);
    return {
      eff: effectiveStatuses(tasks), g, ticks,
      tickLefts: g ? ticks.map((d) => `${pct(g, d)}%`) : [],
      todayX: g ? pct(g, today) : 0,
      periods: new Map(live.map((t) => [t.id, periodOf(tasks, t)])),
    };
  }, [tasks, milestones, timeline, today]);
  if (error) return <p className="error">読み込めませんでした: {error}</p>;
  if (!tasks || !derived) return <p>読み込み中…</p>;
  const { eff, g, ticks, tickLefts, todayX, periods } = derived;
  const periodFor = (t: Task) => periods.get(t.id) ?? periodOf(tasks, t);

  const mineIds = actor !== 'teacher' && onlyMine ? ownedWithAncestors(tasks, actor) : null;
  const freeIds = onlyFree ? unassignedWithAncestors(tasks) : null;
  const rows = flatten(tasks, collapsed).filter((r) => (!mineIds || mineIds.has(r.task.id)) && (!freeIds || freeIds.has(r.task.id)));
  const parentTaskIds = tasks.filter((t) => !t.deleted && tasks.some((c) => !c.deleted && c.parentId === t.id)).map((t) => t.id);
  // 稲妻線: 見えている行ごとに、今日の線からの位置を決める (点のない行〔親など〕は、今日の線の上を縦に通す)
  const boltRows: { xs: number[]; flat: boolean[] } = (() => {
    if (!g) return { xs: [], flat: [] };
    const parentIds = new Set(tasks.filter((t) => !t.deleted && t.parentId).map((t) => t.parentId as string));
    const at = new Map(lightning(g, today, 3, (id) => parentIds.has(id)).map((p) => [g.rows[p.row].task.id, p.x]));
    return boltXsFor(rows.map(({ task }) => task.id), at, pct(g, today));
  })();
  const byId = new Map(tasks.map((t) => [t.id, t]));

  const add = (parentId: string | null, title: string, afterId?: string) => {
    const parent = parentId ? byId.get(parentId) : null;
    const depth = (parent ? parent.depth + 1 : 1) as 1 | 2 | 3;
    if (depth > 3) return;
    const id = newTaskId(teamId);
    const order = afterId ? orderAfter(tasks, afterId) : appendOrder(tasks, parentId);
    setFocusId(afterId ? id : null);
    // 「タスク名 @〇〇 〜10/30」のように書くと、担当と期限も一緒に決まる
    const q = title ? parseQuickAdd(title, members, jstDate()) : { title, assignees: [], endDate: null };
    return run(() => createTasks(teamId, actor, [{ id, parentId, depth, title: q.title, detail: '', order, assignees: q.assignees, endDate: q.endDate }]));
  };

  const paste = (parentId: string | null, text: string) => {
    const parent = parentId ? byId.get(parentId) : null;
    const base = Math.min((parent ? parent.depth + 1 : 1), 3) as 1 | 2 | 3;
    const { created } = planImport(tasks, parseOutline(text, base), () => newTaskId(teamId), base, parentId, false);
    if (created.length) return run(() => createTasks(teamId, actor, created));
  };

  const remove = (t: Task) => {
    const ids = [t.id, ...descendantsOf(tasks, t.id).filter((d) => !d.deleted).map((d) => d.id)];
    run(() => setDeleted(teamId, actor, ids, true)).then(() =>
      setToast({
        message: `「${t.title}」${ids.length > 1 ? `ほか${ids.length - 1}件` : ''}を削除しました`,
        action: { label: '元に戻す', run: () => run(() => setDeleted(teamId, actor, ids, false)) },
      }));
  };

  const restore = (t: Task) => {
    const ids = [t.id, ...descendantsOf(tasks, t.id).filter((d) => d.deleted).map((d) => d.id)];
    run(() => setDeleted(teamId, actor, ids, false));
  };

  const patch = (plan: ReturnType<typeof planIndent>) => plan && run(() => applyPatches(teamId, actor, plan));
  // 子にする (Tab)。できないときは、理由を出す
  const indent = (t: Task) => {
    const plan = planIndent(tasks, t.id);
    if (plan) { patch(plan); return; }
    const first = childrenOf(tasks, t.parentId)[0]?.id === t.id;
    setErr(first ? '子にできません。直前のタスクがないので、いちばん上のタスクです' : '階層は3つまでです(大項目 → 中項目 → 小項目)');
  };
  const trash = tasks.filter((t) => t.deleted && !(t.parentId && byId.get(t.parentId)?.deleted));
  const orphans = orphansOf(tasks);
  const ro = useReadOnly(); // 閲覧専用の教員は、編集できない
  const canEdit = !ro && (actor === 'teacher' || editMode);
  // 稲妻線の、その行ぶんの折れ線 (点のない行〔親〕は、今日の線の上を縦に通す。葉の行は、隣が親なら、今日の線から折れ始める)
  const boltPointsAt = (ri: number): string => {
    const { xs, flat } = boltRows, tx = todayX;
    if (flat[ri]) return `${tx},0 ${tx},100`;
    const x = xs[ri];
    const prev = ri > 0 && !flat[ri - 1] ? (xs[ri - 1] + x) / 2 : tx;
    const next = ri < xs.length - 1 && !flat[ri + 1] ? (x + xs[ri + 1]) / 2 : tx;
    return `${prev},0 ${x},50 ${next},100`;
  };
  // 行の部品 (memo) に渡す操作。部品には、いつも同じ入れ物 (act) を渡して、中身は、描画のたびに最新にする
  act.current = {
    toggleCollapse: (id) => setCollapsed((c) => { const n = new Set(c); if (n.has(id)) n.delete(id); else n.add(id); return n; }),
    clearFocus: () => setFocusId(null),
    saveTitle: (t, title) => run(() => updateTask(teamId, actor, t.id, { title })),
    enter: (t) => add(t.parentId, '', t.id),
    indent, outdent: (t) => patch(planOutdent(tasks, t.id)), move: (t, d) => patch(planMove(tasks, t.id, d)),
    toggleOpen: (id) => setOpenId(openId === id ? null : id),
    setStatus: (t, next) => {
      const parents = newlyCompletedParents(tasks, t.id, next);
      run(() => updateTask(teamId, actor, t.id, { status: next })).then((ok) => {
        if (ok && next === 'done' && t.status !== 'done') {
          const p = overallProgress(tasks);
          celebrate(parents.length > 0 ? say.taskDone(parents[0].title, 0, 0) : say.taskDone(null, Math.min(p.total, p.done + 1), p.total));
        }
      });
    },
    togglePop: (id, kind) => setPop(pop?.id === id && pop.kind === kind ? null : { id, kind }),
    closePop: () => setPop(null),
    toggleAssignee: (t, sid) => run(() => updateTaskArray(teamId, actor, t.id, 'assignees', t.assignees.includes(sid) ? 'remove' : 'add', sid)),
    setDates: (t, changes) => run(() => updateTask(teamId, actor, t.id, changes)),
    addChild: (id) => setAddingUnder(id),
    detailAssignee: (t, sid, addIt) => run(() => updateTaskArray(teamId, actor, t.id, 'assignees', addIt ? 'add' : 'remove', sid)),
    reparent: (t, pid) => { const plan = planReparent(tasks, t.id, pid); if (plan) patch(plan); else setErr('その場所には移せません(階層は3つまでです)'); },
    remove,
    add: (parentId, title) => add(parentId, title),
    paste: (parentId, text) => paste(parentId, text),
    cancelAdd: () => setAddingUnder(null),
  };

  return (
    <div className={`wbs${g ? ' with-timeline' : ''}`}>
      {err && <p className="error">{err}</p>}
      {actor !== 'teacher' && (
        <div className="row wbs-mode">
          <button type="button" className={editMode ? '' : 'ghost'} aria-pressed={editMode} onClick={() => { setEditMode(!editMode); setPop(null); setOpenId(null); setAddingUnder(null); }}>
            {editMode ? '編集モードを終える' : '編集モードにする'}
          </button>
          <span className="hint">{editMode ? '編集できます。終わったら「編集モードを終える」を押します。' : '閲覧モードです。タスクの追加・担当・期間・状態を変えるときは、「編集モードにする」を押します。'}</span>
        </div>
      )}
      {g && rows.length > 0 && (
        <label className="check wbs-bolt-toggle"><input type="checkbox" checked={bolt} onChange={(e) => setBolt(e.target.checked)} />稲妻線を表示する<span className="hint">(今日の線より左は、予定の期間に入っているのに未着手、または終了予定日を過ぎても完了していない、右は、予定より早く着手・完了したタスク)</span></label>
      )}
      {tasks.some((t) => !t.deleted) && (
        <div className="row wbs-tools">
          {actor !== 'teacher' && (
            <label className="check"><input type="checkbox" checked={onlyMine} onChange={(e) => setOnlyMine(e.target.checked)} />自分の担当だけ</label>
          )}
          <label className="check"><input type="checkbox" checked={onlyFree} onChange={(e) => setOnlyFree(e.target.checked)} />担当が決まっていない項目だけ</label>
          <button type="button" className="ghost" onClick={() => setCollapsed(new Set(parentTaskIds))}>すべて閉じる</button>
          <button type="button" className="ghost" onClick={() => setCollapsed(new Set())}>すべて開く</button>
        </div>
      )}
      {orphans.length > 0 && canEdit && (
        <div className="card orphan" role="alert">
          <strong>行き場がなくなったタスクがあります</strong>
          <p className="hint">
            誰かが親のタスクを削除している間に、別の人がその下にタスクを追加すると、こうなります。
            最上位に移して続けるか、削除してください(親をゴミ箱から元に戻すと、元の場所に戻ります)。
          </p>
          {orphans.map((t) => (
            <div key={t.id} className="trash-row">
              <span><strong>{t.title}</strong> <span className="hint">(「{byId.get(t.parentId ?? '')?.title ?? '不明'}」の下にあったタスク)</span></span>
              <button className="ghost" onClick={() => patch(planRescue(tasks, t.id))}>最上位に移す</button>
              <button className="ghost danger" onClick={() => remove(t)}>削除</button>
            </div>
          ))}
        </div>
      )}
      {rows.length === 0 && orphans.length === 0 && mineIds && !freeIds && <p className="hint">あなたが担当のタスクは、まだありません。「自分の担当だけ」を外すと、すべて見られます。</p>}
      {rows.length === 0 && orphans.length === 0 && freeIds && <p className="ok">担当が決まっていない項目は、ありません。</p>}
      {rows.length === 0 && orphans.length === 0 && !mineIds && !freeIds && <p className="hint">タスクはまだありません。下の入力欄に書いて Enter で追加できます。</p>}

      {rows.length > 0 && (
        <div className="wbs-head" aria-hidden="true"><div>タスク<span className="h2">・担当</span></div><div className="h-st"><span className="h1">状態</span><span className="h2">期間・状態</span></div><div className="h-as">担当</div><div className="h-pe">期間</div>{g && <div className="w-bar tl-head">{ticks.map((d, i) => i % 2 === 0 && <span key={d} style={{ left: `${pct(g, d)}%` }}>{shortDate(d)}</span>)}</div>}<div /></div>
      )}
      {rows.length > 0 && g && (milestones ?? []).length > 0 && (() => {
        const ms = placeMilestones(milestones ?? [], g, 500, 12);
        return (
          <div className="wbs-ms-row">
            <button type="button" className="ms-label ghost" aria-expanded={msOpen} onClick={() => setMsOpen((v) => !v)}>{msOpen ? '▾' : '▸'} ◆ マイルストーン({(milestones ?? []).length})</button>
            {msOpen && <div className="ms-track" style={{ height: ms.lanes * 18 + 4 }}>
              {(milestones ?? []).map((m) => {
                const pl = ms.places.find((p) => p.id === m.id)!;
                return (
                  <span key={m.id} className={`gantt-ms ${pl.align === 'right' ? 'r' : ''}`}
                    style={{ top: pl.lane * 18, ...(pl.align === 'left' ? { left: `${pct(g, m.date)}%` } : { right: `${100 - pct(g, m.date)}%` }) }}
                    title={`${formatDate(m.date)} ${m.title}`}>◆<small>{m.title}</small></span>
                );
              })}
            </div>}
          </div>
        );
      })()}
      {rows.map(({ task: t, hasChildren }, ri) => {
        const pr = periodFor(t);
        return (
          <WbsRowView
            key={t.id} t={t} hasChildren={hasChildren} status={eff.get(t.id) ?? t.status}
            collapsed={collapsed.has(t.id)} isOpen={openId === t.id} focus={focusId === t.id}
            pop={pop?.id === t.id ? pop.kind : null} adding={canEdit && addingUnder === t.id} canEdit={canEdit}
            by={nameOf(t.updatedBy)} assignText={t.assignees.length > 0 ? t.assignees.map(nameOf).join('・') : ''}
            progress={hasChildren ? progressOf(tasks, t.id) : null}
            pStart={pr.start} pEnd={pr.end} pDerived={pr.derived}
            timeline={!!g} ticks={ticks} tickLefts={tickLefts} todayX={todayX} today={today} boltPts={bolt && g ? boltPointsAt(ri) : null}
            barLeft={g && (pr.start ?? pr.end) ? `${pct(g, (pr.start ?? pr.end) as string)}%` : null}
            barWidth={g && (pr.start ?? pr.end) ? `max(6px, ${pct(g, addDays((pr.end ?? pr.start) as string, 1)) - pct(g, (pr.start ?? pr.end) as string)}%)` : null}
            members={members} nameOf={nameOf} detailTasks={openId === t.id ? tasks : null} act={act}
          />
        );
      })}

      {canEdit && <div className="wbs-add depth-1">
        <AddBox
          placeholder="タスクを追加 (Enterで追加。例: ログイン画面を作る @〇〇 〜11/30)"
          onAdd={(title) => add(null, title)}
          onPaste={(text) => paste(null, text)}
        />
      </div>}

      {canEdit && trash.length > 0 && (
        <div className="trash">
          <button className="ghost" onClick={() => setShowTrash(!showTrash)}>ゴミ箱 ({trash.length})</button>
          {showTrash && trash.map((t) => (
            <div key={t.id} className="trash-row">
              <span>{t.title}</span>
              <button className="ghost" onClick={() => restore(t)}>元に戻す</button>
            </div>
          ))}
        </div>
      )}
      <Toast toast={toast} onClose={closeToast} />
    </div>
  );
}

type RowActions = {
  toggleCollapse: (id: string) => void; clearFocus: () => void; saveTitle: (t: Task, title: string) => unknown;
  enter: (t: Task) => void; indent: (t: Task) => void; outdent: (t: Task) => void; move: (t: Task, d: -1 | 1) => void;
  toggleOpen: (id: string) => void; setStatus: (t: Task, next: TaskStatus) => void;
  togglePop: (id: string, kind: 'assign' | 'period') => void; closePop: () => void;
  toggleAssignee: (t: Task, sid: string) => unknown; setDates: (t: Task, changes: Partial<Task>) => unknown;
  addChild: (id: string) => void; detailAssignee: (t: Task, sid: string, add: boolean) => unknown;
  reparent: (t: Task, pid: string | null) => void; remove: (t: Task) => void;
  add: (parentId: string | null, title: string) => unknown; paste: (parentId: string | null, text: string) => unknown; cancelAdd: () => void;
};

type RowProps = {
  t: Task; hasChildren: boolean; status: TaskStatus; collapsed: boolean; isOpen: boolean; focus: boolean;
  pop: 'assign' | 'period' | null; adding: boolean; canEdit: boolean; by: string; assignText: string;
  progress: { done: number; total: number } | null; pStart: string | null; pEnd: string | null; pDerived: boolean;
  timeline: boolean; ticks: string[]; tickLefts: string[]; todayX: number; today: string; boltPts: string | null; barLeft: string | null; barWidth: string | null;
  members: Member[]; nameOf: (sid: string) => string; detailTasks: Task[] | null; act: React.MutableRefObject<RowActions>;
};

/**
 * WBSの1行。memo にして、その行のデータが変わらないかぎり、描き直さない
 * (項目が多いと、詳細の開閉・入力のたびに全行を描き直す動きが、もたつきになるため)。
 * タスク t は、保存のたびに updatedAt が変わるので、それで同じかどうかを見る (Firestore の読み取りのたびに、オブジェクトは作り直される)。
 */
const WbsRowView = memo(function WbsRowView(p: RowProps) {
  const { t, hasChildren, status, collapsed, isOpen, canEdit, act } = p;
  const A = () => act.current;
  const periodText = periodLabel(p.pStart, p.pEnd);
  const a = p.pStart ?? p.pEnd, b = p.pEnd ?? p.pStart;
  const overdue = !!b && b < p.today && status !== 'done' && status !== 'hold';
  return (
    <div>
      <div className={`wbs-row depth-${t.depth} st-${status}`}>
        <div className="w-title">
          <button
            className="ghost icon" aria-label={collapsed ? '開く' : '閉じる'}
            style={{ visibility: hasChildren ? 'visible' : 'hidden' }} onClick={() => A().toggleCollapse(t.id)}
          >{collapsed ? '▸' : '▾'}</button>
          <TitleInput
            task={t} by={p.by} autoFocus={p.focus} onFocused={() => A().clearFocus()}
            onSave={(title) => A().saveTitle(t, title)} onEnter={() => A().enter(t)} onIndent={() => A().indent(t)}
            onOutdent={() => A().outdent(t)} onMove={(d) => A().move(t, d)} readOnly={!canEdit}
          />
          <button
            type="button" className={`ghost detail-btn${isOpen ? ' on' : ''}`} aria-label="詳細" aria-expanded={isOpen}
            title={canEdit ? 'タスクの詳細を開く' : 'タスクの詳細を見る'} onClick={() => A().toggleOpen(t.id)}
          >詳細 {isOpen ? '▴' : '▾'}</button>
          {t.source === 'adhoc' && <span className="badge adhoc" title="作業ログで「WBSにない作業」として追加された作業です。正しい場所に移してください">後追い</span>}
        </div>
        <div className="w-status">
          {hasChildren ? (
            // 親タスクの状態は、子タスクから自動で決まる (自分では変えられない)
            <>
              <span className={`status-auto st-${status}`} title="子タスクの状態から、自動で決まります" aria-label="状態(自動)">{STATUS_LABEL[status]}</span>
              {p.progress && <small className="w-count" title={`${p.progress.done}/${p.progress.total} 完了`}>{p.progress.done}/{p.progress.total}</small>}
            </>
          ) : !canEdit ? (
            // 閲覧モードでは、見るだけ。状態は、作業ログで更新するのが基本 (間違いは、編集モードで直せる)
            <span className={`status-ro st-${t.status}`} title="状態は、作業ログを出すと更新されます" aria-label="状態(閲覧モード)">{STATUS_LABEL[t.status]}</span>
          ) : (
            <select className={`status st-${t.status}`} value={t.status} aria-label="状態" onChange={(e) => A().setStatus(t, e.target.value as TaskStatus)}>
              {(Object.keys(STATUS_LABEL) as TaskStatus[]).map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
            </select>
          )}
        </div>
        <div className="w-assign">
          {hasChildren ? null : !canEdit ? (p.assignText || '—') : (
            <PopCell
              label={p.assignText || '＋ 担当'} empty={t.assignees.length === 0}
              ariaLabel={`担当を変える: ${t.title}`} open={p.pop === 'assign'}
              onToggle={() => A().togglePop(t.id, 'assign')} onClose={() => A().closePop()}
            >
              <div className="pop-title">担当(タップで切り替え)</div>
              <div className="chips">
                {p.members.map((m) => (
                  <button
                    key={m.sid} type="button" className={`chip-btn ${t.assignees.includes(m.sid) ? 'on' : ''}`} aria-pressed={t.assignees.includes(m.sid)}
                    onClick={() => A().toggleAssignee(t, m.sid)}
                  >{t.assignees.includes(m.sid) ? '✓ ' : ''}{m.name}</button>
                ))}
              </div>
            </PopCell>
          )}
        </div>
        <div className={`w-period${p.pDerived ? ' derived' : ''}`}>
          {hasChildren || !canEdit ? (periodText || '—') : (
            <PopCell
              label={periodLabel(t.startDate, t.endDate) || '＋ 期間'} empty={!t.startDate && !t.endDate}
              ariaLabel={`期間を変える: ${t.title}`} open={p.pop === 'period'}
              onToggle={() => A().togglePop(t.id, 'period')} onClose={() => A().closePop()}
            >
              <div className="pop-title">期間</div>
              <div className="pop-dates">
                <label>開始日<input type="date" value={t.startDate ?? ''} onChange={(e) => A().setDates(t, nextDates(t, 'startDate', e.target.value))} /></label>
                <label>終了日<input type="date" value={t.endDate ?? ''} onChange={(e) => A().setDates(t, nextDates(t, 'endDate', e.target.value))} /></label>
              </div>
              <div className="pop-title">かんたん設定(開始日から)</div>
              <div className="chips">
                {[[1, '1日'], [3, '3日間'], [7, '1週間'], [14, '2週間']].map(([n, label]) => (
                  <button
                    key={n} type="button" className="chip-btn"
                    onClick={() => { const s = t.startDate ?? jstDate(); A().setDates(t, { startDate: s, endDate: addDays(s, Number(n) - 1) }); }}
                  >{label}</button>
                ))}
                <button type="button" className="chip-btn" onClick={() => A().setDates(t, { startDate: null, endDate: null })}>クリア</button>
              </div>
            </PopCell>
          )}
        </div>
        {p.timeline && (
          <div className="w-bar" aria-hidden="true">
            {p.ticks.map((d, ti) => <i key={d} className="gantt-grid" style={{ left: p.tickLefts[ti] }} />)}
            <i className="tl-today" style={{ left: `${p.todayX}%` }} />
            {p.boltPts && (
              <svg className="wbs-bolt" viewBox="0 0 100 100" preserveAspectRatio="none">
                <polyline points={p.boltPts} fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
              </svg>
            )}
            {a && b && p.barLeft && p.barWidth && (
              <span
                className={`gantt-bar ${status}${p.pDerived ? ' derived' : ''}${overdue ? ' overdue' : ''}`}
                style={{ left: p.barLeft, width: p.barWidth }}
                title={`${t.title}: ${periodLabel(a, b)} / ${STATUS_LABEL[status]}${overdue ? ' / 期限超過' : ''}`}
              />
            )}
          </div>
        )}
        <div className="w-acts">
          {canEdit && t.depth < 3 && (
            <button className="ghost icon" aria-label="子タスクを追加" title="子タスクを追加" onClick={() => A().addChild(t.id)}>＋</button>
          )}
        </div>
      </div>

      {isOpen && p.detailTasks && (
        <fieldset disabled={!canEdit} className="detail-fs">
          <Detail
            task={t} members={p.members} nameOf={p.nameOf} isParent={hasChildren}
            onChange={(changes) => A().setDates(t, changes)}
            onAssignee={(sid, addIt) => A().detailAssignee(t, sid, addIt)}
            onIndent={() => A().indent(t)} onOutdent={() => A().outdent(t)} onMove={(d) => A().move(t, d)}
            parentOptions={parentChoices(p.detailTasks, t.id)}
            onReparent={(pid) => A().reparent(t, pid)}
            onDelete={() => A().remove(t)}
          />
        </fieldset>
      )}

      {p.adding && (
        <div className={`wbs-add depth-${Math.min(t.depth + 1, 3)}`}>
          <AddBox
            autoFocus placeholder={`「${t.title}」の下に追加 (Enterで追加、Escで閉じる)`}
            onAdd={(title) => A().add(t.id, title)} onPaste={(text) => A().paste(t.id, text)} onCancel={() => A().cancelAdd()}
          />
        </div>
      )}
    </div>
  );
}, (x, y) => {
  // タスクは、保存のたびに updatedAt が変わる。それ以外の値は、そのまま比べる
  for (const k of Object.keys(x) as (keyof RowProps)[]) {
    if (k === 't') { if (x.t.id !== y.t.id || x.t.updatedAt !== y.t.updatedAt || x.t.deleted !== y.t.deleted) return false; continue; }
    if (k === 'ticks' || k === 'tickLefts') { if (x[k].length === y[k].length && x[k].every((v, i) => v === y[k][i])) continue; return false; }
    if (!Object.is(x[k], y[k])) {
      // progress は、オブジェクトを毎回作るので、中身で比べる
      if (k === 'progress' && x.progress && y.progress && x.progress.done === y.progress.done && x.progress.total === y.progress.total) continue;
      return false;
    }
  }
  return true;
});

/** 行の中の、押すと小さな入力欄が開くセル (担当・期間)。外を押す・Esc で閉じる。 */
function PopCell({ label, empty, ariaLabel, open, onToggle, onClose, children }: {
  label: string; empty: boolean; ariaLabel: string; open: boolean; onToggle: () => void; onClose: () => void; children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const down = (e: PointerEvent) => { if (!ref.current?.contains(e.target as Node)) onClose(); };
    const key = (e: globalThis.KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('pointerdown', down);
    document.addEventListener('keydown', key);
    return () => { document.removeEventListener('pointerdown', down); document.removeEventListener('keydown', key); };
  }, [open, onClose]);
  return (
    <div className="pop-wrap" ref={ref}>
      <button type="button" className={`pop-btn ${empty ? 'empty' : ''}`} aria-label={ariaLabel} aria-expanded={open} onClick={onToggle}>{label}</button>
      {open && <div className="popover" role="dialog">{children}</div>}
    </div>
  );
}

function AddBox({ placeholder, onAdd, onPaste, onCancel, autoFocus }: {
  placeholder: string;
  onAdd: (title: string) => void;
  onPaste: (text: string) => void;
  onCancel?: () => void;
  autoFocus?: boolean;
}) {
  const [v, setV] = useState('');
  const key = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.nativeEvent.isComposing && v.trim()) { onAdd(v.trim()); setV(''); }
    if (e.key === 'Escape') onCancel?.();
  };
  const paste = (e: ClipboardEvent<HTMLInputElement>) => {
    const text = e.clipboardData.getData('text');
    if (text.includes('\n')) { e.preventDefault(); onPaste(text); setV(''); }
  };
  return (
    <div className="addbox">
      <input
        className="add-input" value={v} placeholder={placeholder} autoFocus={autoFocus}
        maxLength={200} onChange={(e) => setV(e.target.value)} onKeyDown={key} onPaste={paste}
      />
      {/* 入力欄は、他の行を操作しても勝手に閉じない (閉じると画面がずれて、押したボタンが空振りする) */}
      {onCancel && <button className="ghost icon" aria-label="入力欄を閉じる" onClick={onCancel}>×</button>}
    </div>
  );
}

function ConflictNotice({ by, what, theirs, onMine, onTheirs }: {
  by: string; what: string; theirs: string; onMine: () => void; onTheirs: () => void;
}) {
  const short = theirs.length > 40 ? `${theirs.slice(0, 40)}…` : theirs;
  return (
    <div className="conflict" role="alert">
      <span>{by}さんが先に{what}を「{short || '(空)'}」に変更しました。どちらにしますか?</span>
      <button className="ghost" onClick={onMine}>自分の内容にする</button>
      <button className="ghost" onClick={onTheirs}>{by}さんの内容にする</button>
    </div>
  );
}

function TitleInput({ task, by, autoFocus, onFocused, onSave, onEnter, onIndent, onOutdent, onMove, readOnly = false }: {
  readOnly?: boolean;
  task: Task;
  by: string;
  autoFocus: boolean;
  onFocused: () => void;
  onSave: (title: string) => void;
  onEnter: () => void;
  onIndent: () => void;
  onOutdent: () => void;
  onMove: (dir: -1 | 1) => void;
}) {
  const ed = useEditableText(task.title, onSave);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (autoFocus) { ref.current?.focus(); onFocused(); }
  }, [autoFocus, onFocused]);

  const key = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.nativeEvent.isComposing) return;
    if (e.key === 'Enter') { ed.commit(); onEnter(); }
    else if (e.key === 'Tab') { e.preventDefault(); ed.commit(); if (e.shiftKey) onOutdent(); else onIndent(); }
    else if (e.altKey && e.key === 'ArrowUp') { e.preventDefault(); onMove(-1); }
    else if (e.altKey && e.key === 'ArrowDown') { e.preventDefault(); onMove(1); }
  };
  return (
    <>
      <input
        ref={ref} className="title-input" value={ed.value} maxLength={200} aria-label="タイトル" title={ed.value} readOnly={readOnly}
        onChange={(e) => ed.setValue(e.target.value)} onFocus={ed.onFocus} onBlur={ed.commit} onKeyDown={key}
      />
      {ed.conflict !== null && (
        <ConflictNotice by={by} what="タスク名" theirs={ed.conflict} onMine={ed.resolveMine} onTheirs={ed.resolveTheirs} />
      )}
    </>
  );
}

function Detail({ task: t, members, nameOf, isParent, onChange, onAssignee, onIndent, onOutdent, onMove, onDelete, parentOptions, onReparent }: {
  task: Task;
  members: Member[];
  nameOf: (sid: string) => string;
  isParent: boolean;
  onChange: (changes: Partial<Omit<Task, 'id'>>) => void;
  onAssignee: (sid: string, add: boolean) => void;
  onIndent: () => void;
  onOutdent: () => void;
  onMove: (dir: -1 | 1) => void;
  onDelete: () => void;
  parentOptions: { id: string | null; label: string; current: boolean }[];
  onReparent: (parentId: string | null) => void;
}) {
  const ed = useEditableText(t.detail, (detail) => onChange({ detail }), { trim: false, allowEmpty: true });

  const toggle = (sid: string) => onAssignee(sid, !t.assignees.includes(sid));

  return (
    <div className={`detail depth-${t.depth}`}>
      <label>詳細
        <MdTextarea
          rows={4} maxLength={5000} value={ed.value} placeholder="やること・できあがりの目安・メモ"
          onChange={(e) => ed.setValue(e.target.value)} onFocus={ed.onFocus} onBlur={ed.commit}
        />
      </label>
      {ed.conflict !== null && (
        <ConflictNotice by={nameOf(t.updatedBy)} what="詳細" theirs={ed.conflict} onMine={ed.resolveMine} onTheirs={ed.resolveTheirs} />
      )}
      <div className="detail-grid">
        <label>開始日
          <input type="date" value={t.startDate ?? ''} onChange={(e) => onChange({ startDate: e.target.value || null })} />
        </label>
        <label>終了日
          <input type="date" value={t.endDate ?? ''} onChange={(e) => onChange({ endDate: e.target.value || null })} />
        </label>
      </div>
      {isParent ? (
        <p className="hint">親タスクには、担当を付けません。担当は子タスクに付けます。状態も、子タスクから自動で決まります。</p>
      ) : (
      <div>
        <div className="label">担当 (複数可・空欄でもよい)</div>
        <div className="chips">
          {members.map((m) => (
            <label key={m.sid} className={`chip ${t.assignees.includes(m.sid) ? 'on' : ''}`}>
              <input type="checkbox" checked={t.assignees.includes(m.sid)} onChange={() => toggle(m.sid)} />
              {m.name}
            </label>
          ))}
        </div>
      </div>
      )}
      <label className="detail-parent">親タスク
        <select aria-label={`${t.title}の親タスク`} value={t.parentId ?? ''} onChange={(e) => onReparent(e.target.value || null)}>
          {parentOptions.map((o) => <option key={o.id ?? 'root'} value={o.id ?? ''}>{o.label}</option>)}
        </select>
        <span className="hint">選ぶと、このタスクと、その下のタスクが移ります。移し先の最後に入ります(階層は3つまで)</span>
      </label>
      <div className="row actions">
        <button className="ghost" onClick={() => onMove(-1)}>↑</button>
        <button className="ghost" onClick={() => onMove(1)}>↓</button>
        <button className="ghost" onClick={onOutdent}>← 階層を上げる</button>
        <button className="ghost" onClick={onIndent}>→ 階層を下げる</button>
        <span className="spacer" />
        <button className="ghost danger" onClick={onDelete}>削除</button>
      </div>
      <small className="hint">
        作成: {nameOf(t.createdBy)} ／ 最終更新: {nameOf(t.updatedBy)} {new Date(t.updatedAt).toLocaleString('ja-JP')}
      </small>
    </div>
  );
}
