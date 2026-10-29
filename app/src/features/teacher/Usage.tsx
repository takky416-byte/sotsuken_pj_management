import { useSearchParams } from 'react-router-dom';
import { AccessLogPage } from './AccessLog';
import { ContributionPanel } from './Contribution';
import { DailyLogsPage } from './DailyLogs';

const TABS = [['analysis', '関与・貢献の分析'], ['logs', '作業ログ'], ['access', 'アクセス']] as const;
type Tab = (typeof TABS)[number][0];

/** 教員の「利用状況」。メンバーの関与・貢献の分析と、作業ログの一覧、アクセス履歴をまとめた画面。 */
export function Usage() {
  const [params, setParams] = useSearchParams();
  const tab: Tab = TABS.some(([id]) => id === params.get('tab')) ? (params.get('tab') as Tab) : 'analysis';
  return (
    <>
      <h2>利用状況</h2>
      <div className="seg view-switch" role="group" aria-label="利用状況の見方">
        {TABS.map(([id, label]) => (
          <button key={id} type="button" className={`seg-btn ${tab === id ? 'on' : ''}`} aria-pressed={tab === id} onClick={() => setParams(id === 'analysis' ? {} : { tab: id })}>{label}</button>
        ))}
      </div>
      {tab === 'analysis' && <ContributionPanel />}
      {tab === 'logs' && <DailyLogsPage />}
      {tab === 'access' && <AccessLogPage />}
    </>
  );
}
