import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useProfile } from '../auth/AuthProvider';
import { confirmWbsReview, useTeam } from '../data/teams';
import { useTasks } from '../data/tasks';
import { reviewState } from '../lib/wbsReview';
import { useBase } from './Base';

/**
 * キックオフのあと、チームが叩き台 (初期WBS) を見直すまで出す案内。
 * full: ホームとWBSの画面 (手順と「終えた」ボタン)。compact: ほかの画面 (1行の案内)。
 * 担当の割り振りは、データで確かめる。追加・修正・削除は、チームが「終えた」を押して記録する。
 */
export function WbsReviewCard({ compact = false }: { compact?: boolean }) {
  const me = useProfile();
  const base = useBase();
  const team = useTeam(me.teamId);
  const { data: tasks } = useTasks(me.teamId);
  const [ok, setOk] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  if (!team || !tasks || !me.teamId || !me.sid) return null;
  const s = reviewState(team, tasks);
  if (!s.needed) return null;

  if (compact) {
    return (
      <p className="card review-banner" role="status">
        <strong>最初にやること:</strong> 初期WBS(叩き台)の見直し
        {s.unassigned.length > 0 && <>(担当が決まっていない項目 {s.unassigned.length}件)</>}
        <Link to={`${base}/wbs`}> WBSを開く →</Link>
      </p>
    );
  }

  const confirm = async () => {
    setBusy(true); setErr('');
    try { await confirmWbsReview(me.teamId as string, me.sid as string); }
    catch (e) { setErr(`記録できませんでした: ${(e as Error).message}`); setBusy(false); }
  };
  const step = (done: boolean) => (done ? '✓' : '□');
  return (
    <section className="card review-card" aria-label="初期WBSの見直し">
      <h3>最初にやること: 初期WBSの見直し</h3>
      <p>
        先生が用意した叩き台({s.drafts}件)は、まだ「たとえば」の案です。
        チームで1項目ずつ見て、自分たちの企画に合わせて直しましょう。
      </p>
      <ol className="review-steps">
        <li>
          <strong>全部の項目を読む。</strong> 要らないものは<strong>削除</strong>、足りないものは<strong>追加</strong>、言葉や内容は<strong>修正</strong>します。
        </li>
        <li className={s.unassigned.length === 0 ? 'ok' : ''}>
          <strong>{step(s.unassigned.length === 0)} 担当を決める。</strong>{' '}
          {s.unassigned.length === 0 ? '担当が決まっていない項目は、ありません。' : <>担当が決まっていない項目が <strong>{s.unassigned.length}件</strong> あります。</>}
        </li>
        <li className={s.noPeriod === 0 ? 'ok' : ''}>
          <strong>{step(s.noPeriod === 0)} 期間(いつからいつまで)を確かめる。</strong>{' '}
          {s.noPeriod === 0 ? '期間は、はじめから入っています。自分たちの進め方に合わせて、ずれている所を直しましょう。' : <>期間のない項目が {s.noPeriod}件あります(目安。まず近い項目から)。</>}
        </li>
      </ol>
      <p className="hint">WBSの画面で「編集モードにする」を押すと直せます。「担当が決まっていない項目だけ」で絞ると、残りが見つかります。</p>
      <div className="row">
        <Link className="btn" to={`${base}/wbs`}>WBSを開く</Link>
      </div>
      <div className="review-confirm">
        <label className="check">
          <input type="checkbox" checked={ok} onChange={(e) => setOk(e.target.checked)} />
          全部の項目を見て、必要な追加・修正・削除をしました(チームで確かめました)
        </label>
        <button type="button" disabled={!ok || !s.canConfirm || busy} onClick={confirm}>見直しを終えた</button>
        {!s.canConfirm && <span className="hint">担当が決まっていない項目がなくなると、押せます。</span>}
      </div>
      {err && <p className="error">{err}</p>}
    </section>
  );
}
