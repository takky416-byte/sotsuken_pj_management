import { describe, expect, it } from 'vitest';
import { SCENES, TOUR } from './guide';
import { scenesFor, tourFor } from './guideTone';
import { TONES } from './tone';

describe('トーンごとの利用ガイド', () => {
  it('どのトーンでも、段階・場面の数と、移動先・関連する場面が、標準と同じ', () => {
    for (const { id } of TONES) {
      const tour = tourFor(id); const scenes = scenesFor(id);
      expect(tour.map((s) => [s.id, s.to, s.screen, s.scenes])).toEqual(TOUR.map((s) => [s.id, s.to, s.screen, s.scenes]));
      expect(scenes.map((s) => [s.id, s.to])).toEqual(SCENES.map((s) => [s.id, s.to]));
      for (const s of tour) { expect(s.title, `${id}:${s.id}`).not.toBe(''); expect(s.points.length, `${id}:${s.id}`).toBeGreaterThan(0); }
      for (const s of scenes) expect(s.steps.length, `${id}:${s.id}`).toBeGreaterThan(0);
    }
  });
  it('標準は、いまの文言のまま。カジュアル・シンプルは、言い方が変わる', () => {
    expect(tourFor('standard')).toEqual(TOUR);
    expect(tourFor('casual')[0].lead).not.toBe(TOUR[0].lead);
    expect(tourFor('simple')[0].lead).not.toBe(TOUR[0].lead);
    const len = (t: ReturnType<typeof tourFor>) => t.reduce((n, s) => n + s.lead.length + s.points.join('').length, 0);
    expect(len(tourFor('simple'))).toBeLessThan(len(tourFor('standard'))); // シンプルは、短い
  });
  it('標準とシンプルには、感嘆符も絵文字もない。ボタン名は、どのトーンでも実際の画面と同じ', () => {
    const emoji = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;
    for (const id of ['standard', 'simple'] as const) {
      const text = [...tourFor(id).flatMap((s) => [s.title, s.lead, ...s.points]), ...scenesFor(id).flatMap((s) => [s.title, ...s.steps])].join('\\n');
      expect(text, id).not.toMatch(/[!！]/);
      expect(text, id).not.toMatch(emoji);
    }
    for (const id of TONES.map((t) => t.id)) {
      const text = [...tourFor(id).flatMap((s) => s.points), ...scenesFor(id).flatMap((s) => s.steps)].join('\\n');
      for (const label of ['＋ WBSにない作業をした', 'ガントチャートで編集する', '手待ちの人と、タスクの振り分け', '詰まっていること']) expect(text, `${id}:${label}`).toContain(label);
    }
  });
});
