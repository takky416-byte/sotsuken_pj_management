import type { Member } from '../types';

const num = (sid: string) => Number(/\d+$/.exec(sid)?.[0] ?? 0);

export const sortMembers = (members: Member[]): Member[] => [...members].sort((a, b) => num(a.sid) - num(b.sid));

export const withMember = (members: Member[], m: Member): Member[] =>
  sortMembers([...members.filter((x) => x.sid !== m.sid), m]);

export const withoutMember = (members: Member[], sid: string): Member[] => members.filter((x) => x.sid !== sid);

/** チームの中で、使われていない最小の番号の学生ID (A1, A2, ... の続き)。 */
export function nextSid(teamId: string, usedSids: string[]): string {
  const used = new Set(usedSids.filter((s) => s.startsWith(teamId)).map(num));
  let n = 1;
  while (used.has(n)) n++;
  return `${teamId}${n}`;
}

export type MovePlan = {
  newSid: string;
  /** 元のチームの、メンバー表示用データ */
  fromMembers: Member[];
  /** 移動先のチームの、メンバー表示用データ */
  toMembers: Member[];
};

/**
 * 学生を別のチームに移す。学生IDは移動先の番号に付け替える (日報や担当は sid で参照されるため、
 * これまでの日報・担当は元のチームに残る)。
 */
export function planMove(
  student: { sid: string; name: string },
  fromMembers: Member[],
  toTeamId: string,
  toMembers: Member[],
  allSids: string[],
): MovePlan {
  const newSid = nextSid(toTeamId, allSids);
  return {
    newSid,
    fromMembers: withoutMember(fromMembers, student.sid),
    toMembers: withMember(toMembers, { sid: newSid, name: student.name }),
  };
}
