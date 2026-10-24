import { describe, expect, it } from 'vitest';
import { addDays } from './dates';
import { EMPTY_STATE, load, platformOf, shouldShow, snooze } from './bookmark';

describe('bookmark', () => {
  it('端末の種類', () => {
    expect(platformOf('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Safari')).toBe('ios');
    expect(platformOf('Mozilla/5.0 (Linux; Android 14) Chrome/120')).toBe('android');
    expect(platformOf('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/120')).toBe('mac');
    expect(platformOf('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120')).toBe('desktop');
  });
  it('初回は出す。追加済みは出さない。「あとで」の間は出さない', () => {
    expect(shouldShow(EMPTY_STATE, '2026-11-02')).toBe(true);
    expect(shouldShow({ ...EMPTY_STATE, done: true }, '2026-11-02')).toBe(false);
    const s = snooze(EMPTY_STATE, '2026-11-02', addDays);
    expect(s).toEqual({ done: false, snoozedUntil: '2026-11-05', snoozes: 1 });
    expect(shouldShow(s, '2026-11-04')).toBe(false);
    expect(shouldShow(s, '2026-11-05')).toBe(true);
  });
  it('壊れた保存値でも落ちない', () => {
    expect(load(null)).toEqual(EMPTY_STATE);
    expect(load('{oops')).toEqual(EMPTY_STATE);
    expect(load('{"done":true}').done).toBe(true);
  });
});
