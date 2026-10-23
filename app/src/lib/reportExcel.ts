// 報告書の Excel (.xlsx) をブラウザの中で作る。exceljs は大きいので、使うときだけ読み込む。
import type { Milestone, Task, TaskStatus } from '../types';
import type { ProjectAnalysis } from './analysis';
import { mdLabel, milestonesInWeek, overlapsWeek, wbsRows, weekColumns } from './report';

export type ReportInput = {
  teamId: string;
  projectName: string;
  members: { sid: string; name: string }[];
  tasks: Task[];
  milestones: Milestone[];
  analysis: ProjectAnalysis;
  today: string;
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
  const a = input.analysis;
  const head = (row: import('exceljs').Row) => {
    row.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    row.eachCell((c) => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEAD } }; c.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }; });
  };

  // ── 概況
  const s1 = wb.addWorksheet('概況', { pageSetup: { orientation: 'landscape', paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0 } });
  s1.columns = [{ width: 26 }, { width: 18 }, { width: 14 }, { width: 14 }, { width: 14 }, { width: 40 }];
  s1.addRow([safe(`${input.teamId}チーム プロジェクト概況レポート`)]).font = { bold: true, size: 16 };
  s1.addRow(['企画', safe(input.projectName)]);
  s1.addRow(['メンバー', safe(input.members.map((m) => m.name).join('・'))]);
  s1.addRow(['作成日', input.today]);
  s1.addRow([]);
  head(s1.addRow(['進捗のまとめ', '件数']));
  for (const [k, v] of [['全タスク', a.total], ['完了', a.done], ['進行中', a.doing], ['未着手', a.todo], ['保留', a.hold]] as const) s1.addRow([k, v]);
  s1.addRow(['進捗(実績)', `${a.progressPct}%`]);
  s1.addRow(['進捗(予定)', `${a.plannedPct}%`]);
  s1.addRow(['期限超過', a.overdue.length]);
  s1.addRow(['WBS外の作業', a.adhoc.count]);
  s1.addRow([]);
  head(s1.addRow(['大項目', '進捗', '完了', '全体', '開始', '終了']));
  for (const p of a.phases) s1.addRow([safe(p.title), `${p.pct}%`, p.done, p.total, p.start ? mdLabel(p.start) : '', p.end ? mdLabel(p.end) : '']);
  s1.addRow([]);
  head(s1.addRow(['メンバー', '担当', '進行中', '完了', '期限超過', '']));
  for (const m of a.members) s1.addRow([safe(m.name), m.assigned, m.doing, m.done, m.overdue]);
  s1.addRow([]);
  head(s1.addRow(['所見(自動分析)', '', '', '', '', '']));
  for (const f of a.findings) { const r = s1.addRow([safe(f.text)]); s1.mergeCells(r.number, 1, r.number, 6); r.getCell(1).alignment = { wrapText: true, vertical: 'top' }; r.height = 32; }
  if (a.findings.length === 0) s1.addRow(['(所見はありません)']);

  // ── WBS
  const s2 = wb.addWorksheet('WBS', { views: [{ state: 'frozen', ySplit: 1 }], pageSetup: { orientation: 'landscape', paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0 } });
  s2.columns = [{ header: '番号', width: 8 }, { header: 'タスク', width: 44 }, { header: '担当', width: 18 }, { header: '状態', width: 10 }, { header: '開始', width: 9 }, { header: '終了', width: 9 }, { header: '進捗', width: 8 }, { header: '詳細', width: 40 }];
  head(s2.getRow(1));
  for (const r of rows) {
    const row = s2.addRow([r.no, safe(r.title), safe(r.assignees), r.statusLabel, r.start ? mdLabel(r.start) : '', r.end ? mdLabel(r.end) : '', r.progress / 100, safe(r.detail)]);
    row.getCell(2).alignment = { indent: (r.depth - 1) * 2, wrapText: true, vertical: 'top' };
    row.getCell(7).numFmt = '0%';
    if (!r.leaf) row.font = { bold: r.depth === 1 };
    if (r.derived) { row.getCell(5).font = { italic: true, color: { argb: 'FF7A6F92' } }; row.getCell(6).font = { italic: true, color: { argb: 'FF7A6F92' } }; }
    row.getCell(4).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: FILL[r.status] } };
    row.getCell(4).font = { color: { argb: r.status === 'hold' ? 'FF2B2340' : 'FFFFFFFF' }, bold: true };
    row.getCell(4).alignment = { horizontal: 'center' };
  }
  s2.autoFilter = { from: 'A1', to: 'H1' };

  // ── ガント
  const weeks = weekColumns(rows, input.milestones, input.today);
  const s3 = wb.addWorksheet('ガント', { views: [{ state: 'frozen', xSplit: 3, ySplit: 2 }], pageSetup: { orientation: 'landscape', paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0 } });
  s3.getColumn(1).width = 7; s3.getColumn(2).width = 36; s3.getColumn(3).width = 14;
  weeks.forEach((_, i) => { s3.getColumn(4 + i).width = 4.2; });
  const h1 = s3.getRow(1); const h2 = s3.getRow(2);
  h1.getCell(1).value = '番号'; h1.getCell(2).value = 'タスク'; h1.getCell(3).value = '担当';
  weeks.forEach((w, i) => { h1.getCell(4 + i).value = Number(w.slice(5, 7)) + '月'; h2.getCell(4 + i).value = Number(w.slice(8, 10)); });
  head(h1); head(h2);
  const todayIdx = weeks.findIndex((w) => w <= input.today && input.today <= new Date(Date.parse(`${w}T00:00:00Z`) + 6 * 86400000).toISOString().slice(0, 10));
  if (todayIdx >= 0) { const c = h2.getCell(4 + todayIdx); c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE5484D' } }; }
  const msRow = s3.addRow(['', 'マイルストーン', '']);
  msRow.font = { bold: true };
  weeks.forEach((w, i) => {
    const ms = milestonesInWeek(input.milestones, w);
    if (ms.length > 0) { const c = msRow.getCell(4 + i); c.value = '◆'; c.font = { color: { argb: 'FFE08A00' }, bold: true }; c.alignment = { horizontal: 'center' }; c.note = ms.map((m) => `${mdLabel(m.date)} ${m.title}`).join('\n'); }
  });
  for (const r of rows) {
    const row = s3.addRow([r.no, safe(r.title), safe(r.assignees)]);
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
