import { useState } from 'react';
import { saveReportNotes } from '../data/teams';
import type { Team } from '../types';

const MAX = 1000;
const FIELDS = [
  { key: 'summary', label: '1. 企画の概要と目的', hint: '何を、誰のために、何のために作るか(2〜4文)。' },
  { key: 'issues', label: '5. 課題と対応', hint: '遅れや困りごとと、その対応方針。なければ空欄でかまいません。' },
  { key: 'next', label: '6. 今後の方針', hint: 'これから1か月の進め方(任意)。' },
] as const;

/** 企業に提出する報告書に載せる、チームの文章。チームの学生と教員が書ける。 */
export function ReportNotesEditor({ team, actor }: { team: Team; actor: string }) {
  const n = team.reportNotes;
  const [v, setV] = useState({ summary: n?.summary ?? '', issues: n?.issues ?? '', next: n?.next ?? '' });
  const [state, setState] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [err, setErr] = useState('');
  const dirty = v.summary !== (n?.summary ?? '') || v.issues !== (n?.issues ?? '') || v.next !== (n?.next ?? '');
  const save = async () => {
    setState('saving'); setErr('');
    try { await saveReportNotes(team.id, actor, v); setState('saved'); }
    catch (e) { setErr(`保存できませんでした: ${(e as Error).message}`); setState('idle'); }
  };
  return (
    <section className="card no-print report-notes" aria-label="報告書に載せる文章">
      <h3>報告書に載せる文章</h3>
      <p className="hint">企業に提出する報告書(Excel・PDF)に載ります。数字や一覧は自動で入るので、ここには、チームの言葉で書くところだけを書きます。</p>
      {FIELDS.map((f) => (
        <label key={f.key}>{f.label} <span className="hint">{f.hint}</span>
          <textarea rows={3} maxLength={MAX} value={v[f.key]} aria-label={f.label}
            onChange={(e) => { setV({ ...v, [f.key]: e.target.value }); setState('idle'); }} />
        </label>
      ))}
      <div className="row">
        <button type="button" disabled={!dirty || state === 'saving'} onClick={save}>{state === 'saving' ? '保存中…' : '保存する'}</button>
        {state === 'saved' && !dirty && <span className="ok" role="status">保存しました</span>}
        {n && <span className="hint">最終更新: {new Date(n.at).toLocaleString('ja-JP')}</span>}
      </div>
      {err && <p className="error">{err}</p>}
    </section>
  );
}
