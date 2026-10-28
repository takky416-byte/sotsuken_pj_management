import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useBase } from '../../components/Base';
import { saveDaily } from '../../data/daily';
import { createTasks, newTaskId, setDeleted, updateTask, updateTaskArray } from '../../data/tasks';
import {
  FIXED_KINDS, MIN_NEXT_CHARS, MIN_NOTE_CHARS, RESULT_LABEL, charCount, statusOf, validateDaily,
  type Daily, type DailyKind, type DailyResult,
} from '../../lib/daily';
import {
  ADHOC_PREFIX, initialItems, itemsToEntries, kindItemId, newAssignments, nextCandidates, statusChanges, type DraftItem,
} from '../../lib/dailyDraft';
import { ADHOC_ROOT_ID, ADHOC_ROOT_TITLE, MIN_ADHOC_TITLE, adhocParents, planAdhoc } from '../../lib/adhoc';
import { formatDate } from '../../lib/dates';
import { flatten, periodLabel } from '../../lib/wbs';
import { TaskPicker } from '../../components/TaskPicker';
import type { Task } from '../../types';

const RESULTS: DailyResult[] = ['progress', 'done', 'stuck'];
const PLACEHOLDER: Record<DailyResult, string> = {
  progress: '何を、どこまでやった? 分かったことは?\n例: ER図の主なテーブルを3つ作った。ユーザーとイベントの関係で迷っている。',
  done: '何ができあがった? どう確かめた?\n例: ログイン画面を作り終えた。正しい/誤ったパスワードの両方で動くことを確認した。',
  stuck: 'どこで詰まった? 何を試した? チームの誰と相談して、どう進める?\n例: ツールの図形がそろわない。2通り試したが直らない。〇〇さんに聞いてみる。',
};
const KIND_PLACEHOLDER: Record<Exclude<DailyKind, 'task'>, string> = {
  study: '何を調べて、何が分かった?\n例: 認証の仕組みを調べて、セッションとトークンの違いが分かった。',
  discuss: '誰と何を話して、何が決まった?\n例: 〇〇さんと分担を話し合い、画面設計は私、DB設計は〇〇さんに決まった。',
  other: '何をした?',
};

/** 説明に足せる、ひとこと。押すだけで、説明の欄に入る (あとから書き換えられる) */
const PHRASES: Record<DailyResult, { label: string; text: string }[]> = {
  progress: [
    { label: 'まだ始めたばかり', text: 'まだ始めたばかり。' }, { label: '半分くらい', text: '半分くらいまで進んだ。' },
    { label: '8割くらい', text: '8割くらいまで進んだ。' }, { label: 'ほぼ終わり', text: 'ほぼ終わりまで進んだ。' },
  ],
  done: [
    { label: '動作を確認した', text: '動作を確認した。' }, { label: 'レビューしてもらった', text: 'チームにレビューしてもらった。' },
    { label: '共有した', text: '成果物をチームに共有した。' },
  ],
  stuck: [
    { label: 'やり方が分からない', text: 'やり方が分からない。' }, { label: '試したが直らない', text: '試したが直らない。' },
    { label: '誰かの作業待ち', text: '誰かの作業待ち。' }, { label: '時間が足りない', text: '時間が足りない。' },
  ],
};
const addPhrase = (note: string, text: string) => `${note}${note && !/\n$/.test(note) ? '\n' : ''}${text}`;

const draftKey = (sid: string, today: string) => `daily-draft:${sid}:${today}`;
type Draft = { items: { id: string; result: DailyResult | null; note: string; kind: DailyKind; adhoc?: DraftItem['adhoc'] }[]; next: string; removed?: string[] };
const loadDraft = (key: string): Draft | null => { try { const v = localStorage.getItem(key); return v ? (JSON.parse(v) as Draft) : null; } catch { return null; } };
const saveDraft = (key: string, d: Draft) => { try { localStorage.setItem(key, JSON.stringify(d)); } catch { /* 保存できなくても入力はできる */ } };
const clearDraft = (key: string) => { try { localStorage.removeItem(key); } catch { /* 何もしない */ } };

