import { useMemo, useState } from 'react';
import { collection, doc, query, writeBatch } from 'firebase/firestore';
import { db } from '../../firebase';
import { useTeams } from '../../data/teams';
import { useQuery } from '../../data/util';
import { assignSids, parseRoster } from '../../lib/csv';
import { planMove, sortMembers, withMember, withoutMember } from '../../lib/rosterEdit';
import { TEAM_IDS, type Member, type Team } from '../../types';

type RosterDoc = { id: string; name: string; role: 'student' | 'teacher'; teamId: string | null; sid: string | null };

export function Roster() {
  const { data: rosterDocs, error } = useQuery<RosterDoc>(query(collection(db, 'roster')), []);
  const { data: teams } = useTeams();
  const [text, setText] = useState('');
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const existing = useMemo(() => new Map((rosterDocs ?? []).map((d) => [d.id, d])), [rosterDocs]);
  const teamById = useMemo(() => new Map((teams ?? []).map((t) => [t.id, t])), [teams]);
  const parsed = useMemo(() => parseRoster(text), [text]);
  const plan = useMemo(() => assignSids(parsed.rows, existing), [parsed.rows, existing]);

  if (error) return <p className="error">読み込めませんでした: {error}</p>;
  if (!rosterDocs || !teams) return <p>読み込み中…</p>;

  const run = async (fn: () => Promise<unknown>, done?: string) => {
    setBusy(true); setErr(''); setMsg('');
    try { await fn(); if (done) setMsg(done); }
    catch (e) { setErr(`できませんでした: ${(e as Error).message}`); }
    finally { setBusy(false); }
  };

  const membersOf = (teamId: string): Member[] => teamById.get(teamId)?.members ?? [];
  const teamRef = (teamId: string) => doc(db, 'teams', teamId);

  const register = () => run(async () => {
    const batch = writeBatch(db);
    const byTeam = new Map<string, Member[]>();
    for (const r of plan) {
      batch.set(doc(db, 'roster', r.email), { name: r.name, role: 'student', teamId: r.teamId, sid: r.sid });
      // 既に別のチームだった人を、新しいチームに移した場合は、元のチームのメンバー表から外す
      const old = existing.get(r.email);
      if (old?.teamId && old.teamId !== r.teamId && old.sid) {
        byTeam.set(old.teamId, withoutMember(byTeam.get(old.teamId) ?? membersOf(old.teamId), old.sid));
      }
      byTeam.set(r.teamId, withMember(byTeam.get(r.teamId) ?? membersOf(r.teamId), { sid: r.sid, name: r.name }));
    }
    for (const [teamId, members] of byTeam) batch.set(teamRef(teamId), { members: sortMembers(members) }, { merge: true });
    await batch.commit();
    setText('');
  }, `${plan.length}名を登録しました。`);

  const rename = (s: RosterDoc, name: string) => run(async () => {
    const batch = writeBatch(db);
    batch.update(doc(db, 'roster', s.id), { name });
    if (s.teamId && s.sid) batch.set(teamRef(s.teamId), { members: withMember(membersOf(s.teamId), { sid: s.sid, name }) }, { merge: true });
    await batch.commit();
  }, `苗字を「${name}」に変更しました。`);

  const move = (s: RosterDoc, toTeamId: string) => run(async () => {
    if (!s.teamId || !s.sid) return;
    const p = planMove({ sid: s.sid, name: s.name }, membersOf(s.teamId), toTeamId, membersOf(toTeamId), rosterDocs.map((d) => d.sid ?? ''));
    const batch = writeBatch(db);
    batch.update(doc(db, 'roster', s.id), { teamId: toTeamId, sid: p.newSid });
    batch.set(teamRef(s.teamId), { members: p.fromMembers }, { merge: true });
    batch.set(teamRef(toTeamId), { members: p.toMembers }, { merge: true });
    await batch.commit();
  }, `${s.name}さんを${toTeamId}チームに移しました(学生ID: ${s.sid} → 新しいID)。`);

  const remove = (s: RosterDoc) => run(async () => {
    const batch = writeBatch(db);
    batch.delete(doc(db, 'roster', s.id));
    if (s.teamId && s.sid) batch.set(teamRef(s.teamId), { members: withoutMember(membersOf(s.teamId), s.sid) }, { merge: true });
    await batch.commit();
  }, `${s.name}さんを名簿から外しました。`);

  const students = rosterDocs.filter((d) => d.role === 'student')
    .sort((a, b) => (a.sid ?? '').localeCompare(b.sid ?? '', 'en', { numeric: true }));

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
                    <td>{existing.has(r.email) ? '更新' : '新規'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="row">
          <button disabled={busy || plan.length === 0 || parsed.errors.length > 0} onClick={register}>
            {plan.length}名を登録する
          </button>
        </div>
      </div>
      {err && <p className="error">{err}</p>}
      {msg && <p className="ok">{msg}</p>}

      <h3>登録済みの学生 ({students.length}名)</h3>
      <p className="hint">
        苗字の変更、チームの変更、名簿からの削除ができます。チームを変えると学生IDも新しいチームの番号になり、
        これまでの日報・担当は元のチームに残ります。名簿から外すと、その学生はログインできなくなります(日報などのデータは消えません)。
      </p>
      <div className="table-wrap">
        <table className="table">
          <thead><tr><th>ID</th><th>苗字</th><th>メールアドレス</th><th>チーム</th><th></th></tr></thead>
          <tbody>
            {students.map((s) => (
              <StudentRow key={`${s.id}-${s.name}-${s.teamId}`} s={s} busy={busy}
                onRename={(n) => rename(s, n)} onMove={(t) => move(s, t)} onRemove={() => remove(s)} />
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function StudentRow({ s, busy, onRename, onMove, onRemove }: {
  s: RosterDoc; busy: boolean; onRename: (name: string) => void; onMove: (teamId: string) => void; onRemove: () => void;
}) {
  const [name, setName] = useState(s.name);
  const [sure, setSure] = useState(false);
  const changed = name.trim() !== '' && name.trim() !== s.name;
  return (
    <tr>
      <td>{s.sid}</td>
      <td>
        <input value={name} maxLength={20} aria-label={`${s.name}の苗字`} onChange={(e) => setName(e.target.value)} />
        {changed && <button className="ghost" disabled={busy} onClick={() => onRename(name.trim())}>保存</button>}
      </td>
      <td>{s.id}</td>
      <td>
        <select value={s.teamId ?? ''} aria-label={`${s.name}のチーム`} disabled={busy} onChange={(e) => e.target.value !== s.teamId && onMove(e.target.value)}>
          {TEAM_IDS.map((t: Team['id']) => <option key={t} value={t}>{t}</option>)}
        </select>
      </td>
      <td>
        {!sure
          ? <button className="ghost danger" disabled={busy} onClick={() => { setSure(true); setTimeout(() => setSure(false), 4000); }}>名簿から外す</button>
          : <button className="ghost danger" disabled={busy} onClick={onRemove}>本当に外す</button>}
      </td>
    </tr>
  );
}
