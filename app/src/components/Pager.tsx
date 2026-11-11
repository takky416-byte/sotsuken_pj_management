import { pageOf } from '../lib/paging';

/** 「前へ / 次へ」と、いまの件数。1ページに収まるときは、件数だけ (何も出さない場合もある) */
export function Pager({ total, page, size, onPage, label = '件' }: { total: number; page: number; size: number; onPage: (p: number) => void; label?: string }) {
  const r = pageOf(total, page, size);
  if (total <= size) return null;
  return (
    <nav className="pager" aria-label="ページの切り替え">
      <button type="button" className="ghost" disabled={r.page <= 1} onClick={() => onPage(r.page - 1)}>← 前へ</button>
      <span className="pager-info" aria-live="polite">{r.start + 1}〜{r.end}{label} / 全{total}{label}(ページ {r.page} / {r.pages})</span>
      <button type="button" className="ghost" disabled={r.page >= r.pages} onClick={() => onPage(r.page + 1)}>次へ →</button>
    </nav>
  );
}
