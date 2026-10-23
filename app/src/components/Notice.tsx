import { useState } from 'react';

const KEY = (email: string) => `notice-ack2:${email}`;

/** 初回ログイン時の案内。何が記録され、誰が見られるかを伝える。確認すると、その端末では表示しない。 */
export function Notice({ email, children }: { email: string; children: React.ReactNode }) {
  const [ok, setOk] = useState(() => {
    try { return localStorage.getItem(KEY(email)) === '1'; } catch { return false; }
  });
  if (ok) return <>{children}</>;
  return (
    <NoticeBody onConfirm={() => { try { localStorage.setItem(KEY(email), '1'); } catch { /* 保存できなくても進める */ } setOk(true); }} />
  );
}

export function NoticeBody({ onConfirm }: { onConfirm?: () => void }) {
  return (
    <main className="center-card">
      <h1>はじめに</h1>
      <div className="card form">
        <p>このアプリは、卒業研究の進み具合を、チームと先生が一緒に確認するためのものです。</p>
        <ul>
          <li>先生は、<strong>全チーム・全員の情報</strong>(WBS、日報)を見られます。</li>
          <li>日報は、設定によって、同じチームのメンバーにも見えます。</li>
          <li>先生は、あなたの入力内容や利用状況を確認できます。作業時間の計測や、順位づけはしません。</li>
          <li>先生だけが見られるメモがあります。学生の画面には出ません。</li>
          <li>日報は、やったタスクの結果を選んで、何をどこまでやったかを書きます。調べたことや、チームで相談したことも書きます。</li>
        </ul>
        <button onClick={onConfirm}>確認して始める</button>
      </div>
    </main>
  );
}
