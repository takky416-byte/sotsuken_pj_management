import { useState } from 'react';
import { collection, getDocs, limit, orderBy, query } from 'firebase/firestore';
import { db } from '../firebase';
import { countReads } from '../lib/readMeter';
import { describeChange, type TaskLog } from '../lib/taskLog';
import type { Member } from '../types';

const LIMIT = 100;

const fmt = (ms: number): string => {
  const d = new Date(ms + 9 * 3600 * 1000); // JST
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
};

/**
 * タスクの変更履歴 (誰が・いつ・何を・どう変えたか)。チームの学生と教員が見られる。
 * 開いたときに、新しい順に最大100件だけ読む (読み取りを増やさないよう、開くまでは読まない)。
 */
export function TaskHistory({ teamId, members }: { teamId: string; members: Member[] }) {
  const [logs, setLogs] = useState<TaskLog[] | null>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const nameOf = (sid: string) => (sid === 'teacher' ? '先生' : members.find((m) => m.sid === sid)?.name ?? sid);

  const load = async () => {
    setBusy(true); setErr('');
    try {
      const s = await getDocs(query(collection(db, 'teams', teamId, 'taskLogs'), orderBy('at', 'desc'), limit(LIMIT)));
      countReads('taskLogs', s.size);
      setLogs(s.docs.map((d) => ({ id: d.id, ...d.data() }) as TaskLog));
    } catch (e) { setErr(`読み込めませんでした: ${(e as Error).message}`); } finally { setBusy(false); }
  };

  return (
    <details className="card task-history" onToggle={(e) => { if ((e.currentTarget as HTMLDetailsElement).open && logs === null) void load(); }}>
      <summary>変更履歴(誰が・いつ・何を変えたか)</summary>
      {err && <p className="error">{err}</p>}
      {logs === null && !err && <p className="hint">読み込み中…</p>}
      {logs && logs.length === 0 && <p className="hint">まだ履歴はありません。</p>}
      {logs && logs.length > 0 && (
        <ul className="plain history-list">
          {logs.map((l) => (
            <li key={l.id}>
              <span className="history-when">{fmt(l.at)}</span>
              <strong>{nameOf(l.by)}</strong>
              <span>
                {l.kind === 'create' && <>が「{l.title}」を追加</>}
                {l.kind === 'delete' && <>が「{l.title}」を削除</>}
                {l.kind === 'restore' && <>が「{l.title}」を元に戻した</>}
                {l.kind === 'update' && <>が「{l.title}」を変更({l.changes.map((c) => describeChange(c, nameOf)).join(' / ')})</>}
                {l.via && <small className="hint"> ・{l.via}</small>}
              </span>
            </li>
          ))}
        </ul>
      )}
      {logs && <p className="hint">新しい順に、最大{LIMIT}件を表示します。<button type="button" className="ghost" disabled={busy} onClick={() => void load()}>更新する</button></p>}
    </details>
  );
}
