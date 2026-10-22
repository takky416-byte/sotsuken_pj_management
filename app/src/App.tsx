import { BrowserRouter, NavLink, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth/AuthProvider';
import { LoginPage, NotAllowedPage } from './auth/LoginPage';
import { StudentHome } from './features/student/StudentHome';
import { StudentWbs } from './features/student/StudentWbs';
import { CalendarPage } from './features/teacher/CalendarPage';
import { Kickoff } from './features/teacher/Kickoff';
import { Roster } from './features/teacher/Roster';
import { TeacherHome } from './features/teacher/TeacherHome';
import { TeacherTeam } from './features/teacher/TeacherTeam';

function Shell() {
  const { state, logout } = useAuth();

  if (state.status === 'loading') return <p className="center">読み込み中…</p>;
  if (state.status === 'signedOut') return <LoginPage error={state.error} />;
  if (state.status === 'notAllowed') return <NotAllowedPage state={state} />;

  const { profile } = state;
  const teacher = profile.role === 'teacher';
  return (
    <div className="app">
      <header>
        <h1>卒研PJ管理</h1>
        <nav>
          {teacher ? (
            <>
              <NavLink to="/teacher" end>チーム</NavLink>
              <NavLink to="/teacher/roster">名簿</NavLink>
              <NavLink to="/teacher/calendar">カレンダー</NavLink>
            </>
          ) : (
            <>
              <NavLink to="/" end>ホーム</NavLink>
              <NavLink to="/wbs">WBS</NavLink>
            </>
          )}
        </nav>
        <span className="spacer" />
        <span className="who">{profile.name}{profile.teamId ? `(${profile.teamId}チーム)` : '(教員)'}</span>
        <button className="ghost" onClick={logout}>ログアウト</button>
      </header>
      <main>
        {teacher ? (
          <Routes>
            <Route path="/teacher" element={<TeacherHome />} />
            <Route path="/teacher/team/:id" element={<TeacherTeam />} />
            <Route path="/teacher/kickoff/:id" element={<Kickoff />} />
            <Route path="/teacher/roster" element={<Roster />} />
            <Route path="/teacher/calendar" element={<CalendarPage />} />
            <Route path="*" element={<Navigate to="/teacher" replace />} />
          </Routes>
        ) : (
          <Routes>
            <Route path="/" element={<StudentHome />} />
            <Route path="/wbs" element={<StudentWbs />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        )}
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
