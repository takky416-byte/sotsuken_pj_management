import { useEffect, type ReactElement } from 'react';
import { BrowserRouter, NavLink, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth/AuthProvider';
import { ReadOnlyContext } from './auth/ReadOnly';
import { LoginPage, NotAllowedPage } from './auth/LoginPage';
import { Help } from './features/Help';
import { Celebration } from './components/Celebration';
import { ThemePicker } from './components/ThemePicker';
import { Notice } from './components/Notice';
import { MeetingIndex, MeetingPage } from './features/meeting/MeetingPage';
import { StudentApp, StudentNav } from './features/student/StudentApp';
import { AccessTracker } from './components/AccessTracker';
import { VIEWER_PREFIX } from './lib/access';
import { GuideAutoOpen, GuideButton, GuideProvider } from './components/Guide';
import { Usage } from './features/teacher/Usage';
import { Attendance } from './features/teacher/Attendance';
import { Kickoff } from './features/teacher/Kickoff';
import { Preview } from './features/teacher/Preview';
import { Settings } from './features/teacher/Settings';
import { TeacherReport } from './features/teacher/TeacherReport';
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
  const viewer = profile.role === 'viewer'; // 閲覧専用の教員: 教員の画面を、見るだけ
  const teacher = profile.role === 'teacher' || viewer; // 学生ではない (教員の画面を使う)
  const only = (el: ReactElement) => (viewer ? <Navigate to="/teacher" replace /> : el); // 閲覧専用では開けない画面
  const shell = (
    <div className="app">
      <header>
        <h1>卒研PJ管理</h1>
        {teacher ? (
          <nav>
            <NavLink to="/teacher" end>チーム</NavLink>
            <NavLink to="/teacher/report">PJ分析</NavLink>
            <NavLink to="/meeting">ミーティング</NavLink>
            {!viewer && <NavLink to="/teacher/attendance">欠席</NavLink>}
            {!viewer && <NavLink to="/teacher/usage">利用状況</NavLink>}
            {!viewer && <NavLink to="/teacher/preview">学生の画面</NavLink>}
            {!viewer && <NavLink to="/teacher/settings">設定</NavLink>}
            <NavLink to="/teacher/help">使い方</NavLink>
          </nav>
        ) : (
          <StudentNav teamId={profile.teamId} bottom />
        )}
        <span className="spacer" />
        <span className="who">{profile.name}{profile.teamId ? `(${profile.teamId}チーム)` : viewer ? '(教員・閲覧のみ)' : '(教員)'}</span>
        <GuideButton />
        <ThemePicker />
        <button className="ghost" onClick={logout}>ログアウト</button>
      </header>
      <Celebration />
      <main>
        {teacher ? (
          <ReadOnlyContext.Provider value={viewer}>
          {viewer && <AccessTracker sid={`${VIEWER_PREFIX}${profile.email}`} teamId={null} name={profile.name} />}
          {viewer && <p className="card readonly-banner" role="note">閲覧専用のアカウントです。全チームの状況を見られますが、データの変更はできません。</p>}
          <Routes>
            <Route path="/teacher" element={<TeacherHome />} />
            <Route path="/meeting" element={<MeetingIndex />} />
            <Route path="/meeting/:teamId" element={<MeetingPage />} />
            <Route path="/teacher/team/:id" element={<TeacherTeam />} />
            <Route path="/teacher/report" element={<TeacherReport />} />
            <Route path="/teacher/report/:id" element={<TeacherReport />} />
            <Route path="/teacher/kickoff/:id" element={only(<Kickoff />)} />
            <Route path="/teacher/preview" element={only(<Preview />)} />
            <Route path="/teacher/preview/:sid/*" element={only(<Preview />)} />
            <Route path="/teacher/usage" element={only(<Usage />)} />
            <Route path="/teacher/logs" element={<Navigate to="/teacher/usage?tab=logs" replace />} />
            <Route path="/teacher/attendance" element={only(<Attendance />)} />
            <Route path="/teacher/access" element={<Navigate to="/teacher/usage?tab=access" replace />} />
            <Route path="/teacher/roster" element={<Navigate to="/teacher/settings?tab=roster" replace />} />
            <Route path="/teacher/export" element={<Navigate to="/teacher/settings?tab=export" replace />} />
            <Route path="/teacher/settings" element={only(<Settings />)} />
 <Route path="/teacher/help" element={<Help role="teacher" />} />
            <Route path="/teacher/calendar" element={<Navigate to="/teacher/settings?tab=calendar" replace />} />
            <Route path="*" element={<Navigate to="/teacher" replace />} />
          </Routes>
          </ReadOnlyContext.Provider>
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
