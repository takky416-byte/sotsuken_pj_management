import { useState } from 'react';

const KEY = (email: string) => `notice-ack:${email}`;

/** 初回ログイン時の案内。何が記録され、誰が見られるかを伝える。確認すると、その端末では表示しない。 */
export function Notice({ email, children }: { email: string; children: React.ReactNode }) {
  const [ok, setOk] = useState(() => {
    try { return localStorage.getItem(KEY(email)) === '1'; } catch { return false; }
  });
  if (ok) return <>{children}</>;
  return (
    <main className="center-card">
      <h1>はじめに</h1>
      <div className="card form">
        <p>このアプリは、卒業研究の進み具合を、チームと先生が一緒に確認するためのものです。</p>
        <ul>
          <li>先生は、<strong>全チーム・全員の情報</strong>(WBS、日報)を見られます。</li>
          <li>日報は、設定によって、同じチームのメンバーにも見えます。</li>
          <li>記録されるのは、あなたが入力したWBSと日報の内容です。作業時間や、順位づけは記録しません。</li>
          <li>先生だけが見られるメモがあります。学生の画面には出ません。</li>
          <li>日報は、できたことを選ぶだけで書けます。調べたことや相談したことも、書いてかまいません。</li>
        </ul>
        <button onClick={() => { try { localStorage.setItem(KEY(email), '1'); } catch { /* 保存できなくても進める */ } setOk(true); }}>
          確認して始める
        </button>
      </div>
    </main>
  );
}
