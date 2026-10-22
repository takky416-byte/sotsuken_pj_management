import { useState } from 'react';
import { applyRestore } from '../../data/restore';
import { download, loadBackup } from '../../data/export';
import { jstDate } from '../../lib/dates';
import { counts, type Backup } from '../../lib/export';
import { parseBackup, planRestore, type RestorePlan } from '../../lib/restore';

/** バックアップ (JSON) からの復元。バックアップの内容で、同じ id の文書を上書きする。バックアップにない文書は消さない。 */
export function Restore() {
  const [backup, setBackup] = useState<Backup | null>(null);
  const [fileName, setFileName] = useState('');
  const [all, setAll] = useState(true);
  const [teams, setTeams] = useState<string[]>([]);
  const [teacherOnly, setTeacherOnly] = useState(true);
  const [plan, setPlan] = useState<RestorePlan | null>(null);
  const [current, setCurrent] = useState<Backup | null>(null);
  const [sure, setSure] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [err, setErr] = useState('');
  const [done, setDone] = useState('');

  const reset = () => { setPlan(null); setCurrent(null); setSure(false); setDone(''); };
  const teamIds = backup ? (backup.collections.teams ?? []).map((t) => t.id).sort() : [];
  const scope = { teams: all ? ('all' as const) : teams, teacherOnly };

  const pick = async (file: File | undefined) => {
    reset(); setErr(''); setBackup(null);
    if (!file) return;
    try {
      const b = parseBackup(await file.text());
      setBackup(b); setFileName(file.name); setTeams([]); setAll(true);
      setTeacherOnly(b.meta.includesTeacherNotes);
    } catch (e) { setErr((e as Error).message); }
  };

  const check = async () => {
    if (!backup) return;
    setBusy(true); setErr(''); setSure(false); setDone('');
    try {
      const now = await loadBackup();
      setCurrent(now);
      setPlan(planRestore(backup, now, scope));
    } catch (e) { setErr(`確認できませんでした: ${(e as Error).message}`); }
    finally { setBusy(false); }
  };

  const run = async () => {
    if (!plan || !current) return;
    setBusy(true); setErr('');
    try {
      // 取り消せるように、復元の直前の状態を保存してから書き込む
      download(`sotsuken-before-restore-${jstDate()}`, 'application/json', JSON.stringify(current, null, 2));
      setProgress(`0 / ${plan.writes.length}`);
      await applyRestore(plan.writes, (n) => setProgress(`${n} / ${plan.writes.length}`));
      setDone(`${plan.writes.length}件を復元しました。復元の直前の状態は、ダウンロードしたファイル (sotsuken-before-restore-…) にあります。`);
      setPlan(null); setCurrent(null); setSure(false);
    } catch (e) { setErr(`復元の途中で止まりました: ${(e as Error).message}。もう一度「内容を確認」から実行すると、残りを書き込めます`); }
    finally { setBusy(false); setProgress(null); }
  };

  return (
    <>
      <h3>バックアップから復元する</h3>
      <div className="card form">
        <p className="hint">
          書き出した(または、毎日の自動バックアップの)JSONファイルを選びます。バックアップの内容で、同じ文書を<strong>上書き</strong>します。
          バックアップにない文書(バックアップ後に増えたもの)は消えません。復元の直前の状態は、自動でダウンロードされます。
        </p>
        <input type="file" accept="application/json,.json" aria-label="バックアップファイル" onChange={(e) => pick(e.target.files?.[0])} />
        {err && <p className="error">{err}</p>}
        {done && <p className="ok">{done}</p>}

        {backup && (
          <>
            <div>
              <strong>{fileName}</strong>(取得: {new Date(backup.meta.exportedAt).toLocaleString('ja-JP')})
              <ul className="plain counts">{counts(backup).map((c) => <li key={c.label}>{c.label}: {c.n}件</li>)}</ul>
            </div>
            <div className="label">復元する範囲</div>
            <label className="check"><input type="checkbox" checked={all} onChange={(e) => { setAll(e.target.checked); reset(); }} />すべて(名簿・設定・予定・全チーム)</label>
            {!all && (
              <div className="chips">
                {teamIds.map((t) => (
                  <label key={t} className={`chip ${teams.includes(t) ? 'on' : ''}`}>
                    <input type="checkbox" checked={teams.includes(t)} onChange={() => { setTeams(teams.includes(t) ? teams.filter((x) => x !== t) : [...teams, t]); reset(); }} />{t}チーム
                  </label>
                ))}
              </div>
            )}
            <label className="check">
              <input type="checkbox" checked={teacherOnly} disabled={!backup.meta.includesTeacherNotes} onChange={(e) => { setTeacherOnly(e.target.checked); reset(); }} />
              教員専用のデータ(教員メモなど)も復元する{!backup.meta.includesTeacherNotes && '(このバックアップには含まれていません)'}
            </label>
            <div className="row">
              <button disabled={busy || (!all && teams.length === 0)} onClick={check}>内容を確認する</button>
            </div>
          </>
        )}

        {plan && (
          <div className="card">
            <div className="label">復元の内容</div>
            {plan.writes.length === 0
              ? <p>変更はありません(いまの状態は、バックアップと同じです)。</p>
              : (
                <>
                  <table className="table">
                    <thead><tr><th>データ</th><th>変更(上書き)</th><th>新しく作る</th></tr></thead>
                    <tbody>
                      {Object.entries(plan.byCollection).map(([p, c]) => <tr key={p}><td>{p}</td><td>{c.changed}</td><td>{c.new}</td></tr>)}
                    </tbody>
                  </table>
                  <p className="hint">変更なし: {plan.unchanged}件 / バックアップにないので、そのまま残る: {plan.extra}件</p>
                  <div className="row">
                    {!sure
                      ? <button className="danger" disabled={busy} onClick={() => { setSure(true); setTimeout(() => setSure(false), 8000); }}>復元する</button>
                      : <button className="danger" disabled={busy} onClick={run}>本当に復元する({plan.writes.length}件を書き込む)</button>}
                    {progress && <span>書き込み中… {progress}</span>}
                  </div>
                </>
              )}
          </div>
        )}
      </div>
    </>
  );
}
