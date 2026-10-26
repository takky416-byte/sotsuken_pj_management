import { useEffect, useRef, useState } from 'react';
import { saveReportNotes } from '../data/teams';
import { jstDate } from '../lib/dates';
import type { Team } from '../types';

const MAX = 1000;
const fmtDate = (ms: number) => jstDate(new Date(ms)).replace(/-/g, '/');
const FIELDS = [
  { key: 'summary', label: '1. プロジェクトの概要', hint: '何を、誰のために、何のために作るか。キックオフで自動で作られた文章を、あとから直せます。' },
  { key: 'issues', label: '6. 課題と今後の予定', hint: '遅れや困りごとへの対応と、これからの進め方。なければ空欄でかまいません。' },
] as const;

/** 企業に提出する報告書に載せる、チームの文章。チームの学生と教員が書ける。 */
export function ReportNotesEditor({ team, actor }: { team: Team; actor: string }) {
  const n = team.reportNotes;
  // 以前の保存にある「今後の方針」(next) は、「課題と今後の予定」(issues) に統合して見せる
  const base = { summary: n?.summary ?? '', issues: [n?.issues, n?.next].filter((x) => x && x.trim()).join('\n'), next: '' };
  const [v, setV] = useState(base);
  const missingSummary = !(n?.summary ?? '').trim();
  const [state, setState] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [err, setErr] = useState('');
  const dirty = v.summary !== base.summary || v.issues !== base.issues;
  const save = async () => {
    setState('saving'); setErr('');
    try { await saveReportNotes(team.id, actor, v, n); setState('saved'); }
    catch (e) { setErr(`保存できませんでした: ${(e as Error).message}`); setState('idle'); }
  };
  // 書きかけは、手を止めて少しすると自動で保存する。画面を離れるとき・閉じるときにも、保存する (書いた文章を失わない)
  const latest = useRef({ v, n, dirty, teamId: team.id, actor });
  latest.current = { v, n, dirty, teamId: team.id, actor };
  useEffect(() => {
    if (!dirty) return undefined;
    const t = setTimeout(() => { void save(); }, 1500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [v.summary, v.issues, dirty]);
  useEffect(() => {
    const flush = () => { const c = latest.current; if (c.dirty) void saveReportNotes(c.teamId, c.actor, c.v, c.n).catch(() => undefined); };
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
          <textarea rows={3} maxLength={MAX} value={v[f.key]} aria-label={f.label}
            onChange={(e) => { setV({ ...v, [f.key]: e.target.value }); setState('idle'); }} />
        </label>
      ))}
      <div className="row">
        <button type="button" disabled={!dirty || state === 'saving'} onClick={save}>{state === 'saving' ? '保存中…' : '今すぐ保存'}</button>
        {dirty && state !== 'saving' && <span className="hint">書いたあと、少しすると自動で保存します</span>}
        {state === 'saved' && !dirty && <span className="ok" role="status">保存しました</span>}
        {n && <span className="hint">最終更新: {new Date(n.at).toLocaleString('ja-JP')}</span>}
      </div>
      {err && <p className="error">{err}</p>}
    </details>
  );
}
