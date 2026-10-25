import { collection, deleteDoc, doc, limit, orderBy, query, setDoc, writeBatch } from 'firebase/firestore';
import { db } from '../firebase';
import { toSummary, type MeetingDraft, type MeetingSummary } from '../lib/meetingSummary';
import { useQuery } from './util';

const drafts = (teamId: string) => collection(db, 'teams', teamId, 'meetingDrafts');
const summaries = (teamId: string) => collection(db, 'teams', teamId, 'meetingSummaries');

/** 学生に公開した要旨 (新しい順に、数件だけ)。ホームで読む。 */
export const RECENT_SUMMARIES = 5;
export function useSummaries(teamId: string | null) {
  return useQuery<MeetingSummary>(teamId ? query(summaries(teamId), orderBy('date', 'desc'), limit(RECENT_SUMMARIES)) : null, `summaries:${teamId}`);
}

/** 教員用: 公開した要旨のすべて */
export function useAllSummaries(teamId: string | null) {
  return useQuery<MeetingSummary>(teamId ? query(summaries(teamId), orderBy('date', 'desc')) : null, `summaries-all:${teamId}`);
}

/** 教員用: 下書き (録音から作った・自分で書いた) */
export function useDrafts(teamId: string | null) {
  return useQuery<MeetingDraft>(teamId ? query(drafts(teamId), orderBy('date', 'desc')) : null, `drafts:${teamId}`);
}

type Edit = { summary: string; decided: string[]; actions: string[]; concerns: string[] };

/** 下書きの保存 (録音から作ったものを直す・自分で書く)。 */
export const saveDraft = (teamId: string, date: string, e: Edit, prev?: Partial<MeetingDraft>) => setDoc(doc(drafts(teamId), date), {
  date, summary: e.summary, decided: e.decided, actions: e.actions, concerns: e.concerns,
  unclear: prev?.unclear ?? [], source: prev?.source ?? 'manual', ...(prev?.file ? { file: prev.file } : {}),
  createdAt: prev?.createdAt ?? Date.now(), updatedAt: Date.now(),
});

export const deleteDraft = (teamId: string, date: string) => deleteDoc(doc(drafts(teamId), date));

/** 学生に公開する。下書きは、公開と同時に消える (公開をやめると、下書きに戻る)。要旨が空のときは公開しない。 */
export async function publish(teamId: string, date: string, e: Edit): Promise<boolean> {
  const s = toSummary(date, e);
  if (!s) return false;
  const batch = writeBatch(db);
  batch.set(doc(summaries(teamId), date), s);
  batch.delete(doc(drafts(teamId), date));
  await batch.commit();
  return true;
}

/** 公開をやめる: 学生から見えなくして、内容は下書きに戻す。 */
export async function unpublish(teamId: string, s: MeetingSummary) {
  const batch = writeBatch(db);
  batch.set(doc(drafts(teamId), s.date), {
    date: s.date, summary: s.summary, decided: s.decided, actions: s.actions, concerns: s.concerns, unclear: [], source: 'manual', createdAt: Date.now(), updatedAt: Date.now(),
  });
  batch.delete(doc(summaries(teamId), s.date));
  await batch.commit();
}
