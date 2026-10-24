import { collection, doc, increment, query, setDoc, updateDoc, where } from 'firebase/firestore';
import { db } from '../firebase';
import { accessLogId, type AccessLog, type Pending } from '../lib/access';
import { jstDate } from '../lib/dates';
import { useQuery } from './util';

/** 教員のみ。from 以降の、全学生のアクセス記録。 */
export function useAccessLogs(from: string) {
  return useQuery<AccessLog>(query(collection(db, 'accessLogs'), where('date', '>=', from)), `access:${from}`);
}

/**
 * 学生が、自分の今日の記録に書き足す。まだなければ作る。
 * 書き込みは、新しいルールで検査される (自分の・今日の記録だけ、数は増える方向にだけ)。
 */
export async function recordAccess(sid: string, teamId: string | null, p: Pending, now = Date.now()): Promise<void> {
  const date = jstDate(new Date(now));
  const ref = doc(db, 'accessLogs', accessLogId(date, sid));
  const bump = () => {
    const screens: Record<string, unknown> = {};
    for (const [k, n] of Object.entries(p.screens)) screens[`screens.${k}`] = increment(n);
    return updateDoc(ref, { lastAt: now, visits: increment(p.visits), views: increment(p.views), ...screens });
  };
  // まず更新を試す (今日の記録がすでにあれば、こちらで足せる)。なければ作る。
  // 先に「作る」を試すと、すでにある記録を、少ない数で上書きしてしまうことがある
  try {
    await bump();
  } catch {
    await setDoc(ref, { sid, teamId, date, firstAt: now, lastAt: now, visits: p.visits, views: p.views, screens: p.screens });
  }
}
