import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { createTasks, newTaskId, useTasks } from '../../data/tasks';
import { updateTeam, useTeam } from '../../data/teams';
import { isHttpUrl } from '../../data/util';
import { checkDraft } from '../../lib/draftCheck';
import { planImport } from '../../lib/importPlan';
import { parseOutline } from '../../lib/outline';
import { TEMPLATE_NODES } from '../../lib/template';
import type { Team } from '../../types';

const TEMPLATE_TITLES = new Set(TEMPLATE_NODES.map((n) => n.title));

export function Kickoff() {
  const { id = '' } = useParams();
  const team = useTeam(id);
  if (team === undefined) return <p>読み込み中…</p>;
  if (team === null) return <p>チームが見つかりません。</p>;
  return <KickoffForm team={team} />;
}

function KickoffForm({ team }: { team: Team }) {
  const { data: tasks } = useTasks(team.id);
  const [projectName, setProjectName] = useState(team.projectName);
  const [titles, setTitles] = useState<[string, string]>([
    team.proposals.find((p) => p.no === 1)?.title ?? '', team.proposals.find((p) => p.no === 2)?.title ?? '']);
  const [adopted, setAdopted] = useState<1 | 2>(team.proposals.find((p) => p.adopted)?.no === 2 ? 2 : 1);
  const [driveUrl, setDriveUrl] = useState(team.driveUrl);
  const [outline, setOutline] = useState('');
  const [hard, setHard] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState('');
  const [err, setErr] = useState('');

  const plan = useMemo(() => {
    if (!tasks) return null;
    const nodes = [...TEMPLATE_NODES, ...parseOutline(outline)];
    return planImport(tasks, nodes, () => `preview-${Math.random()}`);
  }, [tasks, outline]);

  const report = useMemo(() => (outline.trim() ? checkDraft(outline, hard ? 'ハード' : 'ソフト') : null), [outline, hard]);

  const urlOk = driveUrl === '' || isHttpUrl(driveUrl);
  const canRun = !!projectName.trim() && urlOk && !busy && !!tasks;

  const run = async () => {
    if (!tasks) return;
    setBusy(true); setErr(''); setResult('');
    try {
      const real = planImport(tasks, [...TEMPLATE_NODES, ...parseOutline(outline)], () => newTaskId(team.id));
      const drafts = real.created.filter((n) => !(n.depth === 1 && TEMPLATE_TITLES.has(n.title)));
      const templ = real.created.filter((n) => n.depth === 1 && TEMPLATE_TITLES.has(n.title));
      await createTasks(team.id, 'teacher', templ, 'user');
      await createTasks(team.id, 'teacher', drafts, 'draft');
      await updateTeam(team.id, {
        status: 'active',
        projectName: projectName.trim(),
        proposals: [
          { no: 1, title: titles[0].trim(), adopted: adopted === 1 },
          { no: 2, title: titles[1].trim(), adopted: adopted === 2 },
        ].filter((p) => p.title),
        driveUrl: driveUrl.trim(),
        kickoffAt: team.kickoffAt ?? Date.now(),
      });
      setResult(`キックオフしました。タスクを${real.created.length}件作成しました(既にあった${real.reused}件は、そのまま使いました)。学生のホームに「初期WBSの見直し」が出ます。`);
      setOutline('');
    } catch (e) {
      setErr(`できませんでした: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Link to={`/teacher/team/${team.id}`}>← {team.id}チーム</Link>
      <h2>{team.id}チーム キックオフ</h2>
      <div className="card form">
        <label>採用する企画名
          <input value={projectName} maxLength={100} onChange={(e) => setProjectName(e.target.value)} />
        </label>
        <div className="label">企画の記録 (名前だけ。採用しなかった企画も残します)</div>
        {([0, 1] as const).map((i) => (
          <div className="row" key={i}>
            <label className="chip">
              <input type="radio" name="adopted" checked={adopted === i + 1} onChange={() => setAdopted((i + 1) as 1 | 2)} />
              企画{i === 0 ? '①' : '②'}(採用)
            </label>
            <input
              value={titles[i]} maxLength={100} placeholder="企画名"
              onChange={(e) => setTitles((t) => (i === 0 ? [e.target.value, t[1]] : [t[0], e.target.value]))}
            />
          </div>
        ))}
        <label>共有フォルダのURL (任意)
          <input value={driveUrl} placeholder="https://drive.google.com/..." onChange={(e) => setDriveUrl(e.target.value)} />
          {!urlOk && <span className="error">http(s) のURLを入力してください</span>}
        </label>
        <label>叩き台のタスク (任意。アウトライン形式)
          <textarea
            rows={10} value={outline} onChange={(e) => setOutline(e.target.value)}
            placeholder={'# 要件定義\n- 機能一覧を作る\n  > 必須機能と追加機能に分ける\n# 外部設計\n- 画面遷移図を作る'}
          />
        </label>
        <p className="hint">
          「# 」は大項目、「- 」はタスク(インデントで階層)、「{'>'} 」は詳細です。雛形の6大項目は自動で作ります。
          同じ名前の項目がすでにあれば作り直さないので、何度実行しても増えません。
        </p>
        <label className="chip">
          <input type="checkbox" checked={hard} onChange={(e) => setHard(e.target.checked)} />
          ハード系の企画(機材発注の項目も点検する)
        </label>
        {report && (
          <div className="card" aria-label="叩き台の点検">
            <strong>叩き台の点検</strong>: {report.total}項目(目安は50〜60)
            {report.issues.length === 0 ? <p className="ok">問題は見つかりませんでした。</p> : (
              <ul>
                {report.issues.map((i, k) => (
                  <li key={k} className={i.level === 'error' ? 'error' : 'hint'}>{i.level === 'error' ? '直したほうがよい: ' : '見直し: '}{i.message}</li>
                ))}
              </ul>
            )}
            <p className="hint">点検は目安です。このまま取り込むこともできます。</p>
          </div>
        )}
        {plan && (
          <p className="card">
            実行すると、タスクを<strong>{plan.created.length}件</strong>作成します(既にある{plan.reused}件は、そのまま使います)。
          </p>
        )}
        {err && <p className="error">{err}</p>}
        {result && <p className="ok">{result}</p>}
        <div className="row">
          <button disabled={!canRun} onClick={run}>{team.status === 'active' ? '反映する' : 'キックオフする'}</button>
          {result && <Link to={`/teacher/team/${team.id}`} className="btn ghost-btn">WBSを見る</Link>}
        </div>
      </div>
    </>
  );
}
