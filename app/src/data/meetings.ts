import { addDoc, collection, deleteDoc, doc, query, setDoc, where } from 'firebase/firestore';
import { db } from '../firebase';
import type { Meeting, MeetingAction } from '../lib/meeting';
import { useQuery } from './util';

const col = (teamId: string) => collection(db, 'teams', teamId, 'meetings');

export function useMeetings(teamId: string | null) {
  return useQuery<Meeting>(teamId ? query(col(teamId)) : null, [teamId]);
}

/** 記録の保存 (一部の項目だけでも書ける)。日付がそのままドキュメントのIDになる。 */
export const saveMeeting = (
  teamId: string, date: string, actor: string,
  data: Partial<{ decided: string; actions: MeetingAction[]; note: string }>,
) => setDoc(doc(col(teamId), date), { date, createdBy: actor, ...data, updatedAt: Date.now() }, { merge: true });

/** ミーティングを開いたときの記録 (= 「確認した」の記録)。すでにあれば何もしない側で呼ぶ。 */
export const openMeeting = (teamId: string, date: string, actor: string) =>
  saveMeeting(teamId, date, actor, { decided: '', actions: [], note: '' });

export type Comment = { id: string; body: string; target: { type: 'task' | 'meeting'; id: string }; createdAt: number };

export function useComments(teamId: string | null) {
  return useQuery<Comment>(teamId ? query(collection(db, 'teams', teamId, 'comments')) : null, [teamId]);
}

export const addComment = (teamId: string, body: string, target: Comment['target']) =>
  addDoc(collection(db, 'teams', teamId, 'comments'), { body, target, createdAt: Date.now() });

export type TeacherNote = { id: string; teamId: string; body: string; createdAt: number };

export function useTeacherNotes(teamId: string) {
  return useQuery<TeacherNote>(query(collection(db, 'teacherNotes'), where('teamId', '==', teamId)), [teamId]);
}
export const addTeacherNote = (teamId: string, body: string) =>
  addDoc(collection(db, 'teacherNotes'), { teamId, body, createdAt: Date.now() });
export const deleteTeacherNote = (id: string) => deleteDoc(doc(db, 'teacherNotes', id));
