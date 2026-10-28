import type { ReactNode } from 'react';
import { parseMarkdown, type Block, type Inline } from '../lib/markdown';

const inline = (xs: Inline[]): ReactNode[] => xs.map((x, i) => {
  switch (x.t) {
    case 'text': return x.s;
    case 'br': return <br key={i} />;
    case 'b': return <strong key={i}>{inline(x.c)}</strong>;
    case 'i': return <em key={i}>{inline(x.c)}</em>;
    case 's': return <s key={i}>{inline(x.c)}</s>;
    case 'code': return <code key={i}>{x.s}</code>;
    case 'a': return <a key={i} href={x.href} target="_blank" rel="noopener noreferrer">{inline(x.c)}</a>;
  }
});

const block = (b: Block, i: number): ReactNode => {
  switch (b.t) {
    case 'p': return <p key={i}>{inline(b.c)}</p>;
    case 'h': return b.level === 1 ? <h4 key={i}>{inline(b.c)}</h4> : <h5 key={i}>{inline(b.c)}</h5>;
    case 'ul': return <ul key={i}>{b.items.map((it, k) => <li key={k}>{inline(it)}</li>)}</ul>;
    case 'ol': return <ol key={i}>{b.items.map((it, k) => <li key={k}>{inline(it)}</li>)}</ol>;
    case 'quote': return <blockquote key={i}>{inline(b.c)}</blockquote>;
    case 'code': return <pre key={i}><code>{b.s}</code></pre>;
  }
};

/** 作業ログの説明などを、Markdown として出す (HTML は通さない) */
export function Markdown({ text, className = '' }: { text: string; className?: string }) {
  return <div className={`md ${className}`.trim()}>{parseMarkdown(text).map(block)}</div>;
}
