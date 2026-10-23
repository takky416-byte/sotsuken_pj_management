import { useMemo } from 'react';
import { collection, doc, onSnapshot, query, setDoc, where } from 'firebase/firestore';
import { db } from '../firebase';
import { DEFAULT_DAILY_START, dailyDoc, dailyId, type Daily, type DailyEntry } from '../lib/daily';
import { countReads } from '../lib/readMeter';
import { useShared } from './shared';
import { useQuery } from './util';

const col = (teamId: string) => collection(db, 'teams', teamId, 'dailyReports');

/** チーム全員の日報 (from 以降)。教員、または設定で閲覧が許可されているとき。 */
export function useTeamDailies(teamId: string | null, from: string) {
  return useQuery<Daily>(teamId ? query(col(teamId), where('date', '>=', from)) : null, `dailies:${teamId}:${from}`);
}

/**
 * 自分の日報だけ (from 以降)。
 * 「sid が等しい」と「date が from 以降」を同時に指定する検索は、Firestore に複合インデックスが必要で、
 * 本番では、作らないとエラーになる (エミュレータでは起きない)。インデックスを増やさないため、自分の日報 (授業日の数だけで少ない)
 * をすべて読み、from 以降を画面側で選ぶ。
 */
export function useMyDailies(teamId: string | null, sid: string | null, from: string) {
  const r = useQuery<Daily>(
    teamId && sid ? query(col(teamId), where('sid', '==', sid)) : null,
    `dailies-mine:${teamId}:${sid}`,
  );
  const data = useMemo(() => r.data && r.data.filter((d) => d.date >= from), [r.data, from]);
  return { data, error: r.error };
}

export type Settings = { peerDailyView: boolean; rotateOrder: boolean; dailyStartDate: string };

export function useSettings(): Settings | null {
  const fallback: Settings = { peerDailyView: false, rotateOrder: true, dailyStartDate: DEFAULT_DAILY_START };
  const r = useShared<Settings>('settings', (emit) => onSnapshot(
    doc(db, 'config', 'settings'),
    (d) => {
      countReads('config/settings', 1);
      emit({
        peerDailyView: d.exists() ? d.data().peerDailyView !== false : true,
        rotateOrder: d.exists() ? d.data().rotateOrder !== false : true,
        dailyStartDate: (d.exists() && typeof d.data().dailyStartDate === 'string') ? d.data().dailyStartDate : DEFAULT_DAILY_START,
      });
    },
    () => emit(fallback),
  ));
  return r.data;
}

export const saveDaily = (
  teamId: string, sid: string, date: string, entries: DailyEntry[], blocker: string, prev?: Daily, next = '',
) => setDoc(doc(col(teamId), dailyId(date, sid)), dailyDoc({ sid, date, entries, blocker, absent: false, next }, prev));

/** 教員のみ。欠席にすると内容は空になる。欠席を取り消しても、日報は空のまま (未提出) になる。 */
export const setAbsent = (teamId: string, sid: string, date: string, absent: boolean, prev?: Daily) =>
  setDoc(doc(col(teamId), dailyId(date, sid)), dailyDoc({ sid, date, entries: prev?.entries ?? [], blocker: prev?.blocker ?? '', absent }, prev));
