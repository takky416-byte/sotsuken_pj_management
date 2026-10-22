import { BrowserRouter, NavLink, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth/AuthProvider';
import { LoginPage, NotAllowedPage } from './auth/LoginPage';
import { Notice } from './components/Notice';
import { StudentDaily } from './features/student/StudentDaily';
import { StudentHome } from './features/student/StudentHome';
import { StudentWbs } from './features/student/StudentWbs';
import { Attendance } from './features/teacher/Attendance';
import { CalendarPage } from './features/teacher/CalendarPage';
import { Kickoff } from './features/teacher/Kickoff';
import { Roster } from './features/teacher/Roster';
import { Settings } from './features/teacher/Settings';
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
              <NavLink to="/teacher/attendance">欠席</NavLink>
              <NavLink to="/teacher/roster">名簿</NavLink>
              <NavLink to="/teacher/calendar">カレンダー</NavLink>
              <NavLink to="/teacher/settings">設定</NavLink>
            </>
          ) : (
            <>
              <NavLink to="/" end>ホーム</NavLink>
              <NavLink to="/wbs">WBS</NavLink>
              <NavLink to="/daily">日報</NavLink>
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
            <Route path="/teacher/attendance" element={<Attendance />} />
            <Route path="/teacher/roster" element={<Roster />} />
            <Route path="/teacher/settings" element={<Settings />} />
            <Route path="/teacher/calendar" element={<CalendarPage />} />
            <Route path="*" element={<Navigate to="/teacher" replace />} />
          </Routes>
        ) : (
          <Notice email={profile.email}>
          <Routes>
            <Route path="/" element={<StudentHome />} />
            <Route path="/wbs" element={<StudentWbs />} />
            <Route path="/daily" element={<StudentDaily />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
          </Notice>
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
