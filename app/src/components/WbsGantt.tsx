import { useState } from 'react';
import type { Member } from '../types';
import { GanttChart } from './GanttChart';
import { WbsEditor } from './WbsEditor';

/**
 * WBS とガントを、ひとつの画面に。
 * ふだんは、タスクの一覧の右に、期間の棒 (ガント) を並べる。ガントを大きく見たい・ドラッグで直したいときは、切り替える。
 */
export function WbsGantt({ teamId, actor, members, initial = 'list' }: { teamId: string; actor: string; members: Member[]; initial?: 'list' | 'gantt' }) {
  const [view, setView] = useState<'list' | 'gantt'>(initial);
  return (
    <>
      <div className="seg view-switch" role="group" aria-label="表示の切り替え">
        <button type="button" className={`seg-btn ${view === 'list' ? 'on' : ''}`} aria-pressed={view === 'list'} onClick={() => setView('list')}>一覧とガント</button>
        <button type="button" className={`seg-btn ${view === 'gantt' ? 'on' : ''}`} aria-pressed={view === 'gantt'} onClick={() => setView('gantt')}>ガントを大きく(ドラッグで編集)</button>
      </div>
      {view === 'list'
        ? <WbsEditor teamId={teamId} actor={actor} members={members} timeline />
        : <GanttChart teamId={teamId} actor={actor} members={members} />}
    </>
  );
}
