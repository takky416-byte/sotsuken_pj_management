import { describe, expect, test } from 'vitest';
import { nextSid, planMove, sortMembers, withMember, withoutMember } from './rosterEdit';

const m = (sid: string, name = sid) => ({ sid, name });

describe('rosterEdit', () => {
  test('メンバー表は番号順。追加・更新・削除', () => {
    expect(sortMembers([m('A10'), m('A2'), m('A1')]).map((x) => x.sid)).toEqual(['A1', 'A2', 'A10']);
    expect(withMember([m('A1', '岩田'), m('A2', '近内')], m('A1', '岩田改'))).toEqual([m('A1', '岩田改'), m('A2', '近内')]);
    expect(withMember([m('A2')], m('A1')).map((x) => x.sid)).toEqual(['A1', 'A2']);
    expect(withoutMember([m('A1'), m('A2')], 'A1')).toEqual([m('A2')]);
  });
  test('学生IDは、使われていない最小の番号', () => {
    expect(nextSid('A', [])).toBe('A1');
    expect(nextSid('A', ['A1', 'A2', 'B1'])).toBe('A3');
    expect(nextSid('A', ['A1', 'A3'])).toBe('A2'); // 欠番を埋める
    expect(nextSid('B', ['A1', 'A2'])).toBe('B1');
    expect(nextSid('A', ['A10'])).toBe('A1');
  });
  test('チームの移動: IDの付け替えと、両チームのメンバー表', () => {
    const plan = planMove({ sid: 'A2', name: '近内' }, [m('A1', '岩田'), m('A2', '近内')], 'B', [m('B1', '長田')], ['A1', 'A2', 'B1']);
    expect(plan.newSid).toBe('B2');
    expect(plan.fromMembers).toEqual([m('A1', '岩田')]);
    expect(plan.toMembers).toEqual([m('B1', '長田'), m('B2', '近内')]);
  });
});
