// Apps Script (毎日の進捗報告のExcel・PDF) で使う、報告書の中身を作る関数の入口。
// アプリの報告書 (companyReport.ts・report.ts) と同じロジックを、`npm run build:gas` で apps-script/report-core.js にまとめる。
// 画面・ブラウザ・Firebase には依存しない関数だけを出すこと。
import type { Milestone, Task, Team } from '../types';
import { analyze } from './analysis';
import { buildCompanyReport } from './companyReport';
import { jstDate } from './dates';
import { mdLabel, overlapsWeek, wbsRows, weekColumns } from './report';

/** 1チームぶんの、報告書の中身 (報告書シート・WBSシート・ガントチャートシートの元になるデータ) */
export function buildTeamReport(
  team: Pick<Team, 'id' | 'projectName' | 'members' | 'kickoffAt'> & { reportNotes?: Team['reportNotes'] },
  tasks: Task[], milestones: Milestone[], today: string = jstDate(),
) {
  const nameOf = (sid: string) => team.members.find((m) => m.sid === sid)?.name ?? sid;
  const company = buildCompanyReport(team, tasks, milestones, team.reportNotes ?? null, today);
  const rows = wbsRows(tasks, nameOf);
  const weeks = weekColumns(rows, [], today); // 報告書には、マイルストーンを載せない
  return { company, rows, weeks, analysis: analyze(tasks, milestones, team.members, today) };
}

export { jstDate, mdLabel, overlapsWeek };
