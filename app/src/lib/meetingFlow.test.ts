import { describe, expect, it } from 'vitest';
import { MEETING_STEPS, TOTAL_MINUTES, mmss, stepAtElapsed } from './meetingFlow';

describe('meetingFlow', () => {
  it('全体は10分', () => expect(TOTAL_MINUTES).toBe(10));
  it('経過時間から段階がわかる', () => {
    expect(stepAtElapsed(0)).toEqual({ index: 0, remainingSec: 120 });
    expect(stepAtElapsed(125).index).toBe(1);
    expect(stepAtElapsed(125).remainingSec).toBe(175);
    expect(stepAtElapsed(9999).index).toBe(MEETING_STEPS.length - 1);
    expect(stepAtElapsed(9999).remainingSec).toBeLessThan(0);
  });
  it('mm:ss', () => { expect(mmss(75)).toBe('1:15'); expect(mmss(-5)).toBe('-0:05'); });
});
