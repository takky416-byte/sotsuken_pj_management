import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { doc, updateDoc } from 'firebase/firestore';
import { useProfile } from '../../auth/AuthProvider';
import { db } from '../../firebase';
import { setSetting } from '../../data/calendar';
import { useSettings } from '../../data/daily';
import { updateTeam, useTeams } from '../../data/teams';
import { Export } from './Export';
import { KickoffDrafts } from './KickoffDrafts';
import { Roster } from './Roster';

const TABS = [['basic', '基本設定'], ['roster', '名簿'], ['drafts', '叩き台の登録'], ['export', '書き出し・バックアップ']] as const;

/** 設定: 基本設定・名簿・書き出し/バックアップ/復元を、ひとつの画面にまとめる */
export function Settings() {
  const [params, setParams] = useSearchParams();
  const tab = TABS.some(([id]) => id === params.get('tab')) ? (params.get('tab') as (typeof TABS)[number][0]) : 'basic';
  return (
    <>
      <h2>設定</h2>
      <div className="seg view-switch" role="group" aria-label="設定の項目">
        {TABS.map(([id, label]) => (
          <button key={id} type="button" className={`seg-btn ${tab === id ? 'on' : ''}`} aria-pressed={tab === id} onClick={() => setParams(id === 'basic' ? {} : { tab: id })}>{label}</button>
        ))}
      </div>
      {tab === 'basic' && <BasicSettings />}
      {tab === 'roster' && <Roster />}
      {tab === 'drafts' && <KickoffDrafts />}
      {tab === 'export' && <Export />}
    </>
  );
}

function BasicSettings() {
  const me = useProfile();
  const [myName, setMyName] = useState(me.name);
  const [saved, setSaved] = useState(false);
  const settings = useSettings();
  const { data: teams } = useTeams();
  const [err, setErr] = useState('');
  if (!settings || !teams) return <p>読み込み中…</p>;
  const run = async (fn: () => Promise<unknown>) => {
    setErr('');
    try { await fn(); } catch (e) { setErr(`できませんでした: ${(e as Error).message}`); }
  };
  return (
    <>
      {err && <p className="error">{err}</p>}
      <div className="card form">
        <label>あなたの表示名(画面の右上や、先生のコメントに表示されます)
          <input value={myName} maxLength={20} onChange={(e) => setMyName(e.target.value)} />
        </label>
        <div className="row">
          <button disabled={!myName.trim() || myName.trim() === me.name}
            onClick={() => run(async () => {
              setSaved(false);
              await updateDoc(doc(db, 'roster', me.email), { name: myName.trim() });
              setSaved(true); // サーバーへの保存が終わってから表示する
            })}>表示名を保存</button>
          {saved && <span className="ok">保存しました</span>}
        </div>
      </div>
      <div className="card form">
        <label className="check">
          <input type="checkbox" checked={settings.peerDailyView} onChange={(e) => run(() => setSetting('peerDailyView', e.target.checked))} />
          同じチームの作業ログを、チームのメンバーどうしで見られるようにする
        </label>
        <p className="hint">オフにすると、学生は自分の作業ログだけが見えます。教員はどちらでも全員分を見られます。</p>
      </div>
      <div className="card form">
        <label>作業ログの運用開始日
          <input type="date" value={settings.dailyStartDate} onChange={(e) => e.target.value && run(() => setSetting('dailyStartDate', e.target.value))} />
        </label>
        <p className="hint">これより前の授業日は、作業ログが未提出でも数えません(要確認・提出状況・欠席の入力の対象外)。</p>
      </div>
      <div className="card form">
        <label className="check">
          <input type="checkbox" checked={settings.rotateOrder} onChange={(e) => run(() => setSetting('rotateOrder', e.target.checked))} />
          ミーティングのチームの順番を、毎週ずらす
        </label>
        <p className="hint">オフにすると、いつもA〜Hの順になります。</p>
      </div>
      <h3>ミーティング記録の入力</h3>
      <p className="hint">初期は教員だけが入力します。自分たちで進められるチームは、チームの学生にも入力を許可できます。</p>
      <div className="card">
        {[...teams].sort((a, b) => a.id.localeCompare(b.id)).map((t) => (
          <label className="check" key={t.id}>
            <input type="checkbox" checked={t.teamMeetingInput} onChange={(e) => run(() => updateTeam(t.id, { teamMeetingInput: e.target.checked }))} />
            {t.id}チーム: チームの学生も記録を入力できる
          </label>
        ))}
      </div>
    </>
  );
}
