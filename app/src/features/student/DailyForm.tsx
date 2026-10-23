import { useEffect, useMemo, useState } from 'react';
import { saveDaily } from '../../data/daily';
import { updateTask } from '../../data/tasks';
import {
  FIXED_KINDS, MIN_NEXT_CHARS, MIN_NOTE_CHARS, RESULT_LABEL, charCount, statusOf, validateDaily,
  type Daily, type DailyKind, type DailyResult,
} from '../../lib/daily';
import {
  initialItems, itemsToEntries, kindItemId, nextCandidates, statusChanges, type DraftItem,
} from '../../lib/dailyDraft';
import { periodLabel } from '../../lib/wbs';
import type { Task } from '../../types';

const RESULTS: DailyResult[] = ['progress', 'done', 'stuck'];
const PLACEHOLDER: Record<DailyResult, string> = {
  progress: '何を、どこまでやった? 分かったことは?\n例: ER図の主なテーブルを3つ作った。ユーザーとイベントの関係で迷っている。',
  done: '何ができあがった? どう確かめた?\n例: ログイン画面を作り終えた。正しい/誤ったパスワードの両方で動くことを確認した。',
  stuck: 'どこで詰まった? 何を試した? チームの誰と相談して、どう進める?\n例: ツールの図形がそろわない。2通り試したが直らない。高瀬さんに聞いてみる。',
};
const KIND_PLACEHOLDER: Record<Exclude<DailyKind, 'task'>, string> = {
  study: '何を調べて、何が分かった?\n例: 認証の仕組みを調べて、セッションとトークンの違いが分かった。',
  discuss: '誰と何を話して、何が決まった?\n例: 岩田さんと分担を話し合い、画面設計は私、DB設計は岩田さんに決まった。',
  other: '何をした?',
};

const draftKey = (sid: string, today: string) => `daily-draft:${sid}:${today}`;
type Draft = { items: { id: string; result: DailyResult | null; note: string; kind: DailyKind }[]; next: string };
const loadDraft = (key: string): Draft | null => { try { const v = localStorage.getItem(key); return v ? (JSON.parse(v) as Draft) : null; } catch { return null; } };
const saveDraft = (key: string, d: Draft) => { try { localStorage.setItem(key, JSON.stringify(d)); } catch { /* 保存できなくても入力はできる */ } };
const clearDraft = (key: string) => { try { localStorage.removeItem(key); } catch { /* 何もしない */ } };

/**
 * 日報の入力。タスクごとのカードで「進んだ / 完了した / 詰まった」を押すと、そのカードが日報に入り、説明の欄が開く。
 * 説明は、何を・どこまでやったかを、一定の長さ以上で書く。最後に、次にやることも書く。
 * 入力の途中は、この端末に自動で保存する (画面を閉じても消えない)。
 */
