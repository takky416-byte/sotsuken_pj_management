import { useState } from 'react';

const KEY = (email: string) => `notice-ack3:${email}`;

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
          <li>先生は、<strong>全チーム・全員の情報や入力内容や利用状況</strong>を見ることができます。</li>
          <li>日々計画の見直しを行いながら、各日の授業の終わりまでに「<strong>作業ログ</strong>」を必ず入力しましょう。</li>
          <li>先生は、みなさんが入力した内容をもとに、進捗を把握します。入力がないと「取り組んだ作業なし、進捗なし」と判断しますので、ご留意ください。</li>
        </ul>
        <details>
          <summary>くわしく(見える範囲など)</summary>
          <ul>
            <li>作業ログは、設定によって、同じチームのメンバーにも見えます。</li>
            <li>先生だけが見られるメモがあります。学生の画面には出ません。</li>
            <li>調べたことや、チームで相談したことも、作業ログに書けます。</li>
          </ul>
        </details>
        <button onClick={onConfirm}>確認して始める</button>
      </div>
    </main>
  );
}
