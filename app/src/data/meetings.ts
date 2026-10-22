import { addDoc, collection, deleteDoc, doc, limit, orderBy, query, setDoc, where } from 'firebase/firestore';
import { db } from '../firebase';
import type { Meeting, MeetingAction } from '../lib/meeting';
import { useQuery } from './util';

const col = (teamId: string) => collection(db, 'teams', teamId, 'meetings');

/** 新しい記録を数件だけ (今日の記録と、前回の記録があればよい)。全件を読むと、回を重ねるほど読み取りが増える。 */
export const RECENT_MEETINGS = 3;
export function useMeetings(teamId: string | null) {
  return useQuery<Meeting>(teamId ? query(col(teamId), orderBy('date', 'desc'), limit(RECENT_MEETINGS)) : null, `meetings:${teamId}`);
}

/** すべての記録 (教員の「ミーティング記録」タブ用)。件数は回数ぶんだけなので少ない。 */
export function useAllMeetings(teamId: string | null) {
  return useQuery<Meeting>(teamId ? query(col(teamId), orderBy('date', 'desc')) : null, `meetings-all:${teamId}`);
}

export const deleteMeeting = (teamId: string, date: string) => deleteDoc(doc(col(teamId), date));

/** 記録の保存 (一部の項目だけでも書ける)。日付がそのままドキュメントのIDになる。 */
export const saveMeeting = (
  teamId: string, date: string, actor: string,
  data: Partial<{ decided: string; actions: MeetingAction[]; note: string }>,
) => setDoc(doc(col(teamId), date), { date, createdBy: actor, ...data, updatedAt: Date.now() }, { merge: true });

/** ミーティングを開いたときの記録 (= 「確認した」の記録)。すでにあれば何もしない側で呼ぶ。 */
export const openMeeting = (teamId: string, date: string, actor: string) =>
  saveMeeting(teamId, date, actor, { decided: '', actions: [], note: '' });

export type Comment = { id: string; body: string; target: { type: 'task' | 'meeting'; id: string }; createdAt: number };

/** 画面に出すのは新しい数件だけ */
export const RECENT_COMMENTS = 8;
export function useComments(teamId: string | null) {
  return useQuery<Comment>(
    teamId ? query(collection(db, 'teams', teamId, 'comments'), orderBy('createdAt', 'desc'), limit(RECENT_COMMENTS)) : null,
    `comments:${teamId}`,
  );
}

export const addComment = (teamId: string, body: string, target: Comment['target']) =>
  addDoc(collection(db, 'teams', teamId, 'comments'), { body, target, createdAt: Date.now() });

export type TeacherNote = { id: string; teamId: string; body: string; createdAt: number };

export function useTeacherNotes(teamId: string) {
  return useQuery<TeacherNote>(query(collection(db, 'teacherNotes'), where('teamId', '==', teamId)), `notes:${teamId}`);
}
export const addTeacherNote = (teamId: string, body: string) =>
  addDoc(collection(db, 'teacherNotes'), { teamId, body, createdAt: Date.now() });
export const deleteTeacherNote = (id: string) => deleteDoc(doc(db, 'teacherNotes', id));
