import { collection, doc, onSnapshot, query, setDoc, where } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { db } from '../firebase';
import { dailyDoc, dailyId, type Daily, type DailyEntry } from '../lib/daily';
import { useQuery } from './util';

const col = (teamId: string) => collection(db, 'teams', teamId, 'dailyReports');

/** チーム全員の日報 (from 以降)。教員、または設定で閲覧が許可されているとき。 */
export function useTeamDailies(teamId: string | null, from: string) {
  return useQuery<Daily>(teamId ? query(col(teamId), where('date', '>=', from)) : null, [teamId, from]);
}

/** 自分の日報だけ (from 以降)。 */
export function useMyDailies(teamId: string | null, sid: string | null, from: string) {
  return useQuery<Daily>(
    teamId && sid ? query(col(teamId), where('sid', '==', sid), where('date', '>=', from)) : null,
    [teamId, sid, from],
  );
}

export function useSettings(): { peerDailyView: boolean } | null {
  const [s, setS] = useState<{ peerDailyView: boolean } | null>(null);
  useEffect(() => onSnapshot(doc(db, 'config', 'settings'), (d) =>
    setS({ peerDailyView: d.exists() ? d.data().peerDailyView !== false : true })), []);
  return s;
}

export const saveDaily = (
  teamId: string, sid: string, date: string, entries: DailyEntry[], blocker: string, prev?: Daily,
) => setDoc(doc(col(teamId), dailyId(date, sid)), dailyDoc({ sid, date, entries, blocker, absent: false }, prev));

/** 教員のみ。欠席にすると内容は空になる。欠席を取り消しても、日報は空のまま (未提出) になる。 */
export const setAbsent = (teamId: string, sid: string, date: string, absent: boolean, prev?: Daily) =>
  setDoc(doc(col(teamId), dailyId(date, sid)), dailyDoc({ sid, date, entries: prev?.entries ?? [], blocker: prev?.blocker ?? '', absent }, prev));
