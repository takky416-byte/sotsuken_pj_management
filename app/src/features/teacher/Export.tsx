import { useState } from 'react';
import { Restore } from './Restore';
import { download, loadBackup } from '../../data/export';
import { jstDate } from '../../lib/dates';
import {
  accessCsv, calendarCsv, counts, dailiesCsv, meetingsCsv, rosterCsv, tasksCsv, teacherNotesCsv, withoutTeacherOnly, type Backup,
} from '../../lib/export';

const LAST_KEY = 'last-export';
const lastExport = () => { try { return localStorage.getItem(LAST_KEY); } catch { return null; } };

export function Export() {
  const [backup, setBackup] = useState<Backup | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [withNotes, setWithNotes] = useState(true);
  const [last, setLast] = useState(lastExport());

  const load = async () => {
    setBusy(true); setErr('');
    try { setBackup(await loadBackup()); }
    catch (e) { setErr(`読み込めませんでした: ${(e as Error).message}`); }
    finally { setBusy(false); }
  };

  const mark = () => {
    const d = jstDate();
    try { localStorage.setItem(LAST_KEY, d); } catch { /* 保存できなくても書き出しはできる */ }
    setLast(d);
  };
  const save = (name: string, mime: string, text: string) => { download(`sotsuken-${name}-${jstDate()}`, mime, text); mark(); };

  const json = () => {
    if (!backup) return;
    const data = withNotes ? backup : withoutTeacherOnly(backup);
    save('backup', 'application/json', JSON.stringify(data, null, 2));
  };
  const csv = (name: string, text: string) => save(name, 'text/csv', text);

  return (
    <>
      <h2>データの書き出し</h2>
      <p className="hint">
        バックアップ(JSON)と、Excelで開けるCSVを、このブラウザの中で作ってダウンロードします(外部には送りません)。
        月に1回くらいを目安に、バックアップを取ってください。{last && <> 最後に書き出した日: <strong>{last}</strong></>}
      </p>
      <p className="warn-box">
        書き出したファイルには、学生のメールアドレスや、教員メモ(専用)が含まれます。共有のドライブなどには置かず、
        教員だけがアクセスできる場所に保管してください。
      </p>

      <div className="card form">
        <p className="hint">「読み込む」を押すと、全データを読み込みます(読み取りは、データの件数ぶん発生します。数千件程度です)。</p>
        <div className="row">
          <button disabled={busy} onClick={load}>{backup ? '読み込み直す' : 'データを読み込む'}</button>
          {backup && <span className="hint">読み込み済み({new Date(backup.meta.exportedAt).toLocaleString('ja-JP')})</span>}
        </div>
        {err && <p className="error">{err}</p>}
      </div>

      {backup && (
        <>
          <div className="card">
            <div className="label">読み込んだデータ</div>
            <ul className="plain counts">
              {counts(backup).map((c) => <li key={c.label}>{c.label}: <strong>{c.n}</strong>件</li>)}
            </ul>
          </div>

          <h3>バックアップ(JSON)</h3>
          <div className="card form">
            <label className="check">
              <input type="checkbox" checked={withNotes} onChange={(e) => setWithNotes(e.target.checked)} />
              教員専用のデータ(教員メモなど)も含める
            </label>
            <div className="row"><button onClick={json}>バックアップ(JSON)をダウンロード</button></div>
            <p className="hint">全データが1つのファイルに入ります。復元は、このページ下の「バックアップから復元する」で行います。</p>
          </div>

          <h3>CSV(Excelなどで開く用)</h3>
          <div className="card row">
            <button className="ghost" onClick={() => csv('tasks', tasksCsv(backup))}>タスク</button>
            <button className="ghost" onClick={() => csv('dailies', dailiesCsv(backup))}>日報</button>
            <button className="ghost" onClick={() => csv('meetings', meetingsCsv(backup))}>ミーティング記録</button>
            <button className="ghost" onClick={() => csv('roster', rosterCsv(backup))}>名簿</button>
            <button className="ghost" onClick={() => csv('calendar', calendarCsv(backup))}>予定・授業日</button>
            <button className="ghost" onClick={() => csv('teacher-notes', teacherNotesCsv(backup))}>教員メモ(専用)</button>
            <button className="ghost" onClick={() => csv('access', accessCsv(backup))}>アクセス履歴(専用)</button>
          </div>
        </>
      )}
      <Restore />
    </>
  );
}
