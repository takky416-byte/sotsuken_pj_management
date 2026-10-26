import { describe, expect, it } from 'vitest';
import ExcelJS from 'exceljs';
import { analyze } from './analysis';
import { buildCompanyReport } from './companyReport';
import { buildReportWorkbook } from './reportExcel';
import type { Task } from '../types';

const task = (o: Partial<Task>): Task => ({
  id: 'x', title: 't', detail: '', parentId: null, depth: 1, order: 1, status: 'todo', assignees: [], startDate: null, endDate: null, links: [],
  source: 'user', createdBy: 'a', updatedBy: 'a', createdAt: 0, updatedAt: 0, deleted: false, deletedAt: null, ...o,
});

describe('buildReportWorkbook', () => {
  it('報告書・WBS・ガントチャートの3シートができ、数式にならない(文字のまま)', async () => {
    const tasks = [
      task({ id: 'p', title: '=HYPERLINK("x")' }),
      task({ id: 'a', title: 'ER図', parentId: 'p', depth: 2, status: 'doing', assignees: ['s1'], startDate: '2026-11-02', endDate: '2026-11-13' }),
    ];
    const members = [{ sid: 's1', name: '甲' }];
    const ms = [{ id: 'm', title: '中間報告', date: '2026-11-25', teamId: null }];
    const company = buildCompanyReport({ id: 'A', projectName: '企画', members, kickoffAt: null }, tasks, ms, { summary: '=SUM(1)', issues: '', next: '', by: 's1', at: 1, summaryAt: Date.parse('2026-11-05T03:00:00Z') }, '2026-11-10');
    const blob = await buildReportWorkbook({ teamId: 'A', projectName: '企画', members, tasks, milestones: ms, analysis: analyze(tasks, ms, members, '2026-11-10'), today: '2026-11-10', company, showAssignees: true });
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await blob.arrayBuffer());
    expect(wb.worksheets.map((w) => w.name)).toEqual(['報告書', 'WBS', 'ガントチャート']);
    const rep = wb.getWorksheet('報告書')!;
    const texts: string[] = [];
    rep.eachRow((r) => r.eachCell((c) => texts.push(String(c.value))));
    expect(texts).toContain('卒業研究制作 プロジェクト進捗報告書');
    expect(texts.some((t) => t.includes('=SUM(1)') && t.includes('記入日: 2026/11/05'))).toBe(true); // 数式にならず文字のまま。記入日がつく
    expect(texts.some((t) => /偏り|WBSにない|メンバー別/.test(t))).toBe(false); // チーム内の分析は入れない
    const wbs = wb.getWorksheet('WBS')!;
    expect(wbs.getRow(2).getCell(2).value).toBe('=HYPERLINK("x")');
    expect(wbs.getRow(3).getCell(3).value).toBe('甲');
    const gantt = wb.getWorksheet('ガントチャート')!;
    expect(gantt.getRow(4).getCell(2).value).toBe('=HYPERLINK("x")');
  });
});
