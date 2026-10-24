import { beforeEach, describe, expect, it } from 'vitest';
import { getTone, say, setTone, stamps } from './tone';

const store = new Map<string, string>();
beforeEach(() => {
  store.clear();
  Object.defineProperty(globalThis, 'localStorage', { value: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) }, configurable: true });
  Object.defineProperty(globalThis, 'document', { value: { documentElement: { dataset: {} } }, configurable: true });
});

describe('tone', () => {
  it('既定は落ち着き。選んだトーンは、保存される', () => {
    expect(getTone()).toBe('standard');
    setTone('casual');
    expect(getTone()).toBe('casual');
    expect(store.get('tone')).toBe('casual');
    store.set('tone', 'bogus');
    expect(getTone()).toBe('standard');
    // 以前の名前で保存されていても、引き継ぐ
    store.set('tone', 'friendly'); expect(getTone()).toBe('casual');
    store.set('tone', 'calm'); expect(getTone()).toBe('standard');
  });
  it('標準・シンプルでは、感嘆符も絵文字も使わない文言', () => {
    setTone('standard');
    const all = [say.taskDone('設計', 1, 1), say.taskDone(null, 3, 10), say.promiseKept(), say.missionsAll(), say.missionsClear(), say.thanksReceived('甲'), say.thanksReceivedMany(2), say.dailySubmitted(3), say.dailySubmitted(0)];
    for (const m of all) expect(m, m).not.toMatch(/[!！]/);
    setTone('simple');
    for (const m of [say.taskDone('設計', 1, 1), say.promiseKept(), say.missionsAll(), say.missionsClear(), say.thanksReceived('甲'), say.dailySubmitted(3)]) expect(m, m).not.toMatch(/[!！]/);
  });
  it('カジュアルでは、明るい言い方とスタンプになる', () => {
    setTone('casual');
    expect(say.taskDone('設計', 1, 1)).toContain('!');
    expect(stamps().some((s) => s.label === 'ナイス!')).toBe(true);
    setTone('standard');
    expect(stamps().some((s) => s.label === 'ナイス!')).toBe(false);
    setTone('simple');
    expect(stamps().every((s) => s.emoji === '')).toBe(true);
    expect(say.taskDone(null, 3, 10)).toBe('完了 3/10');
  });
});
