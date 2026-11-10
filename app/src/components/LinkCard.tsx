import { useState } from 'react';

type Kind = { label: string; icon: string; thumbId?: string };

/**
 * URLから、リンク先の種類を求める (通信なし)。Googleドライブ・ドキュメント・スプレッドシート・スライド・フォーム・フォルダを見分ける。
 * ファイルは、サムネイルを試す (開けるのは、そのファイルを見られる人だけ。見られなければ、アイコンのままになる)。
 */
export function kindOf(href: string): Kind | null {
  let u: URL;
  try { u = new URL(href); } catch { return null; }
  const id = (re: RegExp) => re.exec(u.pathname)?.[1];
  if (u.hostname === 'drive.google.com') {
    if (/\/folders\//.test(u.pathname)) return { label: 'Googleドライブのフォルダ', icon: '📁' };
    const f = id(/\/file\/d\/([\w-]+)/);
    if (f) return { label: 'Googleドライブのファイル', icon: '📄', thumbId: f };
    return { label: 'Googleドライブ', icon: '📁' };
  }
  if (u.hostname === 'docs.google.com') {
    const d = id(/\/document\/d\/([\w-]+)/); if (d) return { label: 'Googleドキュメント', icon: '📝', thumbId: d };
    const s = id(/\/spreadsheets\/d\/([\w-]+)/); if (s) return { label: 'Googleスプレッドシート', icon: '📊', thumbId: s };
    const p = id(/\/presentation\/d\/([\w-]+)/); if (p) return { label: 'Googleスライド', icon: '📽️', thumbId: p };
    if (/\/forms\//.test(u.pathname)) return { label: 'Googleフォーム', icon: '📋' };
  }
  if (u.hostname === 'forms.gle') return { label: 'Googleフォーム', icon: '📋' };
  return null;
}

const shortUrl = (href: string): string => (href.length > 70 ? `${href.slice(0, 67)}…` : href);

/** URLだけの行を、カードで出す。種類・サムネイル(あれば)・URLを並べる。ページのタイトルなどは、サーバーがないため取れない */
export function LinkCard({ href }: { href: string }) {
  const [thumbOk, setThumbOk] = useState(true);
  const [iconOk, setIconOk] = useState(true);
  let host = '';
  try { host = new URL(href).hostname; } catch { /* 表示は URL のまま */ }
  const kind = kindOf(href);
  return (
    <a className="link-card" href={href} target="_blank" rel="noopener noreferrer">
      <span className="link-thumb" aria-hidden="true">
        {kind?.thumbId && thumbOk
          ? <img src={`https://drive.google.com/thumbnail?id=${kind.thumbId}&sz=w320`} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setThumbOk(false)} />
          : kind
            ? <span className="link-icon">{kind.icon}</span>
            : iconOk && host
              ? <img className="link-favicon" src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=64`} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setIconOk(false)} />
              : <span className="link-icon">🔗</span>}
      </span>
      <span className="link-body">
        <strong>{kind?.label ?? host ?? 'リンク'}</strong>
        <small>{shortUrl(href)}</small>
      </span>
    </a>
  );
}
