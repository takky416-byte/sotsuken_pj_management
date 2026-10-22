import { collection, doc, onSnapshot, query, setDoc, updateDoc } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { db } from '../firebase';
import type { Team } from '../types';
import { useQuery } from './util';

export function useTeams() {
  return useQuery<Team>(query(collection(db, 'teams')), []);
}

export function useTeam(teamId: string | null): Team | null | undefined {
  const [team, setTeam] = useState<Team | null | undefined>(undefined);
  useEffect(() => {
    setTeam(undefined);
    if (!teamId) return;
    return onSnapshot(
      doc(db, 'teams', teamId),
      (s) => setTeam(s.exists() ? ({ id: s.id, ...s.data() } as Team) : null),
      // 権限がなくなったとき (チームを移された、名簿から外された) は、チームがないものとして扱う
      () => setTeam(null),
    );
  }, [teamId]);
  return team;
}

export const updateTeam = (teamId: string, changes: Partial<Omit<Team, 'id'>>) =>
  updateDoc(doc(db, 'teams', teamId), changes);

export const setTeam = (teamId: string, data: Omit<Team, 'id'>) => setDoc(doc(db, 'teams', teamId), data);
