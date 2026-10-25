import { useState } from 'react';
import { useNarrow } from '../lib/useNarrow';
import type { Member } from '../types';
import { GanttChart } from './GanttChart';
import { TaskHistory } from './TaskHistory';
import { WbsEditor } from './WbsEditor';

/**
 * WBS とガントチャートを、ひとつの画面に。
 * ふだんは、タスクの一覧の右に、期間の棒 (ガントチャート) を並べる。ガントチャートを大きく見たい・ドラッグで直したいときは、切り替える。
 */
export function WbsGantt({ teamId, actor, members, initial = 'list' }: { teamId: string; actor: string; members: Member[]; initial?: 'list' | 'gantt' }) {
  const narrow = useNarrow();
  // スマホでは、一覧の右に棒が出ないので、ガントチャートを大きく見る表示から始める
  const [chosen, setView] = useState<'list' | 'gantt' | null>(initial === 'gantt' ? 'gantt' : null);
  const view = chosen ?? (narrow ? 'gantt' : 'list');
  return (
    <>
      <div className="seg view-switch" role="group" aria-label="表示の切り替え">
        <button type="button" className={`seg-btn ${view === 'list' ? 'on' : ''}`} aria-pressed={view === 'list'} onClick={() => setView('list')} aria-label="一覧とガントチャート"><span className="nl">一覧とガントチャート</span><span className="ns" aria-hidden="true">一覧</span></button>
        <button type="button" className={`seg-btn ${view === 'gantt' ? 'on' : ''}`} aria-pressed={view === 'gantt'} onClick={() => setView('gantt')} aria-label="ガントチャートを大きく(ドラッグで編集)"><span className="nl">ガントチャートを大きく(ドラッグで編集)</span><span className="ns" aria-hidden="true">ガントチャート</span></button>
      </div>
      {view === 'list'
        ? <WbsEditor teamId={teamId} actor={actor} members={members} timeline />
        : <GanttChart teamId={teamId} actor={actor} members={members} />}
      <TaskHistory teamId={teamId} members={members} />
    </>
  );
}
