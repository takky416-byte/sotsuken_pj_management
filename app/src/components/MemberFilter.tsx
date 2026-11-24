import type { Member } from '../types';

/**
 * 担当者で絞り込む (WBS・ガントチャート)。value は、メンバーの sid。空は「全員」。
 * meSid を渡すと、自分の名前に「(自分)」を付ける。
 */
export function MemberFilter({ members, value, onChange, meSid }: { members: Member[]; value: string; onChange: (sid: string) => void; meSid?: string | null }) {
  return (
    <label className="member-filter">担当で絞り込む
      <select aria-label="担当で絞り込む" value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">全員</option>
        {members.map((m) => <option key={m.sid} value={m.sid}>{m.name}{m.sid === meSid ? '(自分)' : ''}</option>)}
      </select>
    </label>
  );
}
