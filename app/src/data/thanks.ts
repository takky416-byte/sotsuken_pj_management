import { addDoc, collection, deleteDoc, doc, limit, orderBy, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import type { Thank } from '../lib/engagement';
import { jstDate } from '../lib/dates';
import { useQuery } from './util';

const col = (teamId: string) => collection(db, 'teams', teamId, 'thanks');

/** from 以降のありがとう (新しい順)。件数は、期間内の分だけ。 */
export function useThanks(teamId: string | null, from: string) {
  return useQuery<Thank>(
    teamId ? query(col(teamId), where('date', '>=', from), orderBy('date', 'desc'), limit(200)) : null,
    `thanks:${teamId}:${from}`,
  );
}

/** 送る人は、学生ID (教員は 'teacher')。 */
export const sendThanks = (teamId: string, from: string, to: string, note: string) =>
  addDoc(col(teamId), { from, to, note: note.trim(), date: jstDate(), createdAt: Date.now() });

export const deleteThanks = (teamId: string, id: string) => deleteDoc(doc(col(teamId), id));
