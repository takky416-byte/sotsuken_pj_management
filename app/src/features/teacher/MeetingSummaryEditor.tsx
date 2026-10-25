import { useState } from 'react';
import { deleteDraft, publish, saveDraft, unpublish, useAllSummaries, useDrafts } from '../../data/meetingSummaries';
import { formatDate, isDateString, jstDate } from '../../lib/dates';
import { linesToList, listToLines, type MeetingDraft, type MeetingSummary } from '../../lib/meetingSummary';

/** 教員用: ミーティングの要旨。録音から作った下書き (または自分で書いたもの) を直して、学生に公開する。 */
export function MeetingSummaryEditor({ teamId }: { teamId: string }) {
  const { data: drafts, error: e1 } = useDrafts(teamId);
  const { data: published, error: e2 } = useAllSummaries(teamId);
  const [date, setDate] = useState(jstDate());
  const [err, setErr] = useState('');
  if (e1 || e2) return <p className="error">{e1 ?? e2}</p>;
  if (!drafts || !published) return <p>読み込み中…</p>;
  const run = async (fn: () => Promise<unknown>) => { setErr(''); try { await fn(); } catch (e) { setErr(`できませんでした: ${(e as Error).message}`); } };
  const taken = drafts.some((d) => d.id === date) || published.some((s) => s.id === date);

  return (
    <section className="card form summary-editor" aria-label="ミーティングの要旨">
      <h3>ミーティングの要旨(学生に見せます)</h3>
      <p className="hint">
        録音をドライブの「ミーティング録音」フォルダに入れると、要旨の下書きがここに出ます(<code>A_2026-10-28.m4a</code> のように、チーム_日付 の名前にします)。
        直してから「学生に公開」を押すと、学生のホームに出ます。公開するまで、学生には見えません。
      </p>
      {err && <p className="error">{err}</p>}
      <div className="row">
        <input aria-label="要旨の日付" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        <button type="button" className="ghost" disabled={!isDateString(date) || taken}
          onClick={() => run(() => saveDraft(teamId, date, { summary: '', decided: [], actions: [], concerns: [] }))}>
          {taken ? 'この日の要旨はあります' : '要旨を自分で書く'}
        </button>
      </div>
      {drafts.length === 0 && published.length === 0 && <p className="hint">要旨はまだありません。</p>}
      {drafts.map((d) => <DraftCard key={`${d.id}-${d.updatedAt}`} teamId={teamId} d={d} run={run} />)}
      {published.map((s) => <PublishedCard key={s.id} teamId={teamId} s={s} run={run} />)}
    </section>
  );
}

function DraftCard({ teamId, d, run }: { teamId: string; d: MeetingDraft; run: (fn: () => Promise<unknown>) => Promise<void> }) {
  const [summary, setSummary] = useState(d.summary);
  const [decided, setDecided] = useState(listToLines(d.decided));
  const [actions, setActions] = useState(listToLines(d.actions));
  const [concerns, setConcerns] = useState(listToLines(d.concerns));
  const edit = () => ({ summary, decided: linesToList(decided), actions: linesToList(actions), concerns: linesToList(concerns) });
  return (
    <div className="card form draft-card">
      <strong>{formatDate(d.id)} <span className="badge">下書き</span> {d.source === 'recording' && <span className="hint">(録音から作成{d.file ? `: ${d.file}` : ''})</span>}</strong>
      {d.source === 'recording' && <p className="hint">AIが作った下書きです。聞き間違いや、学生を傷つける言い方、個人的な話が入っていないか、確認してください。</p>}
      {d.unclear && d.unclear.length > 0 && (
        <div className="warn-box" role="note">
          <div className="label">AIが聞き取れなかった・自信がなかった点(確認用。学生には出ません)</div>
          <ul className="plain">{d.unclear.map((u, i) => <li key={i}>{u}</li>)}</ul>
        </div>
      )}
      <label>要旨
        <textarea aria-label={`要旨・本文 ${d.id}`} rows={4} maxLength={1200} value={summary} onChange={(e) => setSummary(e.target.value)} />
      </label>
      <label>決まったこと(1行に1つ)
        <textarea aria-label={`要旨・決定事項 ${d.id}`} rows={3} value={decided} onChange={(e) => setDecided(e.target.value)} />
      </label>
      <label>次の1週間でやること(1行に1つ)
        <textarea aria-label={`要旨・次の1週間 ${d.id}`} rows={3} value={actions} onChange={(e) => setActions(e.target.value)} />
      </label>
      <label>詰まり・気になること(1行に1つ)
        <textarea aria-label={`要旨・詰まり ${d.id}`} rows={2} value={concerns} onChange={(e) => setConcerns(e.target.value)} />
      </label>
      <div className="row">
        <button type="button" disabled={!summary.trim()} onClick={() => run(() => publish(teamId, d.id, edit()))}>学生に公開</button>
        <button type="button" className="ghost" onClick={() => run(() => saveDraft(teamId, d.id, edit(), d))}>下書きを保存</button>
        <button type="button" className="ghost" onClick={() => { if (window.confirm('この下書きを削除します。よろしいですか?')) void run(() => deleteDraft(teamId, d.id)); }}>削除</button>
      </div>
    </div>
  );
}

function PublishedCard({ teamId, s, run }: { teamId: string; s: MeetingSummary; run: (fn: () => Promise<unknown>) => Promise<void> }) {
  return (
    <div className="card form">
      <strong>{formatDate(s.id)} <span className="badge ok-badge">公開中</span></strong>
      <p className="msg-text">{s.summary}</p>
      <div className="row">
        <button type="button" className="ghost" onClick={() => run(() => unpublish(teamId, s))}>公開をやめて、下書きに戻す</button>
      </div>
    </div>
  );
}
