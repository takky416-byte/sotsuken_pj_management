export function Progress({ done, total }: { done: number; total: number }) {
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);
  return (
    <span className="progress" title={`${done}/${total} 完了`}>
      <span className="bar"><span style={{ width: `${pct}%` }} /></span>
      <span className="pct">{total === 0 ? '—' : `${pct}%`}</span>
    </span>
  );
}
