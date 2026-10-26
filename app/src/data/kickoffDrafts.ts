import { collection, deleteDoc, doc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import type { DraftEntry, KickoffDraft } from '../lib/draftBundle';
import { useQuery } from './util';

const col = (teamId: string) => collection(db, 'teams', teamId, 'kickoffDrafts');

/** キックオフの叩き台 (先生だけ読める。最大2案)。 */
export function useKickoffDrafts(teamId: string | null) {
  return useQuery<KickoffDraft & { id: string }>(teamId ? col(teamId) : null, `kickoff-drafts:${teamId}`);
}

/** 登録する (同じチーム・案があれば、置き換える) */
export const saveKickoffDraft = (e: DraftEntry) =>
  setDoc(doc(col(e.teamId), String(e.no)), { no: e.no, title: e.title, outline: e.outline, updatedAt: Date.now() });

export const deleteKickoffDraft = (teamId: string, no: 1 | 2) => deleteDoc(doc(col(teamId), String(no)));
