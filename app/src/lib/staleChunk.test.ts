import { beforeEach, describe, expect, it } from 'vitest';
import { isStaleChunkError, mayReloadForUpdate } from './staleChunk';

describe('古い画面の部品が読めないとき', () => {
  beforeEach(() => { const m = new Map<string, string>(); (globalThis as { sessionStorage?: unknown }).sessionStorage = { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => m.set(k, v) }; });
  it('部品が読めない失敗を見分ける', () => {
    expect(isStaleChunkError(new TypeError('Failed to fetch dynamically imported module: https://x/assets/a.js'))).toBe(true);
    expect(isStaleChunkError(new Error('Importing a module script failed.'))).toBe(true);
    expect(isStaleChunkError(new Error('permission-denied'))).toBe(false);
  });
  it('再読み込みは、1分に1回だけ (くり返しを防ぐ)', () => {
    expect(mayReloadForUpdate(1_000_000)).toBe(true);
    expect(mayReloadForUpdate(1_030_000)).toBe(false);
    expect(mayReloadForUpdate(1_061_000)).toBe(true);
  });
});
