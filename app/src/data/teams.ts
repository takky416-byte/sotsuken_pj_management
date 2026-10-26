import { collection, doc, onSnapshot, query, setDoc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import type { ReportNotes, Team } from '../types';
import { countReads } from '../lib/readMeter';
import { useShared } from './shared';
import { useQuery } from './util';

export function useTeams() {
  return useQuery<Team>(query(collection(db, 'teams')), 'teams');
}

export function useTeam(teamId: string | null): Team | null | undefined {
  const r = useShared<Team | null>(teamId ? `team:${teamId}` : null, (emit) => onSnapshot(
    doc(db, 'teams', teamId as string),
    (s) => { countReads('teams/doc', 1); emit(s.exists() ? ({ id: s.id, ...s.data() } as Team) : null); },
    // 権限がなくなったとき (チームを移された、名簿から外された) は、チームがないものとして扱う
    () => emit(null),
  ));
  return r.ready ? r.data : undefined;
}

export const updateTeam = (teamId: string, changes: Partial<Omit<Team, 'id'>>) =>
  updateDoc(doc(db, 'teams', teamId), changes);

export const setTeam = (teamId: string, data: Omit<Team, 'id'>) => setDoc(doc(db, 'teams', teamId), data);

/** 初期WBSの見直しを終えた、と記録する (チームの学生も書ける) */
export const confirmWbsReview = (teamId: string, sid: string) =>
  updateDoc(doc(db, 'teams', teamId), { wbsReview: { at: Date.now(), by: sid } });

/** 教員が、もう一度見直しを求める */
export const resetWbsReview = (teamId: string) => updateDoc(doc(db, 'teams', teamId), { wbsReview: null });

/** 企業に提出する報告書に載せる文章を保存する (チームの学生も書ける) */
export const saveReportNotes = (teamId: string, sid: string, n: Pick<ReportNotes, 'summary' | 'issues' | 'next'>) =>
  updateDoc(doc(db, 'teams', teamId), { reportNotes: { ...n, by: sid, at: Date.now() } });
