import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth/AuthProvider';
import { LoginPage, NotAllowedPage } from './auth/LoginPage';
import { StudentHome } from './features/student/StudentHome';
import { TeacherHome } from './features/teacher/TeacherHome';

function Shell() {
  const { state, logout } = useAuth();

  if (state.status === 'loading') return <p className="center">読み込み中…</p>;
  if (state.status === 'signedOut') return <LoginPage error={state.error} />;
  if (state.status === 'notAllowed') return <NotAllowedPage state={state} />;

  const { profile } = state;
  return (
    <div className="app">
      <header>
        <h1>卒研PJ管理</h1>
        <span className="spacer" />
        <span>{profile.name}{profile.teamId ? `(${profile.teamId}チーム)` : '(教員)'}</span>
        <button className="ghost" onClick={logout}>ログアウト</button>
      </header>
      <main>
        <Routes>
          <Route path="*" element={profile.role === 'teacher' ? <TeacherHome /> : <StudentHome />} />
        </Routes>
      </main>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Shell />
      </AuthProvider>
    </BrowserRouter>
  );
}
