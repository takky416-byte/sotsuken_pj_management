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
    expect(getTone()).toBe('calm');
    setTone('friendly');
    expect(getTone()).toBe('friendly');
    expect(store.get('tone')).toBe('friendly');
    store.set('tone', 'bogus');
    expect(getTone()).toBe('calm');
  });
  it('落ち着きでは、感嘆符も絵文字も使わない文言', () => {
    setTone('calm');
    const all = [say.taskDone('設計', 1, 1), say.taskDone(null, 3, 10), say.promiseKept(), say.missionsAll(), say.missionsClear(), say.thanksReceived('甲'), say.thanksReceivedMany(2), say.dailySubmitted(3), say.dailySubmitted(0)];
    for (const m of all) expect(m, m).not.toMatch(/[!！]/);
  });
  it('親しみやすいでは、明るい言い方とスタンプになる', () => {
    setTone('friendly');
    expect(say.taskDone('設計', 1, 1)).toContain('!');
    expect(stamps().some((s) => s.label === 'ナイス!')).toBe(true);
    setTone('calm');
    expect(stamps().some((s) => s.label === 'ナイス!')).toBe(false);
  });
});
