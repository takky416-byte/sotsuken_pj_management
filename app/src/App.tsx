import { useEffect } from 'react';
import { BrowserRouter, NavLink, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth/AuthProvider';
import { LoginPage, NotAllowedPage } from './auth/LoginPage';
import { Help } from './features/Help';
import { Celebration } from './components/Celebration';
import { ThemePicker } from './components/ThemePicker';
import { Notice } from './components/Notice';
import { MeetingIndex, MeetingPage } from './features/meeting/MeetingPage';
import { StudentApp, StudentNav } from './features/student/StudentApp';
import { AccessTracker } from './components/AccessTracker';
import { GuideAutoOpen, GuideButton, GuideProvider } from './components/Guide';
import { AccessLogPage } from './features/teacher/AccessLog';
import { Attendance } from './features/teacher/Attendance';
import { CalendarPage } from './features/teacher/CalendarPage';
import { Kickoff } from './features/teacher/Kickoff';
import { Preview } from './features/teacher/Preview';
import { Settings } from './features/teacher/Settings';
import { TeacherHome } from './features/teacher/TeacherHome';
import { TeacherTeam } from './features/teacher/TeacherTeam';

function Shell() {
  const { state, logout } = useAuth();
  const { pathname } = useLocation();
  // メニューが横にはみ出すとき (スマホ) は、いまのページのメニューが見える位置までスクロールする
  useEffect(() => {
    document.querySelector('header nav a.active')?.scrollIntoView({ inline: 'center', block: 'nearest' });
  }, [pathname, state.status]);

  if (state.status === 'loading') return <p className="center">読み込み中…</p>;
  if (state.status === 'signedOut') return <LoginPage error={state.error} />;
  if (state.status === 'notAllowed') return <NotAllowedPage state={state} />;

  const { profile } = state;
  const teacher = profile.role === 'teacher';
  const shell = (
    <div className="app">
      <header>
        <h1>卒研PJ管理</h1>
        {teacher ? (
          <nav>
            <NavLink to="/teacher" end>チーム</NavLink>
            <NavLink to="/meeting">ミーティング</NavLink>
            <NavLink to="/teacher/attendance">欠席</NavLink>
            <NavLink to="/teacher/access">アクセス</NavLink>
            <NavLink to="/teacher/preview">学生の画面</NavLink>
            <NavLink to="/teacher/calendar">カレンダー</NavLink>
            <NavLink to="/teacher/settings">設定</NavLink>
            <NavLink to="/teacher/help">使い方</NavLink>
          </nav>
        ) : (
          <StudentNav teamId={profile.teamId} bottom />
        )}
        <span className="spacer" />
        <span className="who">{profile.name}{profile.teamId ? `(${profile.teamId}チーム)` : '(教員)'}</span>
        <GuideButton />
        <ThemePicker />
        <button className="ghost" onClick={logout}>ログアウト</button>
      </header>
      <Celebration />
      <main>
        {teacher ? (
          <Routes>
            <Route path="/teacher" element={<TeacherHome />} />
            <Route path="/meeting" element={<MeetingIndex />} />
            <Route path="/meeting/:teamId" element={<MeetingPage />} />
            <Route path="/teacher/team/:id" element={<TeacherTeam />} />
            <Route path="/teacher/kickoff/:id" element={<Kickoff />} />
            <Route path="/teacher/preview" element={<Preview />} />
            <Route path="/teacher/preview/:sid/*" element={<Preview />} />
            <Route path="/teacher/attendance" element={<Attendance />} />
            <Route path="/teacher/access" element={<AccessLogPage />} />
            <Route path="/teacher/roster" element={<Navigate to="/teacher/settings?tab=roster" replace />} />
            <Route path="/teacher/export" element={<Navigate to="/teacher/settings?tab=export" replace />} />
            <Route path="/teacher/settings" element={<Settings />} />
 <Route path="/teacher/help" element={<Help role="teacher" />} />
            <Route path="/teacher/calendar" element={<CalendarPage />} />
            <Route path="*" element={<Navigate to="/teacher" replace />} />
          </Routes>
        ) : (
          <Notice email={profile.email}>
            {profile.sid && <AccessTracker sid={profile.sid} teamId={profile.teamId} />}
            <GuideAutoOpen email={profile.email} />
            <StudentApp />
          </Notice>
        )}
      </main>
    </div>
  );
  // 利用ガイドは、学生だけ (教員のプレビューには出さない)
  return teacher ? shell : <GuideProvider email={profile.email}>{shell}</GuideProvider>;
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
