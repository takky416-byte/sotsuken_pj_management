import { StackTable } from './StackTable';
import { useEffect, useRef, useState } from 'react';
import { useMilestones } from '../data/calendar';
import { updateTask, useTasks } from '../data/tasks';
import { formatDate, jstDate } from '../lib/dates';
import { buildGantt, lightning, nextDates, pct, placeMilestones, weekTicks } from '../lib/gantt';
import { STATUS_LABEL, type Member } from '../types';

const LANE_PX = 18;
const ROW_PX = 30; // ガントの1行の高さ (稲妻線の位置合わせのため、固定)

/** 予定の全体像。大項目・中項目の期間を棒で表す。日付が未設定の大項目は、中の日付から求める。 */
export function GanttChart({ teamId, actor, members }: { teamId: string; actor: string; members: Member[] }) {
  const { data: tasks, error } = useTasks(teamId);
  const milestones = useMilestones(teamId);
  const [deep, setDeep] = useState(false);
  const [edit, setEdit] = useState(false);
  const [bolt, setBolt] = useState(true);
  const [err, setErr] = useState('');
  const box = useRef<HTMLDivElement>(null);
  const ready = !!tasks && !!milestones;
  // 開いたときに、今日の線が見える位置までスクロールする (スマホなど、横にはみ出すとき)
  useEffect(() => {
    const el = box.current;
    if (!ready || !el) return;
    const today = el.querySelector<HTMLElement>('.gantt-today');
    const name = el.querySelector<HTMLElement>('.gantt-name')?.offsetWidth ?? 0;
    if (today) el.scrollLeft = Math.max(0, today.offsetLeft - name - (el.clientWidth - name) * 0.4);
  }, [ready]);
  if (error) return <p className="error">{error}</p>;
  if (!tasks || !milestones) return <p>読み込み中…</p>;

  const today = jstDate();
  const g = buildGantt(tasks, milestones, today, deep ? 3 : 2);
  const name = (sid: string) => members.find((m) => m.sid === sid)?.name ?? sid;
  const ticks = weekTicks(g);
  const pos = (d: string) => `${pct(g, d)}%`;
  const ms = placeMilestones(milestones, g);
  const parents = new Set(tasks.filter((t) => !t.deleted && t.parentId).map((t) => t.parentId as string));
  const points = lightning(g, today, deep ? 3 : 2, (id) => parents.has(id));
  const todayX = pct(g, today);
  const H = g.rows.length * ROW_PX;
  const msH = Math.max(ROW_PX, ms.lanes * LANE_PX + 2); // マイルストーンの行 (ガントの一番上、目盛りの下)
  const behind = points.filter((p) => p.days < -1).length;

  if (g.rows.length === 0) return <p className="card">タスクがまだありません。</p>;
  return (
    <>
      <p className="hint">棒は、タスクの開始日〜終了日です(薄い棒は、中のタスクの日付から求めた期間)。日付が空のタスクは、棒が出ません。</p>
      <div className="row">
        <label className="check"><input type="checkbox" checked={deep} onChange={(e) => setDeep(e.target.checked)} />小項目も表示する</label>
        <label className="check"><input type="checkbox" checked={bolt} onChange={(e) => setBolt(e.target.checked)} />稲妻線を表示する</label>
        <label className="check"><input type="checkbox" checked={edit} onChange={(e) => setEdit(e.target.checked)} />日付を入力する</label>
      </div>
      {err && <p className="error">{err}</p>}
      <div className="gantt" ref={box}>
        <div className="gantt-inner">
        <div className="gantt-head">
          <div className="gantt-name" />
          <div className="gantt-track">
            {ticks.map((d) => <span key={d} className="gantt-tick" style={{ left: pos(d) }}>{formatDate(d).replace(/\(.*\)/, '')}</span>)}
          </div>
        </div>
        <div className="gantt-row ms-row" style={{ height: msH }}>
          <div className="gantt-name"><small>マイルストーン</small></div>
          <div className="gantt-track" style={{ height: ms.lanes * LANE_PX + 2 }}>
            {milestones.map((m) => {
              const pl = ms.places.find((p) => p.id === m.id)!;
              return (
                <span key={m.id} className={`gantt-ms ${pl.align === 'right' ? 'r' : ''}`}
                  style={{ top: pl.lane * LANE_PX, ...(pl.align === 'left' ? { left: pos(m.date) } : { right: `${100 - pct(g, m.date)}%` }) }}
                  title={`${formatDate(m.date)} ${m.title}`}>◆<small>{m.title}</small></span>
              );
            })}
          </div>
        </div>
        {g.rows.map((r) => (
          <div className="gantt-row" key={r.task.id}>
            <div className={`gantt-name d${r.depth}`} title={r.task.title}>
              {r.task.title}
              {r.task.assignees.length > 0 && <small> {r.task.assignees.map(name).join('・')}</small>}
            </div>
            <div className="gantt-track">
              {ticks.map((d) => <i key={d} className="gantt-grid" style={{ left: pos(d) }} />)}
              {r.start && r.end && (
                <span
                  className={`gantt-bar ${r.status}${r.derived ? ' derived' : ''}${r.overdue ? ' overdue' : ''}`}
                  style={{ left: pos(r.start), width: `max(6px, ${pct(g, r.end) - pct(g, r.start)}%)` }}
                  title={`${r.task.title}: ${formatDate(r.start)}〜${formatDate(r.end)} / ${STATUS_LABEL[r.status]}${r.overdue ? ' / 期限超過' : ''}`}
                />
              )}
            </div>
          </div>
        ))}
        <div className="gantt-today" style={{ left: `calc(var(--gantt-name) + (100% - var(--gantt-name)) * ${todayX / 100})` }} title="今日" />
        {bolt && (
          <svg className="gantt-lightning" viewBox={`0 0 100 ${H}`} preserveAspectRatio="none" style={{ height: H, top: ROW_PX + msH }} aria-label="稲妻線" role="img">
            <polyline
              points={[`${todayX},0`, ...points.map((p) => `${p.x},${p.row * ROW_PX + ROW_PX / 2}`), `${todayX},${H}`].join(' ')}
              fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" vectorEffect="non-scaling-stroke"
            />
          </svg>
        )}
        </div>
      </div>
      <p className="hint">
        <span className="legend todo" />未着手 <span className="legend doing" />進行中 <span className="legend done" />完了 <span className="legend hold" />保留
        <span className="legend overdue" />期限超過 / 赤い縦線は今日
        {bolt && <> / <span className="legend bolt" />稲妻線(今日の線より左は、予定の期間に入っているのに未着手のタスク、右は、予定より早く着手・完了したタスク。{behind > 0 ? `遅れの目安: ${behind}行` : '遅れはありません'})</>}
      </p>
      {edit && (
        <div className="card">
          <div className="label">日付の入力(開始日だけ入れると、1日のタスクになります。終了日は、あとから入れられます)</div>
          <div className="table-wrap">
            <StackTable>
              <thead><tr><th>タスク</th><th>開始日</th><th>終了日</th></tr></thead>
              <tbody>
                {[...g.rows.map((r) => r.task), ...g.undated.filter((u) => !g.rows.some((r) => r.task.id === u.id))].map((t) => {
                  const row = g.rows.find((r) => r.task.id === t.id);
                  const set = (field: 'startDate' | 'endDate', value: string) => {
                    setErr('');
                    updateTask(teamId, actor, t.id, nextDates(t, field, value)).catch((e) => setErr(`保存できませんでした: ${(e as Error).message}`));
                  };
                  return (
                    <tr key={t.id}>
                      <td className={`gantt-edit-name d${t.depth}`}>{t.title}</td>
                      <td><input type="date" aria-label={`開始日 ${t.title}`} value={t.startDate ?? ''} placeholder={row?.derived ? row.start ?? '' : ''} onChange={(e) => set('startDate', e.target.value)} /></td>
                      <td><input type="date" aria-label={`終了日 ${t.title}`} value={t.endDate ?? ''} onChange={(e) => set('endDate', e.target.value)} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </StackTable>
          </div>
        </div>
      )}
      {g.undated.length > 0 && (
        <details className="card">
          <summary>日付が未設定のタスク({g.undated.length}件)</summary>
          <ul className="plain">{g.undated.map((t) => <li key={t.id}>{t.title}</li>)}</ul>
        </details>
      )}
    </>
  );
}
