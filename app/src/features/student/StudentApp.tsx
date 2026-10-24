import { NavLink, Navigate, Route, Routes } from 'react-router-dom';
import { useBase } from '../../components/Base';
import { Help } from '../Help';
import { MeetingIndex, MeetingPage } from '../meeting/MeetingPage';
import { StudentDaily } from './StudentDaily';
import { StudentHome } from './StudentHome';
import { StudentReport } from './StudentReport';
import { StudentWbs } from './StudentWbs';

export function StudentNav({ teamId }: { teamId: string | null }) {
  const base = useBase();
  return (
    <nav>
      <NavLink to={`${base}/`} end>ホーム</NavLink>
      <NavLink to={`${base}/wbs`}>WBS・ガントチャート</NavLink>
      <NavLink to={`${base}/report`}>報告書</NavLink>
      <NavLink to={`${base}/daily`}>作業ログ</NavLink>
      <NavLink to={`${base}/meeting/${teamId ?? 'A'}`}>ミーティング</NavLink>
      <NavLink to={`${base}/help`}>使い方</NavLink>
    </nav>
  );
}

/** 学生の画面の中身。本物の学生の画面と、教員のプレビューの両方で使う。 */
export function StudentApp() {
  const base = useBase();
  return (
    <Routes>
      <Route index element={<StudentHome />} />
      <Route path="wbs" element={<StudentWbs />} />
      <Route path="gantt" element={<StudentWbs initial="gantt" />} />
      <Route path="team" element={<Navigate to={base || '/'} replace />} />
      <Route path="report" element={<StudentReport />} />
      <Route path="daily" element={<StudentDaily />} />
      <Route path="help" element={<Help role="student" />} />
      <Route path="meeting" element={<MeetingIndex />} />
      <Route path="meeting/:teamId" element={<MeetingPage />} />
      <Route path="*" element={<Navigate to={base || '/'} replace />} />
    </Routes>
  );
}
