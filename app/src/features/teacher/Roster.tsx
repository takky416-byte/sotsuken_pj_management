import { useEffect, useMemo, useState } from 'react';
import { collection, doc, getDocs, setDoc, writeBatch } from 'firebase/firestore';
import { db } from '../../firebase';
import { assignSids, parseRoster } from '../../lib/csv';
import type { Member } from '../../types';

type RosterDoc = { name: string; role: 'student' | 'teacher'; teamId: string | null; sid: string | null };

export function Roster() {
  const [existing, setExisting] = useState<Map<string, RosterDoc> | null>(null);
  const [text, setText] = useState('');
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const load = () => getDocs(collection(db, 'roster')).then((s) =>
    setExisting(new Map(s.docs.map((d) => [d.id, d.data() as RosterDoc]))));
  useEffect(() => { load().catch((e) => setErr(e.message)); }, []);

  const parsed = useMemo(() => parseRoster(text), [text]);
  const plan = useMemo(() => (existing ? assignSids(parsed.rows, existing) : []), [parsed.rows, existing]);

  const register = async () => {
    if (!existing || plan.length === 0) return;
    setBusy(true); setErr(''); setMsg('');
    try {
      const batch = writeBatch(db);
      for (const r of plan) {
        batch.set(doc(db, 'roster', r.email), { name: r.name, role: 'student', teamId: r.teamId, sid: r.sid });
      }
      await batch.commit();

      // チームのメンバー表示用データを作り直す (名簿の学生をチームごとにまとめる)
      const students = new Map<string, RosterDoc & { email: string }>();
      for (const [email, d] of existing) if (d.role === 'student') students.set(email, { ...d, email });
      for (const r of plan) students.set(r.email, { name: r.name, role: 'student', teamId: r.teamId, sid: r.sid, email: r.email });
      const byTeam = new Map<string, Member[]>();
      for (const s of students.values()) {
        if (!s.teamId || !s.sid) continue;
        byTeam.set(s.teamId, [...(byTeam.get(s.teamId) ?? []), { sid: s.sid, name: s.name }]);
      }
      const num = (sid: string) => Number(sid.slice(1));
      for (const [teamId, members] of byTeam) {
        await setDoc(doc(db, 'teams', teamId), { members: members.sort((a, b) => num(a.sid) - num(b.sid)) }, { merge: true });
      }
      setMsg(`${plan.length}名を登録しました。`);
      setText('');
      await load();
    } catch (e) {
      setErr(`登録できませんでした: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  const students = existing ? [...existing.entries()].filter(([, d]) => d.role === 'student') : [];

  return (
    <>
      <h2>名簿の登録</h2>
      <div className="card form">
        <label>CSV を貼り付け (苗字,メールアドレス,チーム)
          <textarea rows={8} value={text} onChange={(e) => setText(e.target.value)}
            placeholder={'苗字,メールアドレス,チーム\n岩田,xxxx@trident.ac.jp,A'} />
        </label>
        <p className="hint">1行目が見出しなら読み飛ばします。同姓の学生は「鈴木秀」「鈴木空」のように区別できる名前にしてください。同じメールアドレスは上書きします。</p>
        {parsed.errors.length > 0 && (
          <ul className="error plain">{parsed.errors.map((e) => <li key={e.line}>{e.line}行目: {e.message}</li>)}</ul>
        )}
        {plan.length > 0 && (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>ID</th><th>苗字</th><th>メールアドレス</th><th>チーム</th><th></th></tr></thead>
              <tbody>
                {plan.map((r) => (
                  <tr key={r.email}>
                    <td>{r.sid}</td><td>{r.name}</td><td>{r.email}</td><td>{r.teamId}</td>
                    <td>{existing?.has(r.email) ? '更新' : '新規'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {err && <p className="error">{err}</p>}
        {msg && <p className="ok">{msg}</p>}
        <div className="row">
          <button disabled={busy || plan.length === 0 || parsed.errors.length > 0} onClick={register}>
            {plan.length}名を登録する
          </button>
        </div>
      </div>

      <h3>登録済みの学生 ({students.length}名)</h3>
      <div className="table-wrap">
        <table className="table">
          <thead><tr><th>ID</th><th>苗字</th><th>メールアドレス</th><th>チーム</th></tr></thead>
          <tbody>
            {students.sort(([, a], [, b]) => (a.sid ?? '').localeCompare(b.sid ?? '', 'en', { numeric: true })).map(([email, d]) => (
              <tr key={email}><td>{d.sid}</td><td>{d.name}</td><td>{email}</td><td>{d.teamId}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
