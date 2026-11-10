import type { ReactNode } from 'react';
import { parseMarkdown, type Block, type Inline, type ListItem } from '../lib/markdown';
import { LinkCard } from './LinkCard';

const inline = (xs: Inline[]): ReactNode[] => xs.map((x, i) => {
  switch (x.t) {
    case 'text': return x.s;
    case 'br': return <br key={i} />;
    case 'b': return <strong key={i}>{inline(x.c)}</strong>;
    case 'i': return <em key={i}>{inline(x.c)}</em>;
    case 's': return <s key={i}>{inline(x.c)}</s>;
    case 'u': return <u key={i}>{inline(x.c)}</u>;
    case 'code': return <code key={i}>{x.s}</code>;
    case 'a': return <a key={i} href={x.href} target="_blank" rel="noopener noreferrer">{inline(x.c)}</a>;
  }
});

/** 箇条書きの1項目。チェックリストは ☐ / ☑ で出す。字下げの深さは、左の余白で表す */
const item = (it: ListItem, k: number): ReactNode => (
  <li key={k} className={it.check === undefined ? undefined : 'md-check'} style={it.level > 0 ? { marginLeft: `${it.level * 1.2}em` } : undefined}>
    {it.check !== undefined && <span className="md-box" role="img" aria-label={it.check ? '済み' : '未'}>{it.check ? '☑' : '☐'}</span>}{inline(it.c)}
  </li>
);

const block = (b: Block, i: number): ReactNode => {
  switch (b.t) {
    case 'p': return <p key={i}>{inline(b.c)}</p>;
    case 'h': return b.level === 1 ? <h4 key={i}>{inline(b.c)}</h4> : <h5 key={i}>{inline(b.c)}</h5>;
    case 'ul': return <ul key={i} className="md-list">{b.items.map((it, k) => item(it, k))}</ul>;
    case 'ol': return <ol key={i} className="md-list">{b.items.map((it, k) => item(it, k))}</ol>;
    case 'table': return (
      <div key={i} className="md-table-wrap">
        <table className="md-table">
          <thead><tr>{b.head.map((c, k) => <th key={k} style={{ textAlign: b.align[k] ?? undefined }}>{inline(c)}</th>)}</tr></thead>
          <tbody>{b.rows.map((r, k) => <tr key={k}>{b.head.map((_, j) => <td key={j} style={{ textAlign: b.align[j] ?? undefined }}>{inline(r[j] ?? [])}</td>)}</tr>)}</tbody>
        </table>
      </div>
    );
    case 'card': return <LinkCard key={i} href={b.href} />;
    case 'quote': return <blockquote key={i}>{inline(b.c)}</blockquote>;
    case 'code': return <pre key={i}><code>{b.s}</code></pre>;
  }
};

/** 作業ログの説明などを、Markdown として出す (HTML は通さない) */
export function Markdown({ text, className = '' }: { text: string; className?: string }) {
  return <div className={`md ${className}`.trim()}>{parseMarkdown(text).map(block)}</div>;
}
