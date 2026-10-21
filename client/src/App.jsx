import { useEffect, useState } from 'react';
import { api, setToken, hasToken } from './api.js';
import Auth from './components/Auth.jsx';
import Workspace from './components/Workspace.jsx';
import Dashboard from './components/Dashboard.jsx';

export default function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(hasToken());
  const [student, setStudent] = useState(null); // 教員が閲覧中の学生

  useEffect(() => {
    if (!hasToken()) return;
    api('GET', '/me').then(setUser).catch(() => setToken(null)).finally(() => setLoading(false));
  }, []);

  const login = ({ token, user }) => { setToken(token); setUser(user); };
  const logout = () => { setToken(null); setUser(null); setStudent(null); };

  if (loading) return <p className="center">読み込み中…</p>;
  if (!user) return <Auth onAuth={login} />;

  return (
    <div className="app">
      <header>
        <h1 onClick={() => setStudent(null)}>卒研PJ管理</h1>
        <span className="spacer" />
        <span>{user.name}（{user.role === 'teacher' ? '教員' : '学生'}）</span>
        <button className="ghost" onClick={logout}>ログアウト</button>
      </header>
      <main>
        {user.role === 'student' && <Workspace uid="me" me={user} owner={user} onOwnerChange={setUser} />}
        {user.role === 'teacher' && !student && <Dashboard onOpen={setStudent} />}
        {user.role === 'teacher' && student && (
          <>
            <button className="ghost" onClick={() => setStudent(null)}>← 学生一覧へ</button>
            <Workspace key={student.id} uid={student.id} me={user} owner={student} />
          </>
        )}
      </main>
    </div>
  );
}
