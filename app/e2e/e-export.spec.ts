import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { login } from './helpers';

// b-journey / d-roster のあとに実行され、それまでのデータを書き出す
test('データの書き出し: バックアップ(JSON)と CSV', async ({ page }) => {
  await login(page, 'teacher@trident.ac.jp');
  await page.getByRole('link', { name: '書き出し' }).click();
  await expect(page.getByRole('heading', { name: 'データの書き出し' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'バックアップ(JSON)をダウンロード' })).toHaveCount(0); // 読み込む前は出ない

  await page.getByRole('button', { name: 'データを読み込む' }).click();
  await expect(page.getByText('読み込んだデータ')).toBeVisible();
  await expect(page.locator('.counts')).toContainText('名簿');
  await expect(page.locator('.counts li', { hasText: '日報' })).toContainText('件');

  // JSON (教員専用のデータを含む)
  const [d1] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'バックアップ(JSON)をダウンロード' }).click()]);
  expect(d1.suggestedFilename()).toMatch(/^sotsuken-backup-\d{4}-\d{2}-\d{2}\.json$/);
  const full = JSON.parse(readFileSync((await d1.path())!, 'utf8'));
  expect(full.meta).toMatchObject({ app: 'sotsuken-pj', version: 1, includesTeacherNotes: true });
  expect(full.collections['teams/A/tasks'].length).toBeGreaterThanOrEqual(7); // 雛形6 + 叩き台 + 学生が追加した分
  expect(full.collections['teams/A/dailyReports'].some((d: { entries: { note: string }[] }) => d.entries.some((e) => e.note.includes('レビューした')))).toBe(true);
  expect(full.collections.roster.some((r: { id: string }) => r.id === 'teacher@trident.ac.jp')).toBe(true);
  expect(JSON.stringify(full.collections.teacherNotes)).toContain('内密のメモ');

  // JSON (教員専用のデータを含めない)
  await page.getByLabel(/教員専用のデータ/).uncheck();
  const [d2] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'バックアップ(JSON)をダウンロード' }).click()]);
  const lite = JSON.parse(readFileSync((await d2.path())!, 'utf8'));
  expect(lite.meta.includesTeacherNotes).toBe(false);
  expect(lite.collections.teacherNotes).toBeUndefined();
  expect(lite.collections.roster).toBeDefined();

  // CSV
  const [d3] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'タスク', exact: true }).click()]);
  expect(d3.suggestedFilename()).toMatch(/^sotsuken-tasks-.*\.csv$/);
  const tasks = readFileSync((await d3.path())!, 'utf8');
  expect(tasks.startsWith('﻿チーム,ID,親ID,階層,タイトル')).toBe(true);
  expect(tasks).toContain('要件定義');
  expect(tasks).toContain('叩き台');

  const [d4] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: '日報', exact: true }).click()]);
  const dailies = readFileSync((await d4.path())!, 'utf8');
  expect(dailies).toContain('画面の下書きを作り、レビューした');
  expect(dailies).toContain('岩田');

  await expect(page.getByText(/最後に書き出した日/)).toBeVisible();
});
