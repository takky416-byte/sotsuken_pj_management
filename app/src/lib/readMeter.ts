/**
 * Firestore の読み取り回数の目安を数える (無料枠は 1 日 5 万回)。
 * リスナーが受け取ったドキュメント数 (最初の結果と、その後の追加・更新) を数える。実際の請求の単位に近い。
 * ブラウザの `window.__readMeter` から読める (E2E の計測と、開発者ツールでの確認用)。
 */
export type ReadMeter = { total: number; byLabel: Record<string, number> };

const meter: ReadMeter = { total: 0, byLabel: {} };
if (typeof window !== 'undefined') (window as unknown as { __readMeter: ReadMeter }).__readMeter = meter;

export function countReads(label: string, n: number) {
  if (n <= 0) return;
  meter.total += n;
  meter.byLabel[label] = (meter.byLabel[label] ?? 0) + n;
}

/** クエリのコレクションのパス (teams/A/tasks など)。内部の情報を使うので、見つからなければ 'query'。 */
export function queryLabel(q: unknown): string {
  const path = (q as { _query?: { path?: { canonicalString?: () => string } } })._query?.path?.canonicalString?.();
  return (path ?? 'query').replace(/^teams\/[A-H]\//, 'teams/*/');
}
