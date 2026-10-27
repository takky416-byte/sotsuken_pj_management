import { useSearchParams } from 'react-router-dom';
import { useCallback, useEffect, useMemo, useRef, useState, type ClipboardEvent, type KeyboardEvent } from 'react';
import { STATUS_LABEL, type Member, type Task, type TaskStatus } from '../types';
import {
  applyPatches, createTasks, newTaskId, setDeleted, updateTask, updateTaskArray, useTasks,
} from '../data/tasks';
import { planImport } from '../lib/importPlan';
import { parseOutline } from '../lib/outline';
import {
  appendOrder, childrenOf, descendantsOf, effectiveStatuses, flatten, newlyCompletedParents, periodLabel, periodOf, orderAfter, orphansOf, ownedWithAncestors, unassignedWithAncestors, shortDate, overallProgress, planIndent, planMove, planOutdent, planRescue, progressOf,
} from '../lib/wbs';
import { celebrate } from '../lib/celebrate';
import { say } from '../lib/tone';
import { formatDate, jstDate } from '../lib/dates';
import { buildGantt, lightning, nextDates, pct, placeMilestones, weekTicks } from '../lib/gantt';
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

  const nameOf = useMemo(() => {
    const m = new Map(members.map((x) => [x.sid, x.name]));
    return (sid: string) => (sid === 'teacher' ? '教員' : m.get(sid) ?? sid);
  }, [members]);

  /** 保存できたら true */
  const run = async (fn: () => Promise<unknown>): Promise<boolean> => {
    setErr('');
    try { await fn(); return true; } catch (e) { setErr(`保存できませんでした: ${(e as Error).message}`); return false; }
  };

  if (error) return <p className="error">読み込めませんでした: {error}</p>;
  if (!tasks) return <p>読み込み中…</p>;
  const eff = effectiveStatuses(tasks);
  const today = jstDate();
  const g = timeline ? buildGantt(tasks, milestones ?? [], today, 3) : null;
  const ticks = g ? weekTicks(g) : [];

  const mineIds = actor !== 'teacher' && onlyMine ? ownedWithAncestors(tasks, actor) : null;
  const freeIds = onlyFree ? unassignedWithAncestors(tasks) : null;
  const rows = flatten(tasks, collapsed).filter((r) => (!mineIds || mineIds.has(r.task.id)) && (!freeIds || freeIds.has(r.task.id)));
  const parentTaskIds = tasks.filter((t) => !t.deleted && tasks.some((c) => !c.deleted && c.parentId === t.id)).map((t) => t.id);
  // 稲妻線: 見えている行ごとに、今日の線からの位置を決める (点のない行は、直前の位置を引きつぐ)
  const boltXs: number[] = (() => {
    if (!g) return [];
    const parentIds = new Set(tasks.filter((t) => !t.deleted && t.parentId).map((t) => t.parentId as string));
    const at = new Map(lightning(g, today, 3, (id) => parentIds.has(id)).map((p) => [g.rows[p.row].task.id, p.x]));
    let last = pct(g, today);
    return rows.map(({ task }) => { last = at.get(task.id) ?? last; return last; });
  })();
  const byId = new Map(tasks.map((t) => [t.id, t]));

  const add = (parentId: string | null, title: string, afterId?: string) => {
    const parent = parentId ? byId.get(parentId) : null;
    const depth = (parent ? parent.depth + 1 : 1) as 1 | 2 | 3;
    if (depth > 3) return;
    const id = newTaskId(teamId);
    const order = afterId ? orderAfter(tasks, afterId) : appendOrder(tasks, parentId);
    setFocusId(afterId ? id : null);
    // 「タスク名 @氷室 〜10/30」のように書くと、担当と期限も一緒に決まる
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
  const canEdit = actor === 'teacher' || editMode;

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
        <label className="check wbs-bolt-toggle"><input type="checkbox" checked={bolt} onChange={(e) => setBolt(e.target.checked)} />稲妻線を表示する<span className="hint">(今日の線より左は、予定の期間に入っているのに未着手、右は、予定より早く着手・完了したタスク)</span></label>
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
        const status = eff.get(t.id) ?? t.status;
        return (
        <div key={t.id}>
          <div className={`wbs-row depth-${t.depth} st-${status}`}>
            <div className="w-title">
              <button
                className="ghost icon"
                aria-label={collapsed.has(t.id) ? '開く' : '閉じる'}
                style={{ visibility: hasChildren ? 'visible' : 'hidden' }}
                onClick={() => setCollapsed((s) => { const n = new Set(s); if (n.has(t.id)) n.delete(t.id); else n.add(t.id); return n; })}
              >{collapsed.has(t.id) ? '▸' : '▾'}</button>
              <TitleInput
                task={t}
                by={nameOf(t.updatedBy)}
                autoFocus={focusId === t.id}
                onFocused={() => setFocusId(null)}
                onSave={(title) => run(() => updateTask(teamId, actor, t.id, { title }))}
                onEnter={() => add(t.parentId, '', t.id)}
                onIndent={() => indent(t)}
                onOutdent={() => patch(planOutdent(tasks, t.id))}
                onMove={(d) => patch(planMove(tasks, t.id, d))}
                readOnly={!canEdit}
              />
              <button
                type="button" className={`ghost detail-btn${openId === t.id ? ' on' : ''}`} aria-label="詳細" aria-expanded={openId === t.id}
                title={canEdit ? 'タスクの詳細を開く' : 'タスクの詳細を見る'} onClick={() => setOpenId(openId === t.id ? null : t.id)}
              >詳細 {openId === t.id ? '▴' : '▾'}</button>
              {t.source === 'adhoc' && <span className="badge adhoc" title="作業ログで「WBSにない作業」として追加された作業です。正しい場所に移してください">後追い</span>}
            </div>
            <div className="w-status">
              {hasChildren ? (
                // 親タスクの状態は、子タスクから自動で決まる (自分では変えられない)
                <>
                  <span className={`status-auto st-${status}`} title="子タスクの状態から、自動で決まります" aria-label="状態(自動)">{STATUS_LABEL[status]}</span>
                  {(() => { const pg = progressOf(tasks, t.id); return <small className="w-count" title={`${pg.done}/${pg.total} 完了`}>{pg.done}/{pg.total}</small>; })()}
                </>
              ) : !canEdit ? (
                // 閲覧モードでは、見るだけ。状態は、作業ログで更新するのが基本 (間違いは、編集モードで直せる)
                <span className={`status-ro st-${t.status}`} title="状態は、作業ログを出すと更新されます" aria-label="状態(閲覧モード)">{STATUS_LABEL[t.status]}</span>
              ) : (
                <select
                  className={`status st-${t.status}`}
                  value={t.status}
                  aria-label="状態"
                  onChange={(e) => {
                    const next = e.target.value as TaskStatus;
                    const parents = newlyCompletedParents(tasks, t.id, next);
                    run(() => updateTask(teamId, actor, t.id, { status: next })).then((ok) => {
                      if (ok && next === 'done' && t.status !== 'done') {
                        const p = overallProgress(tasks);
                        celebrate(parents.length > 0
                          ? say.taskDone(parents[0].title, 0, 0)
                          : say.taskDone(null, Math.min(p.total, p.done + 1), p.total));
                      }
                    });
                  }}
                >
                  {(Object.keys(STATUS_LABEL) as TaskStatus[]).map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
                </select>
              )}
            </div>
            <div className="w-assign">
              {hasChildren ? null : !canEdit ? (t.assignees.length > 0 ? t.assignees.map(nameOf).join('・') : '—') : (
                <PopCell
                  label={t.assignees.length > 0 ? t.assignees.map(nameOf).join('・') : '＋ 担当'} empty={t.assignees.length === 0}
                  ariaLabel={`担当を変える: ${t.title}`} open={pop?.id === t.id && pop.kind === 'assign'}
                  onToggle={() => setPop(pop?.id === t.id && pop.kind === 'assign' ? null : { id: t.id, kind: 'assign' })} onClose={() => setPop(null)}
                >
                  <div className="pop-title">担当(タップで切り替え)</div>
                  <div className="chips">
                    {members.map((m) => (
                      <button
                        key={m.sid} type="button" className={`chip-btn ${t.assignees.includes(m.sid) ? 'on' : ''}`} aria-pressed={t.assignees.includes(m.sid)}
                        onClick={() => run(() => updateTaskArray(teamId, actor, t.id, 'assignees', t.assignees.includes(m.sid) ? 'remove' : 'add', m.sid))}
                      >{t.assignees.includes(m.sid) ? '✓ ' : ''}{m.name}</button>
                    ))}
                  </div>
                </PopCell>
              )}
            </div>
            <div className={`w-period${periodOf(tasks, t).derived ? ' derived' : ''}`}>
              {hasChildren || !canEdit ? (periodLabel(periodOf(tasks, t).start, periodOf(tasks, t).end) || '—') : (
                <PopCell
                  label={periodLabel(t.startDate, t.endDate) || '＋ 期間'} empty={!t.startDate && !t.endDate}
                  ariaLabel={`期間を変える: ${t.title}`} open={pop?.id === t.id && pop.kind === 'period'}
                  onToggle={() => setPop(pop?.id === t.id && pop.kind === 'period' ? null : { id: t.id, kind: 'period' })} onClose={() => setPop(null)}
                >
                  <div className="pop-title">期間</div>
                  <div className="pop-dates">
                    <label>開始日<input type="date" value={t.startDate ?? ''} onChange={(e) => run(() => updateTask(teamId, actor, t.id, nextDates(t, 'startDate', e.target.value)))} /></label>
                    <label>終了日<input type="date" value={t.endDate ?? ''} onChange={(e) => run(() => updateTask(teamId, actor, t.id, nextDates(t, 'endDate', e.target.value)))} /></label>
                  </div>
                  <div className="pop-title">かんたん設定(開始日から)</div>
                  <div className="chips">
                    {[[1, '1日'], [3, '3日間'], [7, '1週間'], [14, '2週間']].map(([n, label]) => (
                      <button
                        key={n} type="button" className="chip-btn"
                        onClick={() => { const s = t.startDate ?? jstDate(); run(() => updateTask(teamId, actor, t.id, { startDate: s, endDate: addDays(s, Number(n) - 1) })); }}
                      >{label}</button>
                    ))}
                    <button type="button" className="chip-btn" onClick={() => run(() => updateTask(teamId, actor, t.id, { startDate: null, endDate: null }))}>クリア</button>
                  </div>
                </PopCell>
              )}
            </div>
            {g && (() => {
              const pr = periodOf(tasks, t);
              const a = pr.start ?? pr.end, b = pr.end ?? pr.start;
              const overdue = !!b && b < today && status !== 'done' && status !== 'hold';
              return (
                <div className="w-bar" aria-hidden="true">
                  {ticks.map((d) => <i key={d} className="gantt-grid" style={{ left: `${pct(g, d)}%` }} />)}
                  <i className="tl-today" style={{ left: `${pct(g, today)}%` }} />
                  {bolt && (() => {
                    const x = boltXs[ri], prev = ri > 0 ? boltXs[ri - 1] : pct(g, today), next = ri < boltXs.length - 1 ? boltXs[ri + 1] : pct(g, today);
                    return (
                      <svg className="wbs-bolt" viewBox="0 0 100 100" preserveAspectRatio="none">
                        <polyline points={`${(prev + x) / 2},0 ${x},50 ${(x + next) / 2},100`} fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
                      </svg>
                    );
                  })()}
                  {a && b && (
                    <span
                      className={`gantt-bar ${status}${pr.derived ? ' derived' : ''}${overdue ? ' overdue' : ''}`}
                      style={{ left: `${pct(g, a)}%`, width: `max(6px, ${pct(g, addDays(b, 1)) - pct(g, a)}%)` }}
                      title={`${t.title}: ${periodLabel(a, b)} / ${STATUS_LABEL[status]}${overdue ? ' / 期限超過' : ''}`}
                    />
                  )}
                </div>
              );
            })()}
            <div className="w-acts">
              {canEdit && t.depth < 3 && (
                <button className="ghost icon" aria-label="子タスクを追加" title="子タスクを追加" onClick={() => setAddingUnder(t.id)}>＋</button>
              )}
            </div>
          </div>

          {openId === t.id && (
            <fieldset disabled={!canEdit} className="detail-fs">
            <Detail
              task={t} members={members} nameOf={nameOf} isParent={hasChildren}
              onChange={(changes) => run(() => updateTask(teamId, actor, t.id, changes))}
              onAssignee={(sid, add) => run(() => updateTaskArray(teamId, actor, t.id, 'assignees', add ? 'add' : 'remove', sid))}
              onIndent={() => indent(t)}
              onOutdent={() => patch(planOutdent(tasks, t.id))}
              onMove={(d) => patch(planMove(tasks, t.id, d))}
              onDelete={() => remove(t)}
            />
            </fieldset>
          )}

          {canEdit && addingUnder === t.id && (
            <div className={`wbs-add depth-${Math.min(t.depth + 1, 3)}`}>
              <AddBox
                autoFocus
                placeholder={`「${t.title}」の下に追加 (Enterで追加、Escで閉じる)`}
                onAdd={(title) => add(t.id, title)}
                onPaste={(text) => paste(t.id, text)}
                onCancel={() => setAddingUnder(null)}
              />
            </div>
          )}
        </div>
        );
      })}

      {canEdit && <div className="wbs-add depth-1">
        <AddBox
          placeholder="タスクを追加 (Enterで追加。例: ログイン画面を作る @氷室 〜11/30)"
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

function Detail({ task: t, members, nameOf, isParent, onChange, onAssignee, onIndent, onOutdent, onMove, onDelete }: {
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
}) {
  const ed = useEditableText(t.detail, (detail) => onChange({ detail }), { trim: false, allowEmpty: true });

  const toggle = (sid: string) => onAssignee(sid, !t.assignees.includes(sid));

  return (
    <div className={`detail depth-${t.depth}`}>
      <label>詳細
        <textarea
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
