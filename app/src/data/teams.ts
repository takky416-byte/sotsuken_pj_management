import { collection, doc, getDocs, onSnapshot, query, setDoc, updateDoc, writeBatch } from 'firebase/firestore';
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

/**
 * 企業に提出する報告書に載せる文章を保存する (チームの学生も書ける)。
 * 文章ごとの記入日時は、その文章を書き換えたときだけ更新する (書き換えていない文章は、前の日時のまま)。
 */
export const saveReportNotes = (
  teamId: string, sid: string, n: Pick<ReportNotes, 'summary' | 'issues' | 'next'>, prev?: ReportNotes | null,
) => {
  const now = Date.now();
  const stamp = (k: 'summary' | 'issues' | 'next'): number | undefined => {
    if (!n[k].trim()) return undefined; // 空にしたら、日付も消す
    return n[k] === (prev?.[k] ?? '') ? (prev?.[`${k}At`] ?? prev?.at ?? now) : now;
  };
  const at = { summaryAt: stamp('summary'), issuesAt: stamp('issues'), nextAt: stamp('next') };
  const clean = Object.fromEntries(Object.entries(at).filter(([, v]) => v !== undefined));
  return updateDoc(doc(db, 'teams', teamId), { reportNotes: { ...n, ...clean, by: sid, at: now } });
};

/** キックオフの「最初からやり直す」で消すもの (チームの下の、タスク・作業ログ・変更履歴・ミーティング記録・コメント・ありがとう・議事録) */
export const WIPE_COLLECTIONS = ['tasks', 'digest', 'dailyReports', 'taskLogs', 'meetings', 'comments', 'thanks', 'meetingMinutes'] as const;

/**
 * チームを、キックオフ前の状態に戻す (教員だけ)。WIPE_COLLECTIONS をすべて消し、チームを「企画検討中」にして、
 * 企画名・企画の記録・見直しの記録・報告書の文章を空にする。共有フォルダ・成果物の提出先・先生のメッセージ・登録した叩き台・アクセス履歴は、そのまま。
 * 元には戻せない。返り値は、消した件数。
 */
export async function wipeTeamForRestart(teamId: string): Promise<number> {
  let n = 0;
  for (const name of WIPE_COLLECTIONS) {
    const snap = await getDocs(collection(db, 'teams', teamId, name));
    for (let i = 0; i < snap.docs.length; i += 400) {
      const batch = writeBatch(db);
      snap.docs.slice(i, i + 400).forEach((d) => batch.delete(d.ref));
      await batch.commit();
    }
    n += snap.size;
  }
  await updateDoc(doc(db, 'teams', teamId), { status: 'planning', projectName: '', proposals: [], kickoffAt: null, wbsReview: null, reportNotes: null });
  return n;
}
