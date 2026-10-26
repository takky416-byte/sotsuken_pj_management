import { describe, expect, test } from 'vitest';
import { greetingText, jstHour, slotOf } from './greeting';

const at = (jst: string) => new Date(`${jst}+09:00`);

describe('greeting', () => {
  test('時間帯 (日本時間)', () => {
    expect([4, 5, 9, 10, 16, 17, 21, 22, 0].map(slotOf)).toEqual(['night', 'morning', 'morning', 'day', 'day', 'evening', 'evening', 'night', 'night']);
    expect(jstHour(new Date('2026-10-26T15:30:00Z'))).toBe(0);
  });
  test('シンプルは、時間帯のあいさつだけ (乱数に関係なく同じ)', () => {
    expect(greetingText('甲', 'simple', at('2026-10-27T08:00:00'), 0.1)).toBe('おはようございます、甲さん');
    expect(greetingText('甲', 'simple', at('2026-10-27T13:00:00'), 0.9)).toBe('こんにちは、甲さん');
    expect(greetingText('甲', 'simple', at('2026-10-27T19:00:00'), 0.5)).toBe('こんばんは、甲さん');
  });
  test('標準・カジュアルは、乱数でことなる言い方になる。名前が入る。標準には絵文字・感嘆符がない', () => {
    const t = at('2026-10-27T13:00:00'); // 火曜の昼
    const std = new Set([0, 0.3, 0.6, 0.99].map((p) => greetingText('甲', 'standard', t, p)));
    expect(std.size).toBeGreaterThan(1);
    for (const s of std) { expect(s).toContain('甲さん'); expect(s).not.toMatch(/[!！\p{Extended_Pictographic}]/u); }
    const cas = new Set([0, 0.3, 0.6, 0.99].map((p) => greetingText('甲', 'casual', t, p)));
    expect(cas.size).toBeGreaterThan(1);
    expect([...cas].some((s) => /\p{Extended_Pictographic}/u.test(s))).toBe(true);
  });
  test('月曜の朝・昼には、曜日のひとことが選択肢に入る。夜には入らない', () => {
    const mon = at('2026-10-26T09:00:00');
    expect(greetingText('甲', 'standard', mon, 0.999)).toBe('甲さん、今週もよろしくお願いします');
    const monNight = at('2026-10-26T23:00:00');
    expect([0, 0.5, 0.999].map((p) => greetingText('甲', 'standard', monNight, p)).some((s) => s.includes('今週'))).toBe(false);
  });
  test('乱数が範囲の端でも、範囲外にならない', () => {
    expect(greetingText('甲', 'standard', at('2026-10-27T13:00:00'), 0.99999)).toContain('甲さん');
    expect(greetingText('甲', 'casual', at('2026-10-27T13:00:00'), 0)).toContain('甲さん');
  });
});