export function DailyForm({ teamId, sid, today, prev, tasks, onSubmitted }: {
  teamId: string; sid: string; today: string; prev: Daily | undefined; tasks: Task[];
  onSubmitted: (first: boolean) => void;
}) {
  const key = draftKey(sid, today);
  const live = useMemo(() => tasks.filter((t) => !t.deleted), [tasks]);
  const [items, setItems] = useState<DraftItem[]>(() => {
    const base = initialItems(prev, tasks, sid, today);
    const d = prev ? null : loadDraft(key);
    if (!d) return base;
    // 下書きの内容を、いまのタスクの候補に重ねる (消えたタスクは捨てる)
    const saved = new Map(d.items.map((i) => [i.id, i]));
    const merged = base.map((i) => (saved.has(i.id) ? { ...i, result: saved.get(i.id)!.result, note: saved.get(i.id)!.note } : i));
    for (const i of d.items) if (i.kind !== 'task' && !merged.some((m) => m.id === i.id)) merged.push({ id: i.id, kind: i.kind, result: null, note: i.note });
    return merged;
  });
  const [next, setNext] = useState(() => (prev ? prev.next ?? '' : loadDraft(key)?.next ?? ''));
  const [extra, setExtra] = useState('');
  const [state, setState] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [err, setErr] = useState('');
  const [shown, setShown] = useState(false); // 「提出する」を押してから、足りない点を赤く示す

  useEffect(() => { if (!prev) saveDraft(key, { items: items.map(({ id, result, note, kind }) => ({ id, result, note, kind })), next }); }, [items, next, key, prev]);
  useEffect(() => setState('idle'), [items, next]);

  const title = (i: DraftItem) => (i.taskId ? live.find((t) => t.id === i.taskId)?.title ?? '(削除されたタスク)' : FIXED_KINDS.find((k) => k.kind === i.kind)?.label ?? '');
  const included = items.filter((i) => i.kind !== 'task' || i.result !== null);
  const entries = itemsToEntries(items);
  const problems = validateDaily(entries, next, (e) => (e.taskId ? live.find((t) => t.id === e.taskId)?.title ?? '' : FIXED_KINDS.find((k) => k.kind === e.kind)?.label ?? ''));
  const patch = (id: string, change: Partial<DraftItem>) => setItems((xs) => xs.map((x) => (x.id === id ? { ...x, ...change } : x)));
  const pick = (i: DraftItem, r: DailyResult) => patch(i.id, { result: i.result === r ? null : r });
  const addKind = (kind: Exclude<DailyKind, 'task'>) => setItems((xs) => (xs.some((x) => x.id === kindItemId(kind)) ? xs : [...xs, { id: kindItemId(kind), kind, result: null, note: '' }]));
  const addTask = (id: string) => setItems((xs) => (xs.some((x) => x.id === id) ? xs.map((x) => (x.id === id ? { ...x, result: x.result ?? 'progress' } : x)) : [...xs, { id, kind: 'task', taskId: id, result: 'progress', note: '' }]));
  const removeKind = (id: string) => setItems((xs) => xs.filter((x) => x.id !== id));

  const shownIds = new Set(items.map((i) => i.id));
  const others = live.filter((t) => !shownIds.has(t.id) && !live.some((c) => c.parentId === t.id));
  const suggestions = nextCandidates(tasks, sid, today, items, 3);
  const taskCards = items.filter((i) => i.kind === 'task');
  const kindCards = items.filter((i) => i.kind !== 'task');

  const submit = async () => {
    setShown(true);
    if (problems.length > 0) return;
    setState('saving'); setErr('');
    try {
      const first = statusOf(prev) !== 'submitted';
      await saveDaily(teamId, sid, today, entries, prev?.blocker ?? '', prev, next.trim()); // 以前の日報の「困っていること」は、そのまま残す (新しくは書かない)
      setState('saved');
      clearDraft(key);
      onSubmitted(first);
      // 結果に合わせて、タスクの状態も更新する (完了した → 完了。着手前なら、進行中に)
      await Promise.allSettled(statusChanges(items, tasks).map((c) => updateTask(teamId, sid, c.taskId, { status: c.status })));
    } catch (e) {
      setState('idle');
      setErr(`提出できませんでした: ${(e as Error).message}`);
    }
  };

  const submitted = statusOf(prev) === 'submitted';
  const counter = (n: number, min: number) => (n >= min ? <span className="counter ok">{n}字 ✓</span> : <span className={`counter ${shown ? 'bad' : ''}`}>あと{min - n}字({n}/{min})</span>);

  return (
    <div className="daily-form">
      <section className="card">
        <h3>① きょうやったこと</h3>
        <p className="hint">やったタスクの「進んだ・完了した・詰まった」を押して、<strong>何を・どこまでやったか</strong>を書きます({MIN_NOTE_CHARS}字以上)。やっていないタスクは、そのままにします。</p>
        {taskCards.length === 0 && <p className="hint">担当のタスクがありません。下の「ほかのタスクを選ぶ」か、WBSで担当を決めてください。</p>}
        {taskCards.map((i) => {
          const t = live.find((x) => x.id === i.taskId);
          const n = charCount(i.note);
          return (
            <div key={i.id} className={`dcard ${i.result ? `on r-${i.result}` : ''}`}>
              <div className="dcard-head">
                <strong>{title(i)}</strong>
                {t && <span className="hint">{periodLabel(t.startDate, t.endDate)}</span>}
              </div>
              <div className="seg" role="group" aria-label={`${title(i)}の結果`}>
                {RESULTS.map((r) => (
                  <button key={r} type="button" className={`seg-btn r-${r} ${i.result === r ? 'on' : ''}`} aria-pressed={i.result === r} onClick={() => pick(i, r)}>
                    {RESULT_LABEL[r]}
                  </button>
                ))}
              </div>
              {i.result && (
                <>
                  <textarea
                    className={`note-area ${shown && n < MIN_NOTE_CHARS ? 'need' : ''}`} rows={3} maxLength={500} aria-label={`${title(i)}の説明`}
                    placeholder={PLACEHOLDER[i.result]} value={i.note} onChange={(e) => patch(i.id, { note: e.target.value })}
                  />
                  <div className="counter-row">{counter(n, MIN_NOTE_CHARS)}{i.result === 'done' && <span className="hint">提出すると、タスクも「完了」になります</span>}</div>
                </>
              )}
            </div>
          );
        })}
        {others.length > 0 && (
          <select value={extra} onChange={(e) => { if (e.target.value) addTask(e.target.value); setExtra(''); }} aria-label="ほかのタスクを選ぶ">
            <option value="">＋ ほかのタスクを選ぶ…</option>
            {others.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
          </select>
        )}
        {kindCards.map((i) => {
          const n = charCount(i.note);
          return (
            <div key={i.id} className="dcard on r-kind">
              <div className="dcard-head"><strong>{title(i)}</strong><button type="button" className="ghost icon" aria-label={`${title(i)}をやめる`} onClick={() => removeKind(i.id)}>×</button></div>
              <textarea
                className={`note-area ${shown && n < MIN_NOTE_CHARS ? 'need' : ''}`} rows={3} maxLength={500} aria-label={`${title(i)}の説明`}
                placeholder={KIND_PLACEHOLDER[i.kind as Exclude<DailyKind, 'task'>]} value={i.note} onChange={(e) => patch(i.id, { note: e.target.value })}
              />
              <div className="counter-row">{counter(n, MIN_NOTE_CHARS)}</div>
            </div>
          );
        })}
        <div className="chips">
          {FIXED_KINDS.filter((k) => !items.some((i) => i.id === kindItemId(k.kind))).map((k) => (
            <button key={k.kind} type="button" className="chip-btn" onClick={() => addKind(k.kind)}>＋ {k.label}</button>
          ))}
        </div>
      </section>

      <section className="card">
        <h3>② つぎにやること</h3>
        <p className="hint">次の授業日までに、何をやるかを書きます({MIN_NEXT_CHARS}字以上)。ホームの「次にやること」にも出ます。</p>
        {suggestions.length > 0 && (
          <div className="chips" aria-label="次にやることの候補">
            {suggestions.map((t) => (
              <button key={t.id} type="button" className="chip-btn" onClick={() => setNext((v) => `${v}${v && !v.endsWith('\n') ? '\n' : ''}「${t.title}」を進める。`)}>＋ {t.title}</button>
            ))}
          </div>
        )}
        <textarea
          className={`note-area ${shown && charCount(next) < MIN_NEXT_CHARS ? 'need' : ''}`} rows={3} maxLength={1000} aria-label="次にやること"
          placeholder={'次の授業日までに、何をどこまでやる?\n例: 管理者画面のワイヤーフレームを描き終える。ログイン機能の画面を作り始める。'}
          value={next} onChange={(e) => setNext(e.target.value)}
        />
        <div className="counter-row">{counter(charCount(next), MIN_NEXT_CHARS)}</div>
      </section>


      {err && <p className="error">{err}</p>}
      {shown && problems.length > 0 && (
        <div className="problems" role="alert">
          <strong>あと少しです:</strong>
          <ul className="plain">{problems.map((p) => <li key={p.key}>{p.message}</li>)}</ul>
        </div>
      )}
      <div className="row submit-row">
        <button type="button" className="big-btn" disabled={state === 'saving'} onClick={submit}>{submitted ? '日報を更新する' : '日報を提出する'}</button>
        {state === 'saved' && <span className="ok">提出しました。今日のうちは、何度でも直せます。</span>}
        {state === 'idle' && submitted && <span className="hint">提出済み({included.length}項目)</span>}
        {state === 'idle' && !submitted && <span className="hint">入力の途中は、この端末に自動で保存されます</span>}
      </div>
    </div>
  );
}
