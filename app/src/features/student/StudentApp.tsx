import { NavLink, Navigate, Route, Routes } from 'react-router-dom';
import { useBase } from '../../components/Base';
import { WbsReviewCard } from '../../components/WbsReviewCard';
import { Help } from '../Help';
import { MeetingIndex, MeetingPage } from '../meeting/MeetingPage';
import { StudentDaily } from './StudentDaily';
import { StudentHome } from './StudentHome';
import { StudentReport } from './StudentReport';
import { StudentWbs } from './StudentWbs';

/** bottom: スマホでは、画面の下に固定する (本物の画面のヘッダー用)。教員のプレビューでは固定しない。 */
export function StudentNav({ bottom = false }: { teamId: string | null; bottom?: boolean }) {
  const base = useBase();
  return (
    <nav className={bottom ? 'bottom-nav' : undefined}>
      <NavLink to={`${base}/`} end>ホーム</NavLink>
      <NavLink to={`${base}/daily`}>作業ログ</NavLink>
      <NavLink to={`${base}/wbs`} aria-label="WBS・ガントチャート"><span className="nl">WBS・ガントチャート</span><span className="ns" aria-hidden="true">WBS</span></NavLink>
      <NavLink to={`${base}/report`}>PJ分析</NavLink>
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
      <Route path="report" element={<><WbsReviewCard compact /><StudentReport /></>} />
      <Route path="daily" element={<><WbsReviewCard compact /><StudentDaily /></>} />
      <Route path="help" element={<Help role="student" />} />
      <Route path="meeting" element={<MeetingIndex />} />
      <Route path="meeting/:teamId" element={<MeetingPage />} />
      <Route path="*" element={<Navigate to={base || '/'} replace />} />
    </Routes>
  );
}
