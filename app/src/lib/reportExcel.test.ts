import { describe, expect, it } from 'vitest';
import ExcelJS from 'exceljs';
import { analyze } from './analysis';
import { buildReportWorkbook } from './reportExcel';
import type { Task } from '../types';

const task = (o: Partial<Task>): Task => ({
  id: 'x', title: 't', detail: '', parentId: null, depth: 1, order: 1, status: 'todo', assignees: [], startDate: null, endDate: null, links: [],
  source: 'user', createdBy: 'a', updatedBy: 'a', createdAt: 0, updatedAt: 0, deleted: false, deletedAt: null, ...o,
});

describe('buildReportWorkbook', () => {
  it('概況・WBS・ガントの3シートができ、数式にならない(文字のまま)', async () => {
    const tasks = [
      task({ id: 'p', title: '=HYPERLINK("x")' }),
      task({ id: 'a', title: 'ER図', parentId: 'p', depth: 2, status: 'doing', assignees: ['s1'], startDate: '2026-11-02', endDate: '2026-11-13' }),
    ];
    const members = [{ sid: 's1', name: '甲' }];
    const ms = [{ id: 'm', title: '中間報告', date: '2026-11-25', teamId: null }];
    const blob = await buildReportWorkbook({ teamId: 'A', projectName: '企画', members, tasks, milestones: ms, analysis: analyze(tasks, ms, members, '2026-11-10'), today: '2026-11-10' });
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await blob.arrayBuffer());
    expect(wb.worksheets.map((w) => w.name)).toEqual(['概況', 'WBS', 'ガント']);
    const wbs = wb.getWorksheet('WBS')!;
    expect(wbs.getRow(2).getCell(2).value).toBe('=HYPERLINK("x")');
    expect(wbs.getRow(3).getCell(3).value).toBe('甲');
    const gantt = wb.getWorksheet('ガント')!;
    expect(gantt.getRow(4).getCell(2).value).toBe('=HYPERLINK("x")');
  });
});
