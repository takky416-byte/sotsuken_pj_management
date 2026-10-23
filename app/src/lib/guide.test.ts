import { describe, expect, it } from 'vitest';
import { SCENES, TOUR, stepForPath } from './guide';

describe('guide', () => {
  it('画面のパスから、ガイドの段階が決まる', () => {
    expect(TOUR[stepForPath('/')].id).toBe('home');
    expect(TOUR[stepForPath('/wbs')].id).toBe('wbs');
    expect(TOUR[stepForPath('/daily')].id).toBe('daily');
    expect(TOUR[stepForPath('/meeting/A')].id).toBe('meeting');
    expect(stepForPath('/help')).toBe(0);
  });
  it('段階から参照する「こんなとき」は、すべて存在する', () => {
    const ids = new Set(SCENES.map((s) => s.id));
    for (const t of TOUR) for (const s of t.scenes ?? []) expect(ids.has(s), `${t.id}:${s}`).toBe(true);
  });
  it('idは重複しない', () => {
    expect(new Set(TOUR.map((t) => t.id)).size).toBe(TOUR.length);
    expect(new Set(SCENES.map((t) => t.id)).size).toBe(SCENES.length);
  });
});
