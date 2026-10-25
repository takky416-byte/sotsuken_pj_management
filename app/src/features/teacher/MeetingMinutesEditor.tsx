import { useState } from 'react';
import { deleteMinutes, publishMinutes, useAllMinutes } from '../../data/meetingMinutes';
import { formatDate, isDateString, jstDate } from '../../lib/dates';
import { checkMinutes, decodeTextFile } from '../../lib/meetingMinutes';

/** 教員用: ミーティングの議事録のアップロード。テキストを貼るか、テキストファイルを選んで、「公開」を押すと、チームの学生のホームに出る。 */
export function MeetingMinutesEditor({ teamId }: { teamId: string }) {
  const { data: minutes, error } = useAllMinutes(teamId);
  const [date, setDate] = useState(jstDate());
  const [text, setText] = useState('');
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  if (error) return <p className="error">{error}</p>;
  if (!minutes) return <p>読み込み中…</p>;
  const exists = minutes.some((m) => m.id === date);

  const run = async (fn: () => Promise<unknown>, done: string) => {
    setErr(''); setMsg('');
    try { await fn(); setMsg(done); } catch (e) { setErr(`できませんでした: ${(e as Error).message}`); }
  };
  const readFile = async (f: File | undefined) => {
    if (!f) return;
    setErr(''); setMsg('');
    if (f.size > 200_000) { setErr('ファイルが大きすぎます (200KB まで)。テキストファイル(.txt・.md)を選んでください'); return; }
    setText(decodeTextFile(await f.arrayBuffer()));
    // 「A_2026-10-28.txt」のように、日付が名前にあれば、日付に使う
    const m = /(\d{4})-?(\d{2})-?(\d{2})/.exec(f.name);
    if (m && isDateString(`${m[1]}-${m[2]}-${m[3]}`)) setDate(`${m[1]}-${m[2]}-${m[3]}`);
  };
  const publish = () => {
    const c = checkMinutes(text);
    if (!c.ok) { setErr(c.reason); setMsg(''); return; }
    if (exists && !window.confirm(`${formatDate(date)} の議事録を、置き換えます。よろしいですか?`)) return;
    void run(async () => { await publishMinutes(teamId, date, c.text); setText(''); }, `${formatDate(date)} の議事録を公開しました`);
  };

  return (
    <section className="card form minutes-editor" aria-label="ミーティングの議事録">
      <h3>ミーティングの議事録(学生に見せます)</h3>
      <p className="hint">議事録のテキストを貼るか、テキストファイル(.txt・.md)を選んで、「公開」を押すと、このチームの学生のホームに出ます。学生は読むだけです。</p>
      <div className="row">
        <label>日付 <input aria-label="議事録の日付" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
        <label className="btn ghost-btn file-btn">テキストファイルを選ぶ
          <input aria-label="議事録のファイル" type="file" accept=".txt,.md,.text,text/plain,text/markdown" onChange={(e) => { void readFile(e.target.files?.[0]); e.target.value = ''; }} hidden />
        </label>
      </div>
      <textarea aria-label="議事録の本文" rows={8} value={text} onChange={(e) => { setText(e.target.value); setMsg(''); }} placeholder="ここに議事録を貼ります (10,000字まで)" />
      <div className="row">
        <button type="button" disabled={!isDateString(date) || !text.trim()} onClick={publish}>{exists ? '置き換えて公開' : '公開'}</button>
        <span className="hint">{text.length > 0 && `${text.length}字`}</span>
        {msg && <span className="hint" role="status">{msg}</span>}
      </div>
      {err && <p className="error">{err}</p>}
      {minutes.length > 0 && <h4>公開した議事録</h4>}
      {minutes.map((m) => (
        <details key={m.id} className="card">
          <summary><strong>{formatDate(m.id)}</strong> <span className="hint">{m.text.split('\n')[0].slice(0, 40)}</span></summary>
          <div className="minutes-text">{m.text}</div>
          <div className="row">
            <button type="button" className="ghost" onClick={() => { setDate(m.id); setText(m.text); }}>直す(上の欄に出す)</button>
            <button type="button" className="ghost" onClick={() => { if (window.confirm('この議事録を、学生から見えなくします。よろしいですか?')) void run(() => deleteMinutes(teamId, m.id), '削除しました'); }}>公開をやめる(削除)</button>
          </div>
        </details>
      ))}
    </section>
  );
}
