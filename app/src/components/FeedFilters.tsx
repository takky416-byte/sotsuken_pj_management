import type { Member } from '../types';

export type FeedFilter = { sid: string; result: '' | 'progress' | 'done' | 'stuck' | 'nowork'; q: string };
export const NO_FILTER: FeedFilter = { sid: '', result: '', q: '' };
export const isFiltered = (f: FeedFilter): boolean => f.sid !== '' || f.result !== '' || f.q.trim() !== '';

/** 作業ログの一覧の、絞り込み (だれの・結果・文字)。件数が多いときに、見たいものだけを出す */
export function FeedFilters({ value, onChange, members, meSid, showWho }: {
  value: FeedFilter; onChange: (f: FeedFilter) => void; members: Member[]; meSid: string | null; showWho: boolean;
}) {
  const set = (c: Partial<FeedFilter>) => onChange({ ...value, ...c });
  return (
    <div className="feed-filters" role="search" aria-label="作業ログの絞り込み">
      {showWho && (
        <label>だれの
          <select aria-label="だれの作業ログ" value={value.sid} onChange={(e) => set({ sid: e.target.value })}>
            <option value="">全員</option>
            {meSid && <option value={meSid}>自分だけ</option>}
            {members.filter((m) => m.sid !== meSid).map((m) => <option key={m.sid} value={m.sid}>{m.name}</option>)}
          </select>
        </label>
      )}
      <label>結果
        <select aria-label="結果で絞り込む" value={value.result} onChange={(e) => set({ result: e.target.value as FeedFilter['result'] })}>
          <option value="">すべて</option>
          <option value="progress">進んだ</option>
          <option value="done">完了した</option>
          <option value="stuck">詰まった</option>
          <option value="nowork">作業なし</option>
        </select>
      </label>
      <label className="grow">文字
        <input type="search" aria-label="文字で絞り込む" placeholder="説明・次にやること・タスク名" value={value.q} maxLength={60} onChange={(e) => set({ q: e.target.value })} />
      </label>
      {isFiltered(value) && <button type="button" className="ghost" onClick={() => onChange(NO_FILTER)}>絞り込みをやめる</button>}
    </div>
  );
}