/**
 * 作業ログの入力。タスクごとのカードで「進んだ / 完了した / 詰まった」を押すと、そのカードが作業ログに入り、説明の欄が開く。
 * 説明は、何を・どこまでやったかを、一定の長さ以上で書く。最後に、次にやることも書く。
 * 入力の途中は、この端末に自動で保存する (画面を閉じても消えない)。
 */
export function DailyForm({ teamId, sid, today, prev, tasks, since, prevDate, onSubmitted }: {
  teamId: string; sid: string; today: string; prev: Daily | undefined; tasks: Task[]; since: number; prevDate: string | null;
  onSubmitted: (first: boolean) => void;
}) {
  const key = draftKey(sid, today);
  const base = useBase();
  const live = useMemo(() => tasks.filter((t) => !t.deleted), [tasks]);
  const [items, setItems] = useState<DraftItem[]>(() => {
    const base = initialItems(prev, tasks, sid, today, since);
    const d = prev ? null : loadDraft(key);
    if (!d) return base;
    // 下書きの内容を、いまのタスクの候補に重ねる (消えたタスクは捨てる)
    const saved = new Map(d.items.map((i) => [i.id, i]));
    const gone = new Set(d.removed ?? []);
    const merged = base.filter((i) => !gone.has(i.id)).map((i) => (saved.has(i.id) ? { ...i, result: saved.get(i.id)!.result, note: saved.get(i.id)!.note } : i));
    for (const i of d.items) if ((i.kind !== 'task' || i.adhoc) && !merged.some((m) => m.id === i.id)) merged.push({ id: i.id, kind: i.kind, result: i.result, note: i.note, ...(i.adhoc ? { adhoc: i.adhoc } : {}) });
    return merged;
  });
  const [removed, setRemoved] = useState<string[]>(() => (prev ? [] : loadDraft(key)?.removed ?? [])); // 作業ログから外したタスク (下書きにも残す)
  const [next, setNext] = useState(() => (prev ? prev.next ?? '' : loadDraft(key)?.next ?? ''));
  const [state, setState] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [err, setErr] = useState('');
  const [focusId, setFocusId] = useState<string | null>(null); // 結果を押したら、そのまま説明を書き始められるように
  const [touched, setTouched] = useState<Set<string>>(new Set()); // いちど書いて離れた欄
  const touch = (id: string) => setTouched((t) => (t.has(id) ? t : new Set(t).add(id)));
  const [shown, setShown] = useState(false); // 「提出する」を押してから、足りない点を赤く示す
  const [open, setOpen] = useState<Set<string>>(new Set()); // 詳細を開いているタスクのカード
  const toggleOpen = (id: string) => setOpen((o) => { const n = new Set(o); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  useEffect(() => { if (!prev) saveDraft(key, { items: items.map(({ id, result, note, kind, adhoc }) => ({ id, result, note, kind, ...(adhoc ? { adhoc } : {}) })), next, removed }); }, [items, next, removed, key, prev]);
  useEffect(() => setState('idle'), [items, next]);

  const title = (i: DraftItem) => (i.adhoc ? i.adhoc.title.trim() || 'WBSにない作業' : i.taskId ? live.find((t) => t.id === i.taskId)?.title ?? '(削除されたタスク)' : FIXED_KINDS.find((k) => k.kind === i.kind)?.label ?? '');
  const included = items.filter((i) => i.kind !== 'task' || i.result !== null);
  const entries = itemsToEntries(items);
  const adhocItems = items.filter((i) => i.adhoc && i.result !== null);
  const adhocTitle = (id?: string) => items.find((i) => i.id === id)?.adhoc?.title.trim();
  const problems = [
    ...adhocItems.filter((i) => charCount(i.adhoc!.title) < MIN_ADHOC_TITLE).map((i) => ({ key: `adhoc-title:${i.id}`, message: '「WBSにない作業」の名前を書いてください' })),
    ...validateDaily(entries, next, (e) => (e.taskId ? live.find((t) => t.id === e.taskId)?.title ?? adhocTitle(e.taskId) ?? '' : FIXED_KINDS.find((k) => k.kind === e.kind)?.label ?? '')),
  ];
  const patch = (id: string, change: Partial<DraftItem>) => setItems((xs) => xs.map((x) => (x.id === id ? { ...x, ...change } : x)));
  const pick = (i: DraftItem, r: DailyResult) => { patch(i.id, { result: i.result === r ? null : r }); if (i.result !== r) setFocusId(i.id); };
  const addKind = (kind: Exclude<DailyKind, 'task'>) => setItems((xs) => (xs.some((x) => x.id === kindItemId(kind)) ? xs : [...xs, { id: kindItemId(kind), kind, result: null, note: '' }]));
  const addTask = (id: string) => { setFocusId(id); setItems((xs) => (xs.some((x) => x.id === id) ? xs.map((x) => (x.id === id ? { ...x, result: x.result ?? 'progress' } : x)) : [...xs, { id, kind: 'task', taskId: id, result: 'progress', note: '' }])); };
  const addAdhoc = () => setItems((xs) => [...xs, { id: `${ADHOC_PREFIX}${Date.now().toString(36)}`, kind: 'task', result: 'progress', note: '', adhoc: { title: '', parentId: null } }]);
  const removeKind = (id: string) => setItems((xs) => xs.filter((x) => x.id !== id));
  // 間違って選んだタスクや、手を付けなかったタスクは、作業ログから外せる (外したタスクは、「ほかのタスクを選ぶ」から選び直せる)
  const removeTask = (i: DraftItem) => {
    if (i.note.trim() && !window.confirm(`「${title(i)}」の説明を消して、作業ログから外しますか。`)) return;
    removeKind(i.id);
    setRemoved((r) => (r.includes(i.id) ? r : [...r, i.id]));
  };
  const addTaskBack = (id: string) => { setRemoved((r) => r.filter((x) => x !== id)); addTask(id); };

  const shownIds = new Set(items.map((i) => i.id));
  // 「ほかのタスクを選ぶ」は、WBSに載っている順 (上から)。大項目 › 中項目 › タスク の形で出す
  const titleById = new Map(live.map((t) => [t.id, t]));
  const pathOf = (t: Task): string => { const names: string[] = []; for (let p = t.parentId ? titleById.get(t.parentId) : undefined; p; p = p.parentId ? titleById.get(p.parentId) : undefined) names.unshift(p.title); return [...names, t.title].join(' › '); };
  const others = flatten(live).filter((r) => !r.hasChildren && !shownIds.has(r.task.id)).map((r) => ({ id: r.task.id, label: pathOf(r.task) }));
  const suggestions = nextCandidates(tasks, sid, today, items, 3);
  const taskCards = items.filter((i) => i.kind === 'task' && !i.adhoc);
  const adhocCards = items.filter((i) => !!i.adhoc);
  const parentChoices = adhocParents(live);
  const kindCards = items.filter((i) => i.kind !== 'task' && !i.adhoc);

  const submit = async () => {
    setShown(true);
    if (problems.length > 0) return;
    setState('saving'); setErr('');
    try {
      const first = statusOf(prev) !== 'submitted';
      // WBSにない作業は、先にタスクとして作る (WBSとガントチャートに載り、作業ログとひも付く)
      const idOf = new Map<string, string>();
      if (adhocItems.length > 0) {
        const plan = planAdhoc(tasks, sid, today, adhocItems.map((i) => ({ key: i.id, title: i.adhoc!.title, result: i.result as DailyResult, parentId: i.adhoc!.parentId, date: i.adhoc!.date || undefined })), () => newTaskId(teamId));
        if (plan.restoreRoot) await setDeleted(teamId, sid, [ADHOC_ROOT_ID], false);
        // 「WBS外の作業」の大項目は、チームに1つ。ほかの人が先に作っていたときは、作れなくても続ける
        if (plan.root) await createTasks(teamId, sid, [plan.root], 'adhoc').catch(() => undefined);
        await createTasks(teamId, sid, plan.tasks.map((p) => p.task), 'adhoc');
        plan.tasks.forEach((p) => idOf.set(p.key, p.task.id));
      }
      const real = entries.map((e) => (e.taskId && idOf.has(e.taskId) ? { ...e, taskId: idOf.get(e.taskId) } : e));
      await saveDaily(teamId, sid, today, real, prev?.blocker ?? '', prev, next.trim()); // 以前の作業ログの「困っていること」は、そのまま残す (新しくは書かない)
      setState('saved');
      clearDraft(key);
      onSubmitted(first);
      // 結果に合わせて、タスクの状態も更新する (完了した → 完了。着手前なら、進行中に)
      await Promise.allSettled(statusChanges(items, tasks).map((c) => updateTask(teamId, sid, c.taskId, { status: c.status }, '作業ログ')));
      // 担当でないタスクを選んで書いたときは、その人も担当に加える
      await Promise.allSettled(newAssignments(items, tasks, sid).map((id) => updateTaskArray(teamId, sid, id, 'assignees', 'add', sid)));
    } catch (e) {
      setState('idle');
      setErr(`提出できませんでした: ${(e as Error).message}`);
    }
  };

  const focusOn = (id: string) => (el: HTMLTextAreaElement | null) => {
    if (el && focusId === id) { setFocusId(null); setTimeout(() => el.focus({ preventScroll: false }), 0); }
  };
  const submitted = statusOf(prev) === 'submitted';
  // 字数は見せない。足りないときだけ、「もう少し具体的に」と出す (書いている途中は出さず、欄を離れたとき、または提出を押したあとに出す)
  const counter = (id: string, n: number, min: number, hintText = '何を、どこまでやったか') =>
    n >= min || !(shown || touched.has(id)) ? null : <span className={`counter ${shown ? 'bad' : ''}`} role="note">もう少し具体的に書いてください({hintText})</span>;

  return (
    <div className="daily-form">
      <section className="card">
        <h3>1. やったこと</h3>
        <p className="hint">{prevDate ? `前回(${formatDate(prevDate)})のあと` : 'これまで'}にやったタスクを選んで、何をどこまでやったかを書きます。授業時間外の作業も含めます。</p>
        <p className="hint md-hint">Markdownで書けます(例: <code>**太字**</code>・<code>- 箇条書き</code>・<code>`コード`</code>・<code>[文字](https://…)</code>)。URLは、そのままリンクになります。</p>
        {taskCards.length === 0 && <p className="hint">タスクが選ばれていません。下の「ほかのタスクを選ぶ」から選んでください(タスクを1つも選ばないと、提出できません)。</p>}
        {taskCards.map((i) => {
          const t = live.find((x) => x.id === i.taskId);
          const n = charCount(i.note);
          return (
            <div key={i.id} className={`dcard ${i.result ? `on r-${i.result}` : ''}`}>
              <div className="dcard-head">
                <div className="dcard-title">
                  <strong>{title(i)}</strong>
                  {t && <span className="hint">{t.status === 'done' ? '完了済み(ほかの人が完了)・' : ''}{periodLabel(t.startDate, t.endDate)}</span>}
                </div>
                <div className="dcard-actions">
                  {t && <button type="button" className="detail-btn" aria-expanded={open.has(i.id)} aria-label={`${title(i)}の詳細`} onClick={() => toggleOpen(i.id)}>詳細 {open.has(i.id) ? '▴' : '▾'}</button>}
                  <button type="button" className="ghost icon" aria-label={`${title(i)}を作業ログから外す`} title="作業ログから外す(間違って選んだ・手を付けなかった)" onClick={() => removeTask(i)}>×</button>
                </div>
              </div>
              {t && open.has(i.id) && (
                <div className="dcard-detail" aria-label={`${title(i)}の詳細の内容`}>
                  {t.detail.trim() ? t.detail : '詳細は書かれていません。'}
                </div>
              )}
              <div className="seg" role="group" aria-label={`${title(i)}の結果`}>
                {RESULTS.map((r) => (
                  <button key={r} type="button" className={`seg-btn r-${r} ${i.result === r ? 'on' : ''}`} aria-pressed={i.result === r} onClick={() => pick(i, r)}>
                    {RESULT_LABEL[r]}
                  </button>
                ))}
              </div>
              <>
                <textarea
                  ref={focusOn(i.id)} className={`note-area ${shown && i.result && n < MIN_NOTE_CHARS ? 'need' : ''}`} rows={3} maxLength={500} aria-label={`${title(i)}の説明`}
                  placeholder={PLACEHOLDER[i.result ?? 'progress']} value={i.note}
                  onChange={(e) => patch(i.id, { note: e.target.value, ...(i.result === null && e.target.value.trim() ? { result: 'progress' as const } : {}) })} onBlur={() => touch(i.id)}
                />
                {!i.note.trim() && <div className="phrases" aria-label="ひとこと">
                  {PHRASES[i.result ?? 'progress'].map((ph) => <button key={ph.label} type="button" className="chip-btn small" onClick={() => patch(i.id, { note: addPhrase(i.note, ph.text), result: i.result ?? 'progress' })}>＋ {ph.label}</button>)}
                </div>}
                <div className="counter-row">{i.result && counter(i.id, n, MIN_NOTE_CHARS)}{i.result === 'done' && <span className="hint">提出すると、タスクも「完了」になります</span>}{i.result && t && !t.assignees.includes(sid) && <span className="hint">提出すると、あなたもこのタスクの担当に加わります</span>}{!i.result && <span className="hint">やっていないタスクは、そのままにしてください(提出には入りません)。間違って選んだときは「×」で外せます</span>}</div>
              </>
            </div>
          );
        })}
        {adhocCards.map((i) => {
          const n = charCount(i.note);
          const set = (c: Partial<NonNullable<DraftItem['adhoc']>>) => patch(i.id, { adhoc: { ...i.adhoc!, ...c } });
          return (
            <div key={i.id} className={`dcard on r-${i.result ?? 'progress'} adhoc-card`}>
              <div className="dcard-head">
                <strong>WBSにない作業</strong>
                <button type="button" className="ghost icon" aria-label="WBSにない作業をやめる" onClick={() => removeKind(i.id)}>×</button>
              </div>
              <input
                className={`adhoc-title ${shown && charCount(i.adhoc!.title) < MIN_ADHOC_TITLE ? 'need' : ''}`} maxLength={100} aria-label="WBSにない作業の名前"
                placeholder="作業の名前 例: 先生へのAPI仕様の確認メールを書いた" value={i.adhoc!.title} onChange={(e) => set({ title: e.target.value })}
              />
              <label className="adhoc-parent">入れる場所
                <select aria-label="入れる場所" value={i.adhoc!.parentId ?? ''} onChange={(e) => set({ parentId: e.target.value || null })}>
                  <option value="">{ADHOC_ROOT_TITLE}</option>
                  {parentChoices.map((t) => <option key={t.id} value={t.id}>{t.depth === 2 ? '　' : ''}{t.title}</option>)}
                </select>
              </label>
              <label className="adhoc-parent">やった日
                <input type="date" aria-label="やった日" value={i.adhoc!.date ?? today} min={prevDate ?? undefined} max={today} onChange={(e) => set({ date: e.target.value })} />
              </label>
              <div className="seg" role="group" aria-label="WBSにない作業の結果">
                {RESULTS.map((r) => (
                  <button key={r} type="button" className={`seg-btn r-${r} ${i.result === r ? 'on' : ''}`} aria-pressed={i.result === r} onClick={() => patch(i.id, { result: r })}>{RESULT_LABEL[r]}</button>
                ))}
              </div>
              <textarea
                className={`note-area ${shown && n < MIN_NOTE_CHARS ? 'need' : ''}`} rows={3} maxLength={500} aria-label="WBSにない作業の説明"
                placeholder={PLACEHOLDER[i.result ?? 'progress']} value={i.note} onChange={(e) => patch(i.id, { note: e.target.value })} onBlur={() => touch(i.id)}
              />
              <div className="counter-row">{counter(i.id, n, MIN_NOTE_CHARS)}<span className="hint">提出すると、WBSにタスクとして追加されます(あなたが担当)</span></div>
            </div>
          );
        })}
        {others.length > 0 && (
          <TaskPicker options={others} onPick={addTaskBack} label="ほかのタスクを選ぶ" placeholder="＋ ほかのタスクを選ぶ(文字で絞り込めます)" />
        )}
        {kindCards.map((i) => {
          const n = charCount(i.note);
          return (
            <div key={i.id} className="dcard on r-kind">
              <div className="dcard-head"><strong>{title(i)}</strong><button type="button" className="ghost icon" aria-label={`${title(i)}をやめる`} onClick={() => removeKind(i.id)}>×</button></div>
              <textarea
                className={`note-area ${shown && n < MIN_NOTE_CHARS ? 'need' : ''}`} rows={3} maxLength={500} aria-label={`${title(i)}の説明`}
                placeholder={KIND_PLACEHOLDER[i.kind as Exclude<DailyKind, 'task'>]} value={i.note} onChange={(e) => patch(i.id, { note: e.target.value })} onBlur={() => touch(i.id)}
              />
              <div className="counter-row">{counter(i.id, n, MIN_NOTE_CHARS)}</div>
            </div>
          );
        })}
        <div className="chips">
          <button type="button" className="chip-btn adhoc-btn" onClick={addAdhoc}>＋ WBSにない作業をした</button>
          {FIXED_KINDS.filter((k) => !items.some((i) => i.id === kindItemId(k.kind))).map((k) => (
            <button key={k.kind} type="button" className="chip-btn" onClick={() => addKind(k.kind)}>＋ {k.label}</button>
          ))}
        </div>
      </section>

      <section className="card">
        <h3>2. つぎにやること</h3>
        <p className="hint">次の授業日までに、何をやるかを書きます。</p>
        {suggestions.length > 0 && !next.trim() && (
          <div className="chips" aria-label="次にやることの候補">
            {suggestions.map((t) => (
              <button key={t.id} type="button" className="chip-btn" onClick={() => setNext((v) => `${v}${v && !v.endsWith('\n') ? '\n' : ''}「${t.title}」を進める。`)}>＋ {t.title}</button>
            ))}
          </div>
        )}
        <textarea
          className={`note-area ${shown && charCount(next) < MIN_NEXT_CHARS ? 'need' : ''}`} rows={3} maxLength={1000} aria-label="次にやること"
          placeholder={'次の授業日までに、何をどこまでやる?\n例: 管理者画面のワイヤーフレームを描き終える。ログイン機能の画面を作り始める。'}
          value={next} onChange={(e) => setNext(e.target.value)} onBlur={() => touch('next')}
        />
        <div className="counter-row">{counter('next', charCount(next), MIN_NEXT_CHARS, 'いつまでに、何をやるか')}</div>
      </section>


      {err && <p className="error">{err}</p>}
      {shown && problems.length > 0 && (
        <div className="problems" role="alert">
          <strong>あと少しです:</strong>
          <ul className="plain">{problems.map((p) => <li key={p.key}>{p.message}</li>)}</ul>
        </div>
      )}
      <div className="submit-bar">
        <button type="button" className="big-btn" disabled={state === 'saving'} onClick={submit}>{submitted ? '作業ログを更新する' : '作業ログを送信'}</button>
        {state === 'saved' && (
          <>
            <span className="ok">提出しました。今日のうちは、何度でも直せます。</span>
            <span className="after-submit">
              <Link to={`${base}/`} className="btn ghost-btn">ホームに戻る</Link>
              <Link to={`${base}/wbs`} className="btn ghost-btn">WBSを見る</Link>
            </span>
          </>
        )}
        {state !== 'saved' && (
          <span className={problems.length === 0 ? 'ok' : 'hint'}>
            {problems.length === 0 ? `提出できます(${included.length}項目)` : `提出まで あと${problems.length}か所`}
            {!submitted && <> ・ 自動で保存されます</>}
          </span>
        )}
      </div>
    </div>
  );
}
