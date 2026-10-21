import { useState } from 'react';
import { api } from '../api.js';
import Kanban from './Kanban.jsx';
import Schedule from './Schedule.jsx';
import Logs from './Logs.jsx';

const TABS = [['kanban', 'カンバン'], ['schedule', 'スケジュール'], ['logs', '研究ログ']];

export default function Workspace({ uid, me, owner, onOwnerChange }) {
  const [tab, setTab] = useState('kanban');
  const [theme, setTheme] = useState(owner.theme ?? '');
  const own = me.id === owner.id;

  const saveTheme = async () => {
    const u = await api('PUT', '/me', { theme });
    onOwnerChange?.(u);
  };

  return (
    <>
      <h2>{own ? 'マイページ' : `${owner.name} さん`}</h2>
      <div className="card theme">
        <label>研究テーマ
          {own
            ? <><input value={theme} onChange={(e) => setTheme(e.target.value)} onBlur={saveTheme} placeholder="例: 〇〇に関する△△の研究" /></>
            : <span> {owner.theme || '（未設定）'}</span>}
        </label>
      </div>
      <nav className="tabs">
        {TABS.map(([k, label]) => (
          <button key={k} className={tab === k ? 'active' : ''} onClick={() => setTab(k)}>{label}</button>
        ))}
      </nav>
      {tab === 'kanban' && <Kanban uid={uid} readOnly={!own} />}
      {tab === 'schedule' && <Schedule uid={uid} />}
      {tab === 'logs' && <Logs uid={uid} me={me} readOnly={!own} />}
    </>
  );
}
