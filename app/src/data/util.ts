import { type Query, onSnapshot } from 'firebase/firestore';
import { countReads, queryLabel } from '../lib/readMeter';
import { useShared } from './shared';

/**
 * クエリを購読して、id 付きのデータの配列を返す。読み込み中は null。
 * 同じ key の購読は、画面をまたいで共有される (shared.ts)。key には、クエリを決めるすべての値を含めること。
 */
export function useQuery<T>(q: Query | null, key: string | null): { data: T[] | null; error: string | null } {
  const r = useShared<T[]>(q ? key : null, (emit, fail) => {
    const label = queryLabel(q);
    return onSnapshot(
      q as Query,
      (s) => { countReads(label, s.docChanges().length); emit(s.docs.map((d) => ({ id: d.id, ...d.data() }) as T)); },
      (e) => fail(e.message),
    );
  });
  return { data: r.data, error: r.error };
}

export function isHttpUrl(s: string): boolean {
  try {
    const u = new URL(s);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}
