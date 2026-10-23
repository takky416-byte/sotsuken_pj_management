import { collection, doc, increment, query, setDoc, updateDoc, where } from 'firebase/firestore';
import { db } from '../firebase';
import { accessLogId, type AccessLog, type Pending } from '../lib/access';
import { jstDate } from '../lib/dates';
import { useQuery } from './util';

/** 教員のみ。from 以降の、全学生のアクセス記録。 */
export function useAccessLogs(from: string) {
  return useQuery<AccessLog>(query(collection(db, 'accessLogs'), where('date', '>=', from)), `access:${from}`);
}

const known = new Set<string>(); // 今日の記録が、すでにあるとわかっているもの (作成を試さず、更新だけする)

/**
 * 学生が、自分の今日の記録に書き足す。まだなければ作る。
 * 書き込みは、新しいルールで検査される (自分の・今日の記録だけ、数は増える方向にだけ)。
 */
export async function recordAccess(sid: string, teamId: string | null, p: Pending, now = Date.now()): Promise<void> {
  const date = jstDate(new Date(now));
  const ref = doc(db, 'accessLogs', accessLogId(date, sid));
  const key = accessLogId(date, sid);
  const bump = () => {
    const screens: Record<string, unknown> = {};
    for (const [k, n] of Object.entries(p.screens)) screens[`screens.${k}`] = increment(n);
    return updateDoc(ref, { lastAt: now, visits: increment(p.visits), views: increment(p.views), ...screens });
  };
  if (known.has(key)) { await bump(); return; }
  try {
    await setDoc(ref, { sid, teamId, date, firstAt: now, lastAt: now, visits: p.visits, views: p.views, screens: p.screens });
  } catch {
    await bump(); // 別の端末で、すでに今日の記録がある
  }
  known.add(key);
}
