// 企業に提出する進捗報告書の Excel (.xlsx) をブラウザの中で作る。exceljs は大きいので、使うときだけ読み込む。
// 画面の「チームの分析」(個人別の負荷など) は入れない。
import type { Milestone, Task, TaskStatus } from '../types';
import type { ProjectAnalysis } from './analysis';
import type { CompanyReport } from './companyReport';
import { mdLabel, overlapsWeek, wbsRows, weekColumns } from './report';

export type ReportInput = {
  teamId: string;
  projectName: string;
  members: { sid: string; name: string }[];
  tasks: Task[];
  milestones: Milestone[];
  analysis: ProjectAnalysis;
  today: string;
  /** 提出用の報告書の中身 (companyReport.ts) */
  company: CompanyReport;
  /** WBS・ガントチャートに担当者名を載せるか */
  showAssignees: boolean;
};

const FILL: Record<TaskStatus, string> = { todo: 'FF9AA0B5', doing: 'FF6C4CFF', done: 'FF22B573', hold: 'FFD9DCE8' };
const HEAD = 'FF3B2E7E';

/** xlsx では、文字列のセルは文字として保存される (数式として実行されない)。CSV のような前処理は要らない。 */
const safe = (s: string): string => s;

export async function buildReportWorkbook(input: ReportInput): Promise<Blob> {
  const { default: ExcelJS } = await import('exceljs');
  const wb = new ExcelJS.Workbook();
  wb.created = new Date();
  const nameOf = (sid: string) => input.members.find((m) => m.sid === sid)?.name ?? sid;
  const rows = wbsRows(input.tasks, nameOf);
  const head = (row: import('exceljs').Row) => {
    row.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    row.eachCell((c) => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEAD } }; c.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }; });
  };

  // ── 報告書 (企業に提出する本体)
  const c = input.company;
  const range = (st: string | null, en: string | null) => (st ? `${mdLabel(st)}${en && en !== st ? `〜${mdLabel(en)}` : ''}` : en ? mdLabel(en) : '');
  const s1 = wb.addWorksheet('報告書', { pageSetup: { orientation: 'landscape', paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0 } });
  s1.columns = [{ width: 30 }, { width: 24 }, { width: 16 }, { width: 14 }, { width: 14 }, { width: 30 }];
  const para = (text: string, date = '') => { text = date ? `${text}\n(記入日: ${date.replace(/-/g, '/')})` : text;  const r = s1.addRow([safe(text)]); s1.mergeCells(r.number, 1, r.number, 6); r.getCell(1).alignment = { wrapText: true, vertical: 'top' }; r.height = Math.max(18, Math.ceil(text.length / 60) * 17 + (date ? 17 : 0)); };
  const title = (t: string) => { s1.addRow([]); const r = s1.addRow([t]); r.font = { bold: true, size: 12 }; r.eachCell((x) => { x.border = { bottom: { style: 'medium', color: { argb: HEAD } } }; }); s1.mergeCells(r.number, 1, r.number, 6); };
  s1.addRow([safe(c.title)]).font = { bold: true, size: 16 };
  s1.addRow(['チーム', `${c.teamId}チーム`]);
  s1.addRow(['企画名', safe(c.projectName)]);
  s1.addRow(['報告日', c.today]);
  s1.addRow(['報告期間', c.from ? `${c.from} 〜 ${c.today}` : c.today]);
  s1.addRow(['メンバー', safe(c.members.join('・'))]);
  title('1. プロジェクトの概要');
  para(c.summary || '(概要・目的を記入してください)', c.summary ? c.summaryDate : '');
  title('2. 進捗状況');
  s1.addRow(['総合', c.judgement]);
  s1.addRow(['計画に対する進捗', `計画 ${c.plannedPct}% / 実績 ${c.actualPct}%`]);
  s1.addRow(['タスク', `全${c.counts.total}件(完了 ${c.counts.done} / 進行中 ${c.counts.doing} / 未着手 ${c.counts.todo}${c.counts.hold > 0 ? ` / 保留 ${c.counts.hold}` : ''})`]);
  s1.addRow([]);
  head(s1.addRow(['工程', '期間', '完了', '全体', '進捗', '状況']));
  for (const p of c.phases) s1.addRow([safe(p.title), range(p.start, p.end), p.done, p.total, `${p.pct}%`, p.state]);
  title('3. ガントチャート / 4. WBS');
  s1.addRow(['シート「ガントチャート」と、シート「WBS」を参照してください。']);
  title('5. 直近の実績(過去2週間に完了したタスク)');
  if (c.recent.length === 0) s1.addRow(['(特記事項なし)']);
  for (const t of c.recent) s1.addRow([safe(t.title), safe(t.phase)]);
  title('6. 課題と今後の予定');
  if (c.overdue.length > 0) { s1.addRow(['計画より遅れているタスク']).font = { bold: true }; for (const t of c.overdue) s1.addRow([safe(t.title), safe(t.phase), `予定 ${mdLabel(t.end)}`]); }
  if (c.upcoming.length > 0) { s1.addRow(['今後4週間の予定']).font = { bold: true }; head(s1.addRow(['タスク', '工程', '期間', '', '', ''])); for (const t of c.upcoming) s1.addRow([safe(t.title), safe(t.phase), range(t.start, t.end)]); }
  if (c.issuesText) para(c.issuesText, c.issuesDate);
  else if (c.overdue.length === 0 && c.upcoming.length === 0) s1.addRow(['(特記事項なし)']);
  else s1.addRow(['(課題への対応と今後の方針を記入してください)']);

  // ── WBS
  const s2 = wb.addWorksheet('WBS', { views: [{ state: 'frozen', ySplit: 1 }], pageSetup: { orientation: 'landscape', paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0 } });
  const own = input.showAssignees;
  s2.columns = [{ header: '番号', width: 8 }, { header: 'タスク', width: 44 }, ...(own ? [{ header: '担当', width: 18 }] : []), { header: '状態', width: 10 }, { header: '開始', width: 9 }, { header: '終了', width: 9 }, { header: '進捗', width: 8 }];
  head(s2.getRow(1));
  for (const r of rows) {
    const row = s2.addRow([r.no, safe(r.title), ...(own ? [safe(r.assignees)] : []), r.statusLabel, r.start ? mdLabel(r.start) : '', r.end ? mdLabel(r.end) : '', r.progress / 100]);
    const st = own ? 4 : 3;
    row.getCell(2).alignment = { indent: (r.depth - 1) * 2, wrapText: true, vertical: 'top' };
    row.getCell(st + 3).numFmt = '0%';
    if (!r.leaf) row.font = { bold: r.depth === 1 };
    if (r.derived) { row.getCell(st + 1).font = { italic: true, color: { argb: 'FF7A6F92' } }; row.getCell(st + 2).font = { italic: true, color: { argb: 'FF7A6F92' } }; }
    row.getCell(st).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: FILL[r.status] } };
    row.getCell(st).font = { color: { argb: r.status === 'hold' ? 'FF2B2340' : 'FFFFFFFF' }, bold: true };
    row.getCell(st).alignment = { horizontal: 'center' };
  }
  s2.autoFilter = { from: 'A1', to: own ? 'G1' : 'F1' };

  // ── ガントチャート
  const weeks = weekColumns(rows, [], input.today); // 報告書には、マイルストーンを載せない
  const s3 = wb.addWorksheet('ガントチャート', { views: [{ state: 'frozen', xSplit: 3, ySplit: 2 }], pageSetup: { orientation: 'landscape', paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0 } });
  s3.getColumn(1).width = 7; s3.getColumn(2).width = 36; s3.getColumn(3).width = 14;
  weeks.forEach((_, i) => { s3.getColumn(4 + i).width = 4.2; });
  const h1 = s3.getRow(1); const h2 = s3.getRow(2);
  h1.getCell(1).value = '番号'; h1.getCell(2).value = 'タスク'; h1.getCell(3).value = input.showAssignees ? '担当' : '';
  weeks.forEach((w, i) => { h1.getCell(4 + i).value = Number(w.slice(5, 7)) + '月'; h2.getCell(4 + i).value = Number(w.slice(8, 10)); });
  head(h1); head(h2);
  const todayIdx = weeks.findIndex((w) => w <= input.today && input.today <= new Date(Date.parse(`${w}T00:00:00Z`) + 6 * 86400000).toISOString().slice(0, 10));
  if (todayIdx >= 0) { const c = h2.getCell(4 + todayIdx); c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE5484D' } }; }
  for (const r of rows) {
    const row = s3.addRow([r.no, safe(r.title), input.showAssignees ? safe(r.assignees) : '']);
    row.getCell(2).alignment = { indent: (r.depth - 1) * 2 };
    if (!r.leaf) row.font = { bold: r.depth === 1 };
    weeks.forEach((w, i) => {
      const c = row.getCell(4 + i);
      if (overlapsWeek(r.start, r.end, w)) c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: r.derived ? 'FFC9C2F5' : FILL[r.status] } };
      if (i === todayIdx) c.border = { left: { style: 'thin', color: { argb: 'FFE5484D' } } };
    });
  }
  const legend = s3.addRow([]);
  s3.addRow(['', '凡例']).font = { bold: true };
  (['todo', 'doing', 'done', 'hold'] as const).forEach((st) => {
    const r = s3.addRow(['', { todo: '未着手', doing: '進行中', done: '完了', hold: '保留' }[st]]);
    r.getCell(3).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: FILL[st] } };
  });
  s3.addRow(['', '赤い見出し=今日の週 / 薄い紫=中のタスクから求めた期間']);
  void legend;

  const buf = await wb.xlsx.writeBuffer();
  return new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}
