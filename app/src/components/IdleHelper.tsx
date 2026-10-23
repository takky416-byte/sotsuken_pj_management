import { useState } from 'react';
import { updateTaskArray } from '../data/tasks';
import { idleMembers } from '../lib/idle';
import { periodLabel } from '../lib/wbs';
import type { Member, Task } from '../types';

/**
 * 手待ち (いま取り組めるタスクがない) のメンバーと、振り分けの案。
 * 担当のいないタスクや、抱えすぎている人の未着手のタスクを、ワンタップで担当にできる。話し合いのうえで使う。
 */
export function IdleHelper({ teamId, actor, tasks, members, today, canEdit }: {
  teamId: string; actor: string; tasks: Task[]; members: Member[]; today: string; canEdit: boolean;
}) {
  const [err, setErr] = useState('');
  const idle = idleMembers(tasks, members, today);
  const nameOf = (sid: string) => members.find((m) => m.sid === sid)?.name ?? sid;
  const run = (fn: () => Promise<unknown>) => { setErr(''); fn().catch((e) => setErr(`できませんでした: ${(e as Error).message}`)); };
  const assign = (task: Task, sid: string, takeOver: boolean) => run(async () => {
    await updateTaskArray(teamId, actor, task.id, 'assignees', 'add', sid);
    if (takeOver) for (const o of task.assignees ?? []) if (o !== sid) await updateTaskArray(teamId, actor, task.id, 'assignees', 'remove', o);
  });

  if (idle.length === 0) return <p className="hint">手が空いている人はいません。全員に、取り組めるタスクがあります。</p>;
  return (
    <div className="idle">
      {idle.map((p) => (
        <div key={p.sid} className="idle-person">
          <div><strong>{p.name}</strong>さんは、いま取り組めるタスクがありません。</div>
          {p.suggestions.length === 0 && <p className="hint">振り分けられるタスクが見つかりません。新しいタスクを、WBSに追加しましょう。</p>}
          <ul className="plain">
            {p.suggestions.map((s) => (
              <li key={s.task.id} className="suggest">
                <div className="suggest-main">
                  <strong>{s.task.title}</strong>
                  <div className="hint">{periodLabel(s.task.startDate, s.task.endDate)} ／ {s.reason}</div>
                </div>
                {canEdit && (
                  <div className="suggest-act">
                    <button type="button" onClick={() => assign(s.task, p.sid, false)}>{s.owners.length === 0 ? `${p.name}さんが担当` : '一緒にやる'}</button>
                    {s.owners.length > 0 && <button type="button" className="ghost" onClick={() => assign(s.task, p.sid, true)}>{p.name}さんに引き継ぐ({s.owners.map(nameOf).join('・')}さんから)</button>}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      ))}
      {err && <p className="error">{err}</p>}
      {!canEdit && <p className="hint">担当の変更は、WBSからできます。</p>}
    </div>
  );
}
