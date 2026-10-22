import { collection, deleteDoc, doc, getDoc, query, setDoc, updateDoc, where } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { db } from '../firebase';
import type { ClassDay, Milestone } from '../types';
import { useQuery } from './util';

/** 教員は全件、学生は共通 + 自チームのマイルストーン。 */
export function useMilestones(teamId: string | 'all'): Milestone[] | null {
  const all = useQuery<Milestone>(teamId === 'all' ? query(collection(db, 'milestones')) : null, [teamId]);
  const common = useQuery<Milestone>(
    teamId === 'all' ? null : query(collection(db, 'milestones'), where('teamId', '==', null)), [teamId]);
  const mine = useQuery<Milestone>(
    teamId === 'all' ? null : query(collection(db, 'milestones'), where('teamId', '==', teamId)), [teamId]);
  const list = teamId === 'all' ? all.data : common.data && mine.data ? [...common.data, ...mine.data] : null;
  return list && [...list].sort((a, b) => a.date.localeCompare(b.date));
}

export const saveMilestone = (m: Omit<Milestone, 'id'> & { id?: string }) => {
  const { id, ...data } = m;
  const ref = id ? doc(db, 'milestones', id) : doc(collection(db, 'milestones'));
  return setDoc(ref, { ...data, endDate: data.endDate ?? null, note: data.note ?? '' });
};
export const deleteMilestone = (id: string) => deleteDoc(doc(db, 'milestones', id));

export function useClassDays(): ClassDay[] | null {
  const [days, setDays] = useState<ClassDay[] | null>(null);
  useEffect(() => {
    getDoc(doc(db, 'config', 'classDays')).then((s) => setDays(s.exists() ? (s.data().days as ClassDay[]) : []));
  }, []);
  return days;
}

export const saveClassDays = (days: ClassDay[]) => setDoc(doc(db, 'config', 'classDays'), { days });
export const setSetting = (key: 'peerDailyView' | 'rotateOrder' | 'dailyStartDate', v: boolean | string) =>
  updateDoc(doc(db, 'config', 'settings'), { [key]: v });
