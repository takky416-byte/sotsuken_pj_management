import { useCallback, useEffect, useMemo, useRef, useState, type ClipboardEvent, type KeyboardEvent } from 'react';
import { STATUS_LABEL, type Member, type Task, type TaskStatus } from '../types';
import {
  applyPatches, createTasks, newTaskId, setDeleted, updateTask, useTasks,
} from '../data/tasks';
import { isHttpUrl } from '../data/util';
import { planImport } from '../lib/importPlan';
import { parseOutline } from '../lib/outline';
import {
  appendOrder, descendantsOf, flatten, orderAfter, planIndent, planMove, planOutdent, progressOf,
} from '../lib/wbs';
import { formatDate } from '../lib/dates';
import { Progress } from './Progress';
import { Toast, type ToastState } from './Toast';

type Props = { teamId: string; actor: string; members: Member[] };

export function WbsEditor({ teamId, actor, members }: Props) {
  const { data: tasks, error } = useTasks(teamId);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [openId, setOpenId] = useState<string | null>(null);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [addingUnder, setAddingUnder] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastState>(null);
  const [showTrash, setShowTrash] = useState(false);
  const [err, setErr] = useState('');
  const closeToast = useCallback(() => setToast(null), []);

  const nameOf = useMemo(() => {
    const m = new Map(members.map((x) => [x.sid, x.name]));
    return (sid: string) => (sid === 'teacher' ? '教員' : m.get(sid) ?? sid);
  }, [members]);

  const run = async (fn: () => Promise<unknown>) => {
    setErr('');
    try { await fn(); } catch (e) { setErr(`保存できませんでした: ${(e as Error).message}`); }
  };

  if (error) return <p className="error">読み込めませんでした: {error}</p>;
  if (!tasks) return <p>読み込み中…</p>;

  const rows = flatten(tasks, collapsed);
  const byId = new Map(tasks.map((t) => [t.id, t]));

  const add = (parentId: string | null, title: string, afterId?: string) => {
    const parent = parentId ? byId.get(parentId) : null;
    const depth = (parent ? parent.depth + 1 : 1) as 1 | 2 | 3;
    if (depth > 3) return;
    const id = newTaskId(teamId);
    const order = afterId ? orderAfter(tasks, afterId) : appendOrder(tasks, parentId);
    setFocusId(afterId ? id : null);
    return run(() => createTasks(teamId, actor, [{ id, parentId, depth, title, detail: '', order }]));
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
  const trash = tasks.filter((t) => t.deleted && !(t.parentId && byId.get(t.parentId)?.deleted));

  return (
    <div className="wbs">
      {err && <p className="error">{err}</p>}
      {rows.length === 0 && <p className="hint">タスクはまだありません。下の入力欄に書いて Enter で追加できます。</p>}

      {rows.map(({ task: t, hasChildren }) => (
        <div key={t.id}>
          <div className={`wbs-row depth-${t.depth} st-${t.status}`}>
            <button
              className="ghost icon"
              aria-label={collapsed.has(t.id) ? '開く' : '閉じる'}
              style={{ visibility: hasChildren ? 'visible' : 'hidden' }}
              onClick={() => setCollapsed((s) => { const n = new Set(s); if (n.has(t.id)) n.delete(t.id); else n.add(t.id); return n; })}
            >{collapsed.has(t.id) ? '▸' : '▾'}</button>

            <TitleInput
              task={t}
              autoFocus={focusId === t.id}
              onFocused={() => setFocusId(null)}
              onSave={(title) => run(() => updateTask(teamId, actor, t.id, { title }))}
              onEnter={() => add(t.parentId, '', t.id)}
              onIndent={() => patch(planIndent(tasks, t.id))}
              onOutdent={() => patch(planOutdent(tasks, t.id))}
              onMove={(d) => patch(planMove(tasks, t.id, d))}
            />
            {t.source === 'draft' && <span className="badge" title="叩き台です。自由に変更してください">叩き台</span>}
            {hasChildren && <Progress {...progressOf(tasks, t.id)} />}

            <select
              className={`status st-${t.status}`}
              value={t.status}
              aria-label="状態"
              onChange={(e) => run(() => updateTask(teamId, actor, t.id, { status: e.target.value as TaskStatus }))}
            >
              {(Object.keys(STATUS_LABEL) as TaskStatus[]).map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
            </select>
            <span className="meta">
              {t.assignees.length > 0 && t.assignees.map(nameOf).join('・')}
              {t.endDate && ` 〜${formatDate(t.endDate)}`}
            </span>
            {t.depth < 3 && (
              <button className="ghost icon" aria-label="子タスクを追加" title="子タスクを追加" onClick={() => setAddingUnder(t.id)}>＋</button>
            )}
            <button className="ghost icon" aria-label="詳細" title="詳細" onClick={() => setOpenId(openId === t.id ? null : t.id)}>
              {openId === t.id ? '▲' : '⋯'}
            </button>
          </div>

          {openId === t.id && (
            <Detail
              task={t} members={members} nameOf={nameOf}
              onChange={(changes) => run(() => updateTask(teamId, actor, t.id, changes))}
              onIndent={() => patch(planIndent(tasks, t.id))}
              onOutdent={() => patch(planOutdent(tasks, t.id))}
              onMove={(d) => patch(planMove(tasks, t.id, d))}
              onDelete={() => remove(t)}
            />
          )}

          {addingUnder === t.id && (
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
      ))}

      <div className="wbs-add depth-1">
        <AddBox
          placeholder="タスクを追加 (Enterで追加。箇条書きを貼り付けると、まとめて追加できます)"
          onAdd={(title) => add(null, title)}
          onPaste={(text) => paste(null, text)}
        />
      </div>

      {trash.length > 0 && (
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

function TitleInput({ task, autoFocus, onFocused, onSave, onEnter, onIndent, onOutdent, onMove }: {
  task: Task;
  autoFocus: boolean;
  onFocused: () => void;
  onSave: (title: string) => void;
  onEnter: () => void;
  onIndent: () => void;
  onOutdent: () => void;
  onMove: (dir: -1 | 1) => void;
}) {
  const [v, setV] = useState(task.title);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => setV(task.title), [task.title]);
  useEffect(() => {
    if (autoFocus) { ref.current?.focus(); onFocused(); }
  }, [autoFocus, onFocused]);

  const commit = () => { const t = v.trim(); if (t && t !== task.title) onSave(t); else setV(task.title); };
  const key = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.nativeEvent.isComposing) return;
    if (e.key === 'Enter') { commit(); onEnter(); }
    else if (e.key === 'Tab') { e.preventDefault(); commit(); if (e.shiftKey) onOutdent(); else onIndent(); }
    else if (e.altKey && e.key === 'ArrowUp') { e.preventDefault(); onMove(-1); }
    else if (e.altKey && e.key === 'ArrowDown') { e.preventDefault(); onMove(1); }
  };
  return (
    <input
      ref={ref} className="title-input" value={v} maxLength={200} aria-label="タイトル"
      onChange={(e) => setV(e.target.value)} onBlur={commit} onKeyDown={key}
    />
  );
}

function Detail({ task: t, members, nameOf, onChange, onIndent, onOutdent, onMove, onDelete }: {
  task: Task;
  members: Member[];
  nameOf: (sid: string) => string;
  onChange: (changes: Partial<Omit<Task, 'id'>>) => void;
  onIndent: () => void;
  onOutdent: () => void;
  onMove: (dir: -1 | 1) => void;
  onDelete: () => void;
}) {
  const [detail, setDetail] = useState(t.detail);
  const [url, setUrl] = useState('');
  const [label, setLabel] = useState('');
  useEffect(() => setDetail(t.detail), [t.detail]);

  const toggle = (sid: string) =>
    onChange({ assignees: t.assignees.includes(sid) ? t.assignees.filter((x) => x !== sid) : [...t.assignees, sid] });
  const addLink = () => {
    if (!isHttpUrl(url)) return;
    onChange({ links: [...t.links, { url, label: label.trim() }] });
    setUrl(''); setLabel('');
  };

  return (
    <div className={`detail depth-${t.depth}`}>
      <label>詳細
        <textarea
          rows={4} maxLength={5000} value={detail} placeholder="やること・できあがりの目安・メモ"
          onChange={(e) => setDetail(e.target.value)}
          onBlur={() => detail !== t.detail && onChange({ detail })}
        />
      </label>
      <div className="detail-grid">
        <label>開始日
          <input type="date" value={t.startDate ?? ''} onChange={(e) => onChange({ startDate: e.target.value || null })} />
        </label>
        <label>終了日
          <input type="date" value={t.endDate ?? ''} onChange={(e) => onChange({ endDate: e.target.value || null })} />
        </label>
      </div>
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
      <div>
        <div className="label">リンク (Drive・GitHubなど)</div>
        {t.links.map((l, i) => (
          <div className="link-row" key={i}>
            <a href={l.url} target="_blank" rel="noreferrer noopener">{l.label || l.url}</a>
            <button className="ghost" onClick={() => onChange({ links: t.links.filter((_, j) => j !== i) })}>外す</button>
          </div>
        ))}
        <div className="row">
          <input placeholder="https://..." value={url} onChange={(e) => setUrl(e.target.value)} />
          <input placeholder="名前(任意)" value={label} maxLength={60} onChange={(e) => setLabel(e.target.value)} />
          <button className="ghost" disabled={!isHttpUrl(url)} onClick={addLink}>追加</button>
        </div>
      </div>
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
