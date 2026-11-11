/** ページ分け: total 件を、1ページ size 件で。page は 1 から。範囲外は、近いページに直す */
export function pageOf(total: number, page: number, size: number): { page: number; pages: number; start: number; end: number } {
  const pages = Math.max(1, Math.ceil(total / size));
  const p = Math.min(Math.max(1, Math.floor(page) || 1), pages);
  const start = (p - 1) * size;
  return { page: p, pages, start, end: Math.min(total, start + size) };
}
