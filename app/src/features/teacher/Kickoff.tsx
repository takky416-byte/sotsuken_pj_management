import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useKickoffDrafts } from '../../data/kickoffDrafts';
import { createTasks, newTaskId, useTasks } from '../../data/tasks';
import { updateTeam, useTeam, wipeTeamForRestart } from '../../data/teams';
import { isHttpUrl } from '../../data/util';
import { defaultSummary } from '../../lib/companyReport';
import { checkDraft } from '../../lib/draftCheck';
import { autoSchedule, fillPeriods } from '../../lib/draftSchedule';
import { planImport } from '../../lib/importPlan';
import { outlineProjectName, parseOutline } from '../../lib/outline';
import { TEMPLATE_NODES } from '../../lib/template';
import type { Team } from '../../types';

/** 叩き台の項目。期間のない項目には、大項目ごとの時期と節目の期限に合わせて、期間を入れる */
const draftNodes = (text: string, fill: boolean) => (fill ? autoSchedule(parseOutline(text)) : parseOutline(text));

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
  const { data: drafts } = useKickoffDrafts(team.id);
  const [projectName, setProjectName] = useState(team.projectName);
  const [titles, setTitles] = useState<[string, string]>([
    team.proposals.find((p) => p.no === 1)?.title ?? '', team.proposals.find((p) => p.no === 2)?.title ?? '']);
  const [adopted, setAdopted] = useState<1 | 2>(team.proposals.find((p) => p.adopted)?.no === 2 ? 2 : 1);
  const [driveUrl, setDriveUrl] = useState(team.driveUrl);
  const [outline, setOutline] = useState('');
  const [autoName, setAutoName] = useState('');
  const [fill, setFill] = useState(true);
  const [restart, setRestart] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState('');
  const [err, setErr] = useState('');

  // 登録済みの叩き台 (設定 > 叩き台の登録) があれば、採用する案を選ぶだけ: 案を選ぶと、企画名と叩き台が入る
  const draftOf = (no: 1 | 2) => (drafts ?? []).find((d) => d.no === no);
  const loaded = useRef(false);
  const shownTitle = useRef('');
  const pickDraft = (no: 1 | 2) => {
    const d = draftOf(no);
    if (!d) return;
    setOutline(d.outline);
    // 企画名は、空か、前の案の名前のままのときだけ入れ替える (先生が直したあとは、そのまま)
    const prev = shownTitle.current; // setState の関数は、あとで呼ばれるので、いまの値を控えておく
    setProjectName((cur) => (!cur.trim() || cur === prev ? d.title : cur));
    shownTitle.current = d.title;
    setTitles((t) => (no === 1 ? [t[0] || d.title, t[1]] : [t[0], t[1] || d.title]));
  };
  useEffect(() => {
    if (loaded.current || !drafts || drafts.length === 0 || team.status === 'active') return;
    loaded.current = true;
    const first = (team.proposals.find((p) => p.adopted)?.no as 1 | 2 | undefined) ?? (draftOf(1) ? 1 : 2);
    setAdopted(first);
    setTitles((t) => [t[0] || draftOf(1)?.title || '', t[1] || draftOf(2)?.title || '']);
    pickDraft(first);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drafts]);

  /** 叩き台の先頭の「企画名: …」(仮の企画名)を、企画名の欄に入れる。欄が空か、前に自動で入れたままのときだけ (先生が直したあとは、上書きしない) */
  const changeOutline = (text: string) => {
    setOutline(text);
    const name = outlineProjectName(text);
    if (name && (!projectName.trim() || projectName === autoName)) {
      setProjectName(name); setAutoName(name);
      setTitles((t) => (t[adopted - 1].trim() ? t : (adopted === 1 ? [name, t[1]] : [t[0], name])));
    }
  };

  const plan = useMemo(() => {
    if (!tasks) return null;
    const nodes = [...TEMPLATE_NODES, ...draftNodes(outline, fill)];
    return planImport(restart ? [] : tasks, nodes, () => `preview-${Math.random()}`);
  }, [tasks, outline, fill, restart]);
  /** 作成する件数の内訳: 雛形の大項目と、叩き台の項目 */
  const split = (created: { depth: number; title: string }[]) => {
    const heads = created.filter((n) => n.depth === 1 && TEMPLATE_TITLES.has(n.title)).length;
    return { heads, items: created.length - heads };
  };

  const report = useMemo(() => (outline.trim() ? checkDraft(fill ? fillPeriods(outline) : outline) : null), [outline, fill]);

  const urlOk = driveUrl === '' || isHttpUrl(driveUrl);
  const canRun = !!projectName.trim() && urlOk && !busy && !!tasks;

  const run = async () => {
    if (!tasks) return;
    if (restart && !window.confirm(`${team.id}チームの、いまのタスク・作業ログ・変更履歴・ミーティング記録・コメント・ありがとう・議事録を、すべて消して、最初から作り直します。元には戻せません。よろしいですか。`)) return;
    setBusy(true); setErr(''); setResult('');
    try {
      let existing = tasks;
      let notesNow = team.reportNotes;
      if (restart) {
        await wipeTeamForRestart(team.id);
        existing = []; notesNow = null;
      }
      const real = planImport(existing, [...TEMPLATE_NODES, ...draftNodes(outline, fill)], () => newTaskId(team.id));
      const drafts = real.created.filter((n) => !(n.depth === 1 && TEMPLATE_TITLES.has(n.title)));
      const templ = real.created.filter((n) => n.depth === 1 && TEMPLATE_TITLES.has(n.title));
      await createTasks(team.id, 'teacher', templ, 'user');
      await createTasks(team.id, 'teacher', drafts, 'draft');
      // プロジェクトの概要の初期の文章を、初期WBSと同時に作る (すでに書かれていれば、そのまま。あとから直せる)
      const notes = notesNow;
      const hasSummary = !!notes?.summary?.trim();
      const taskCount = real.created.filter((n) => !(n.depth === 1)).length + existing.filter((t) => !t.deleted && t.depth > 1).length;
      const now = Date.now();
      await updateTeam(team.id, {
        ...(hasSummary ? {} : { reportNotes: { summary: defaultSummary({ id: team.id, projectName: projectName.trim(), members: team.members }, taskCount), issues: notes?.issues ?? '', next: notes?.next ?? '', by: 'teacher', at: now, summaryAt: now, ...(notes?.issuesAt ? { issuesAt: notes.issuesAt } : {}), ...(notes?.nextAt ? { nextAt: notes.nextAt } : {}) } }),
        status: 'active',
        projectName: projectName.trim(),
        proposals: [
          { no: 1, title: titles[0].trim(), adopted: adopted === 1 },
          { no: 2, title: titles[1].trim(), adopted: adopted === 2 },
        ].filter((p) => p.title),
        driveUrl: driveUrl.trim(),
        kickoffAt: restart ? Date.now() : team.kickoffAt ?? Date.now(),
      });
      const sp = split(real.created);
      setResult(`${restart ? '最初からやり直しました。' : 'キックオフしました。'}タスクを${real.created.length}件作成しました(雛形の大項目 ${sp.heads}件 + 叩き台の項目 ${sp.items}件。既にあった${real.reused}件は、そのまま使いました)。学生のホームに「初期WBSの見直し」が出ます。`);
      setOutline(''); setRestart(false);
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
        {drafts && drafts.length > 0 && team.status !== 'active' && (
          <p className="card hint" aria-label="登録済みの叩き台">登録済みの叩き台があります({drafts.length}案)。採用する企画を選ぶと、企画名と叩き台が入ります。そのまま「キックオフする」を押せます(直すこともできます)。</p>
        )}
        <div className="label">企画の記録 (名前だけ。採用しなかった企画も残します)</div>
        {([0, 1] as const).map((i) => (
          <div className="row" key={i}>
            <label className="chip">
              <input type="radio" name="adopted" checked={adopted === i + 1} onChange={() => { setAdopted((i + 1) as 1 | 2); pickDraft((i + 1) as 1 | 2); }} />
              企画{i === 0 ? '①' : '②'}(採用)
            </label>
            <input
              value={titles[i]} maxLength={100} placeholder="企画名"
              onChange={(e) => setTitles((t) => (i === 0 ? [e.target.value, t[1]] : [t[0], e.target.value]))}
            />
          </div>
        ))}
        <label>共有フォルダのURL (任意。チームの資料置き場。学生のホームの「共有フォルダ」)
          <input value={driveUrl} placeholder="https://drive.google.com/..." onChange={(e) => setDriveUrl(e.target.value)} />
          {!urlOk && <span className="error">http(s) のURLを入力してください</span>}
        </label>
        <p className="hint">成果物の提出先(学生のホームの「成果物を提出」)は、別のURLです。キックオフのあと、チーム詳細で設定します。</p>
        <label>叩き台のタスク (任意。アウトライン形式)
          <textarea
            rows={10} value={outline} onChange={(e) => changeOutline(e.target.value)}
            placeholder={'# 要件定義\n- 機能一覧を作る\n  > 必須機能と追加機能に分ける\n# 外部設計\n- 画面遷移図を作る'}
          />
        </label>
        <p className="hint">
          先頭に「企画名: 〇〇」の行があれば、企画名の欄に入ります(仮の名前。あとから直せます)。「# 」は大項目、「- 」はタスク(インデントで階層)、「{'>'} 」は詳細です。雛形の5大項目は自動で作ります。
          同じ名前の項目がすでにあれば作り直さないので、何度実行しても増えません。
        </p>
        <label className="chip">
          <input type="checkbox" checked={fill} onChange={(e) => setFill(e.target.checked)} />
          期間のない項目に、期間を自動で入れる(開始・終了は授業日。冬休みは入らず、またぎません。「{'>'} 期間: 2026-11-04〜2026-11-10」と書けば、その期間になります。授業日でない日は、授業日に寄せます)
        </label>
        {report && (
          <div className="card" aria-label="叩き台の点検">
            <strong>叩き台の点検</strong>: {report.total}項目(目安は50〜60)。種別: {report.kind}({report.kind === 'ハード' ? '機材発注・回路図も点検します' : '機材発注・回路図は点検しません'}。{report.kindFromHeader ? '叩き台の先頭の「種別」の行から' : '先頭に「種別: ソフト」か「種別: ハード」の行がないので、回路図の項目があるかで判断'})
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
        {team.status === 'active' && (
          <label className="card chip restart-box">
            <input type="checkbox" checked={restart} onChange={(e) => setRestart(e.target.checked)} />
            <span><strong>最初からやり直す</strong>(いまのタスク・作業ログ・変更履歴・ミーティング記録・コメント・ありがとう・議事録を、すべて消して、上の叩き台から作り直します。共有フォルダ・成果物の提出先・先生のメッセージ・登録した叩き台は、そのまま。<strong>元には戻せません</strong>)</span>
          </label>
        )}
        {plan && (
          <p className="card">
            実行すると、タスクを<strong>{plan.created.length}件</strong>作成します(雛形の大項目 {split(plan.created).heads}件 + 叩き台の項目 {split(plan.created).items}件。既にある{plan.reused}件は、そのまま使います)。
          </p>
        )}
        {outline.trim() && (
          <details className="card" aria-label="取り込む叩き台の一覧">
            <summary><strong>取り込む叩き台の中身を見る</strong>({draftNodes(outline, fill).filter((n) => n.depth > 1).length}項目。期間は、自動で入れた分も含みます)</summary>
            <ul className="kickoff-preview">
              {draftNodes(outline, fill).map((n, i) => (
                <li key={i} style={{ marginLeft: (n.depth - 1) * 16, fontWeight: n.depth === 1 ? 700 : 400 }}>
                  {n.title}{n.startDate && n.endDate ? <span className="hint">  {n.startDate.slice(5).replace('-', '/')}〜{n.endDate.slice(5).replace('-', '/')}</span> : null}
                </li>
              ))}
            </ul>
          </details>
        )}
        {err && <p className="error">{err}</p>}
        {result && <p className="ok">{result}</p>}
        <div className="row">
          <button disabled={!canRun} onClick={run}>{restart ? '消して、最初から作り直す' : team.status === 'active' ? '反映する' : 'キックオフする'}</button>
          {result && <Link to={`/teacher/team/${team.id}`} className="btn ghost-btn">WBSを見る</Link>}
        </div>
      </div>
    </>
  );
}
