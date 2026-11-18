import { useEffect, useRef, useState } from 'react';
import { saveReportNotes } from '../data/teams';
import { useReadOnly } from '../auth/ReadOnly';
import { jstDate } from '../lib/dates';
import type { Team } from '../types';

const MAX = 3000;
const fmtDate = (ms: number) => jstDate(new Date(ms)).replace(/-/g, '/');
const FIELDS = [
  { key: 'summary', label: '1. プロジェクトの概要', hint: '何を、誰のために、何のために作るか。キックオフで自動で作られた文章を、あとから直せます。' },
  { key: 'issues', label: '6. 課題と今後の予定', hint: '遅れや困りごとへの対応と、これからの進め方。なければ空欄でかまいません。' },
] as const;

/** 企業に提出する報告書に載せる、チームの文章。チームの学生と教員が書ける。 */
export function ReportNotesEditor({ team, actor }: { team: Team; actor: string }) {
  const ro = useReadOnly(); // 閲覧専用の教員は、読むだけ
  const n = team.reportNotes;
  // 以前の保存にある「今後の方針」(next) は、「課題と今後の予定」(issues) に統合して見せる
  const base = { summary: n?.summary ?? '', issues: [n?.issues, n?.next].filter((x) => x && x.trim()).join('\n'), next: '' };
  // 自分が書き換えた欄だけを、下書き (draft) に持つ。触っていない欄は、保存されている最新の内容に追いつく
  // (ほかの人が保存した内容を、開きっぱなしの古い文章で、上書きしてしまわないため)
  const [draft, setDraft] = useState<{ summary?: string; issues?: string }>({});
  // 書き始めたときの、保存済みの内容。そのあとで、ほかの人が保存したかを見分けるため
  const [startedFrom, setStartedFrom] = useState<{ summary?: string; issues?: string }>({});
  const v = { summary: draft.summary ?? base.summary, issues: draft.issues ?? base.issues, next: '' };
  const missingSummary = !(n?.summary ?? '').trim();
  const [state, setState] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [err, setErr] = useState('');
  const dirty = v.summary !== base.summary || v.issues !== base.issues;
  const tooLong = v.summary.length > MAX || v.issues.length > MAX;
  // 書いている途中に、ほかの人が同じ欄を保存した (最新の内容が、書き始めたときとも、自分の文章とも違う)
  const conflicts = (['summary', 'issues'] as const).filter((k) => draft[k] !== undefined && draft[k] !== base[k] && startedFrom[k] !== undefined && startedFrom[k] !== base[k]);
  const conflict = conflicts.length > 0;
  // 保存の直前に、いちばん新しい内容を読む (古い画面のまま保存しない)
  const latest = useRef({ v, n, dirty, tooLong, conflict, teamId: team.id, actor });
  latest.current = { v, n, dirty, tooLong, conflict, teamId: team.id, actor };
  const save = async (force = false) => {
    const c = latest.current;
    if (c.tooLong || (c.conflict && !force)) return; // ほかの人が先に保存したときは、黙って上書きしない
    setState('saving'); setErr('');
    try { await saveReportNotes(c.teamId, c.actor, c.v, c.n); setState('saved'); }
    catch (e) { setErr(`保存できませんでした: ${(e as Error).message}`); setState('idle'); }
  };
  // 保存された内容が、自分の下書きと同じになったら、下書きを手放す (その後は、ほかの人の保存にも追いつく)
  useEffect(() => {
    setDraft((d) => {
      const next = { ...d };
      if (next.summary !== undefined && next.summary === base.summary) delete next.summary;
      if (next.issues !== undefined && next.issues === base.issues) delete next.issues;
      return Object.keys(next).length === Object.keys(d).length ? d : next;
    });
  }, [base.summary, base.issues]);
  // 書きかけは、手を止めて少しすると自動で保存する。画面を離れるとき・閉じるときにも、保存する (書いた文章を失わない)
  useEffect(() => {
    if (!dirty || ro || tooLong || conflict) return undefined;
    const t = setTimeout(() => { void save(); }, 1500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [v.summary, v.issues, dirty, tooLong, conflict]);
  useEffect(() => {
    const flush = () => { const c = latest.current; if (c.dirty && !ro && !c.tooLong && !c.conflict) void saveReportNotes(c.teamId, c.actor, c.v, c.n).catch(() => undefined); };
    window.addEventListener('beforeunload', flush);
    return () => { window.removeEventListener('beforeunload', flush); flush(); };
  }, []);
  return (
    <details className="card no-print report-notes" aria-label="報告書に載せる文章">
      <summary><strong>報告書に載せる文章</strong>{missingSummary && <span className="warn"> (概要が未記入です)</span>}</summary>
      <p className="hint">企業に提出する報告書(Excel・PDF)に載ります。文章を書き換えて保存すると、その文章の「記入日」が、今日の日付に変わって報告書に載ります。数字や一覧は自動で入るので、ここには、チームの言葉で書くところだけを書きます。</p>
      {FIELDS.map((f) => (
        <label key={f.key}>{f.label} <span className="hint">{f.hint}</span>
          {n?.[`${f.key}At`] && n[f.key] === v[f.key] && <span className="hint"> 記入日: {fmtDate(n[`${f.key}At`] as number)}(報告書に出ます)</span>}
          <textarea rows={3} maxLength={MAX} value={v[f.key]} aria-label={f.label} readOnly={ro}
            onChange={(e) => { const val = e.target.value; setStartedFrom((b) => (draft[f.key] === undefined ? { ...b, [f.key]: base[f.key] } : b)); setDraft((d) => ({ ...d, [f.key]: val })); setState('idle'); }} />
        </label>
      ))}
      {!ro && <div className="row">
        <button type="button" disabled={!dirty || tooLong || conflict || state === 'saving'} onClick={() => void save()}>{state === 'saving' ? '保存中…' : '今すぐ保存'}</button>
        {dirty && state !== 'saving' && <span className="hint">書いたあと、少しすると自動で保存します</span>}
        {state === 'saved' && !dirty && <span className="ok" role="status">保存しました</span>}
        {n && <span className="hint">最終更新: {new Date(n.at).toLocaleString('ja-JP')}</span>}
      </div>}
      {ro && n && <p className="hint">最終更新: {new Date(n.at).toLocaleString('ja-JP')}</p>}
      {conflict && !ro && (
        <div className="error" role="alert">
          <p>書いている間に、ほかの人が同じ欄を保存しました(自動保存は止めています)。</p>
          <div className="row">
            <button type="button" onClick={() => { setDraft({}); setStartedFrom({}); setState('idle'); }}>最新の内容に切り替える(自分の文章は消えます)</button>
            <button type="button" className="ghost" onClick={() => { setStartedFrom({}); void save(true); }}>自分の文章で上書きする</button>
          </div>
        </div>
      )}
      {tooLong && <p className="error">各欄は3000字までです(概要 {v.summary.length}字 / 課題と今後の予定 {v.issues.length}字)。短くすると、保存できます。</p>}
      {err && <p className="error">{err}</p>}
    </details>
  );
}
