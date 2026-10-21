import { useEffect, useState } from 'react';
import { api } from '../api.js';

export default function Dashboard({ onOpen }) {
  const [students, setStudents] = useState(null);
  const [code, setCode] = useState('');
  const [err, setErr] = useState('');

  useEffect(() => {
    Promise.all([api('GET', '/students'), api('GET', '/invite-code')])
      .then(([s, c]) => { setStudents(s); setCode(c.code); })
      .catch((e) => setErr(e.message));
  }, []);

  if (err) return <p className="error">{err}</p>;
  if (!students) return <p>読み込み中…</p>;

  return (
    <>
      <div className="card">
        学生用招待コード: <code>{code}</code>
        <small>　学生が新規登録時に入力します</small>
      </div>
      <h2>学生の進捗</h2>
      {students.length === 0 ? <p>まだ学生が登録されていません。</p> : (
        <table className="table">
          <thead>
            <tr><th>学生</th><th>研究テーマ</th><th>未着手</th><th>進行中</th><th>完了</th><th>期限超過</th><th>次のマイルストーン</th><th>最新ログ</th><th>未コメント</th></tr>
          </thead>
          <tbody>
            {students.map((s) => (
              <tr key={s.id} onClick={() => onOpen(s)} className="clickable">
                <td>{s.name}</td>
                <td>{s.theme || '—'}</td>
                <td>{s.todo}</td><td>{s.doing}</td><td>{s.done}</td>
                <td className={s.overdue ? 'danger' : ''}>{s.overdue}</td>
                <td>{s.next_milestone ? `${s.next_milestone.title}（〜${s.next_milestone.end_date}）` : '—'}</td>
                <td>{s.last_log ?? '—'}</td>
                <td className={s.unanswered_logs ? 'warn' : ''}>{s.unanswered_logs}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
