import { useEffect, useState } from 'react';
import { type Query, onSnapshot } from 'firebase/firestore';

/** クエリを購読して、id 付きのデータの配列を返す。読み込み中は null。 */
export function useQuery<T>(q: Query | null, deps: unknown[]): { data: T[] | null; error: string | null } {
  const [data, setData] = useState<T[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    setData(null);
    setError(null);
    if (!q) return;
    return onSnapshot(
      q,
      (s) => setData(s.docs.map((d) => ({ id: d.id, ...d.data() }) as T)),
      (e) => setError(e.message),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return { data, error };
}

export function isHttpUrl(s: string): boolean {
  try {
    const u = new URL(s);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}
