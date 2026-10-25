import { collection, deleteDoc, doc, limit, orderBy, query, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import type { MeetingMinutes } from '../lib/meetingMinutes';
import { useQuery } from './util';

const col = (teamId: string) => collection(db, 'teams', teamId, 'meetingMinutes');

/** 学生のホームで読む議事録 (新しい順に、数件だけ)。 */
export const RECENT_MINUTES = 5;
export function useMinutes(teamId: string | null) {
  return useQuery<MeetingMinutes>(teamId ? query(col(teamId), orderBy('date', 'desc'), limit(RECENT_MINUTES)) : null, `minutes:${teamId}`);
}

/** 教員用: すべての議事録 */
export function useAllMinutes(teamId: string | null) {
  return useQuery<MeetingMinutes>(teamId ? query(col(teamId), orderBy('date', 'desc')) : null, `minutes-all:${teamId}`);
}

/** 公開する (同じ日付があれば、置き換える)。 */
export const publishMinutes = (teamId: string, date: string, text: string) => setDoc(doc(col(teamId), date), { date, text, publishedAt: Date.now() });

export const deleteMinutes = (teamId: string, date: string) => deleteDoc(doc(col(teamId), date));
