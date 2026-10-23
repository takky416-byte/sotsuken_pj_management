import { useLayoutEffect, useRef, type ComponentProps } from 'react';

/**
 * 表。PC では普通の表、スマホ (幅 640px 以下) では、1行を1枚のカードにして、見出しを各項目の左に出す。
 * 見出し (th) の文字を、同じ位置のセル (td) の data-label に入れる (CSS がそれを表示する)。
 */
export function StackTable({ className = '', ...props }: ComponentProps<'table'>) {
  const ref = useRef<HTMLTableElement>(null);
  useLayoutEffect(() => {
    const t = ref.current;
    if (!t) return;
    const heads = [...t.querySelectorAll('thead th')].map((h) => h.textContent?.trim() ?? '');
    t.querySelectorAll('tbody tr').forEach((tr) => {
      [...tr.children].forEach((td, i) => { if (td instanceof HTMLElement) td.dataset.label = heads[i] ?? ''; });
    });
  });
  return <table ref={ref} className={`table stack ${className}`} {...props} />;
}
