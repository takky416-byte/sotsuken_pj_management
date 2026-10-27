import { useMemo, useState } from 'react';
import { deleteKickoffDraft, saveKickoffDraft, useKickoffDrafts } from '../../data/kickoffDrafts';
import { useTeams } from '../../data/teams';
import { type DraftEntry, parseDraftBundle } from '../../lib/draftBundle';
import { checkDraft } from '../../lib/draftCheck';
import { fillPeriods } from '../../lib/draftSchedule';
import { outlineMeta, parseOutline } from '../../lib/outline';

/** ファイル名 (C-案1_….md) から、区切りの行を作る。ファイルの中に「@@」の行があれば、そのまま使う */
function withHeader(name: string, text: string): string {
  if (/^\s*@@/m.test(text)) return text;
  const m = /^([A-Z])\s*[-_ ]?\s*案\s*([12])/.exec(name.normalize('NFKC'));
  return m ? `@@ チーム${m[1]} 案${m[2]}\n${text}` : text;
}

const kindOf = (outline: string) => outlineMeta(outline).kind ?? (/回路図/.test(outline) ? 'ハード' : 'ソフト');

/** 設定 > 叩き台の登録。各チームの2案を、先に登録しておく。キックオフでは、2案から選ぶだけ。 */
export function KickoffDrafts() {
  const { data: teams } = useTeams();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const parsed = useMemo(() => (text.trim() ? parseDraftBundle(text) : null), [text]);
  const teamIds = useMemo(() => new Set((teams ?? []).map((t) => t.id)), [teams]);
  const unknown = parsed ? parsed.entries.filter((e) => !teamIds.has(e.teamId)) : [];
  const checks = useMemo(() => new Map((parsed?.entries ?? []).map((e) => {
    const r = checkDraft(fillPeriods(e.outline), kindOf(e.outline));
    return [`${e.teamId}${e.no}`, { errors: r.issues.filter((i) => i.level === 'error').length, warns: r.issues.filter((i) => i.level === 'warn').length }];
  })), [parsed]);

  const readFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const parts: string[] = [];
    for (const f of Array.from(files)) parts.push(withHeader(f.name, await f.text()));
    setText((t) => [t.trim(), ...parts].filter(Boolean).join('\n\n'));
    setMsg(''); setErr('');
  };

  const canSave = !!parsed && parsed.errors.length === 0 && parsed.entries.length > 0 && unknown.length === 0 && !busy;
  const save = async () => {
    if (!parsed) return;
    setBusy(true); setMsg(''); setErr('');
    try {
      await Promise.all(parsed.entries.map((e: DraftEntry) => saveKickoffDraft(e)));
      setMsg(`${parsed.entries.length}案を登録しました。キックオフ画面で、チームごとに、2案から選べます。`);
      setText('');
    } catch (e) {
      setErr(`登録できませんでした: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <p className="hint">各チームの叩き台(2案)を、先に登録しておきます。キックオフでは、採用する案を選ぶだけです(貼り付けは要りません)。同じチーム・案は、置き換わります。学生には見えません。</p>
      <div className="card form">
        <label>叩き台のファイルを選ぶ(複数可。ファイル名が「C-案1_….md」の形なら、チームと案が分かります)
          <input type="file" multiple accept=".md,.txt,text/plain,text/markdown" onChange={(e) => { void readFiles(e.target.files); e.target.value = ''; }} />
        </label>
        <label>または、貼り付ける(1案ごとに、「@@ チームC 案1」の行から始める)
          <textarea rows={6} value={text} onChange={(e) => setText(e.target.value)} placeholder={'@@ チームC 案1\n企画名: 立たせる椅子(仮)\n# 要件定義\n- 困りごとを決める'} />
        </label>
        {parsed && (
          <div className="card" aria-label="登録する叩き台の確認">
            {parsed.errors.map((x) => <p key={x} className="error">{x}</p>)}
            {unknown.length > 0 && <p className="error">チームがありません: {[...new Set(unknown.map((u) => u.teamId))].join('・')}</p>}
            {parsed.entries.length > 0 && (
              <table className="table">
                <thead><tr><th>チーム</th><th>案</th><th>企画名(仮)</th><th>項目数</th><th>点検</th></tr></thead>
                <tbody>
                  {parsed.entries.map((e) => {
                    const c = checks.get(`${e.teamId}${e.no}`)!;
                    return (
                      <tr key={`${e.teamId}${e.no}`}>
                        <td>{e.teamId}</td><td>{e.no}</td><td>{e.title}</td><td>{e.items}</td>
                        <td>{c.errors === 0 && c.warns === 0 ? '問題なし' : `${c.errors > 0 ? `直したほうがよい ${c.errors}件 ` : ''}${c.warns > 0 ? `見直し ${c.warns}件` : ''}`}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
            <p className="hint">点検は目安です。登録して、あとからキックオフ画面で、中身を見て直すこともできます。</p>
          </div>
        )}
        {err && <p className="error">{err}</p>}
        {msg && <p className="ok">{msg}</p>}
        <div className="row">
          <button disabled={!canSave} onClick={save}>登録する</button>
          {text && <button type="button" className="ghost" onClick={() => setText('')}>入力を消す</button>}
        </div>
      </div>

      <h3>登録されている叩き台</h3>
      <div className="card">
        <table className="table">
          <thead><tr><th>チーム</th><th>案1</th><th>案2</th></tr></thead>
          <tbody>{(teams ?? []).map((t) => <RegisteredRow key={t.id} teamId={t.id} />)}</tbody>
        </table>
      </div>
    </>
  );
}

function RegisteredRow({ teamId }: { teamId: string }) {
  const { data } = useKickoffDrafts(teamId);
  const cell = (no: 1 | 2) => {
    const d = (data ?? []).find((x) => x.no === no);
    if (!d) return <span className="hint">未登録</span>;
    const items = parseOutline(d.outline).filter((n) => n.depth > 1).length;
    return (
      <span>{d.title}<span className="hint"> ({items}項目) </span>
        <button type="button" className="ghost" onClick={() => { if (window.confirm(`${teamId}チーム 案${no}「${d.title}」の登録を消しますか。`)) void deleteKickoffDraft(teamId, no); }}>消す</button>
      </span>
    );
  };
  return <tr><td>{teamId}</td><td>{data === null ? '…' : cell(1)}</td><td>{data === null ? '…' : cell(2)}</td></tr>;
}
