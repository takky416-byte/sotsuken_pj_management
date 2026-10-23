import { useEffect, useRef, useState } from 'react';
import { sendThanks } from '../data/thanks';
import { celebrate } from '../lib/celebrate';
import type { Thank } from '../lib/engagement';
import { formatDate } from '../lib/dates';
import {
  STAMPS, THANKS_PER_DAY, stampNote, suggestThanks, thanksLeft, unseenFor, type ThanksSuggestion,
} from '../lib/thanksView';
import type { Member, Task } from '../types';

const seenKey = (sid: string) => `thanks-seen:${sid}`;
const getSeen = (sid: string): number => { try { return Number(localStorage.getItem(seenKey(sid))) || 0; } catch { return 0; } };
const setSeen = (sid: string, n: number) => { try { localStorage.setItem(seenKey(sid), String(n)); } catch { /* 保存できなくても動く */ } };

/**
 * ホームの「ありがとう」。
 * - もらったありがとう (新着は、開いたときにお祝いして目立たせる)
 * - 送るきっかけ (最近、ほかの人が完了したタスクなど) と、メンバーの一覧から、スタンプを1タップで送る
 */
export function ThanksCard({ teamId, sid, members, tasks, thanks, today }: {
  teamId: string; sid: string; members: Member[]; tasks: Task[]; thanks: Thank[]; today: string;
}) {
  const nameOf = (id: string) => (id === 'teacher' ? '先生' : members.find((m) => m.sid === id)?.name ?? id);
  const [seen0] = useState(() => getSeen(sid)); // 開いた時点の既読。新着の表示に使う
  const fresh = unseenFor(thanks, sid, seen0);
  const [target, setTarget] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string[]>([]);
  const [err, setErr] = useState('');
  const left = thanksLeft(thanks, sid, today) - sentTo.length; // 送った直後は、購読が追いつくまでの分も引く
  const celebrated = useRef(false);

  // 新着があれば、1回だけお祝いして、既読にする
  useEffect(() => {
    if (celebrated.current || fresh.length === 0) return;
    celebrated.current = true;
    celebrate(fresh.length === 1 ? `${nameOf(fresh[0].from)}さんから、ありがとうが届きました!` : `ありがとうが${fresh.length}件届きました!`);
    setSeen(sid, Math.max(...fresh.map((t) => t.createdAt)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fresh.length]);

  const sentIds = new Set([...thanks.filter((t) => t.from === sid && t.date === today).map((t) => t.to), ...sentTo]);
  const ideas: ThanksSuggestion[] = suggestThanks(tasks, members, thanks, sid, today).filter((s) => !sentTo.includes(s.to));
  const others = members.filter((m) => m.sid !== sid);
  const received = thanks.filter((t) => t.to === sid).slice(0, 4);

  const send = async (to: string, note: string) => {
    if (left <= 0) return;
    setErr(''); setTarget(null); setSentTo((x) => [...x, to]);
    try { await sendThanks(teamId, sid, to, note); celebrate(`${nameOf(to)}さんに、ありがとうを送りました`); }
    catch (e) { setSentTo((x) => x.filter((y) => y !== to)); setErr(`送れませんでした: ${(e as Error).message}`); }
  };
  const stamps = (to: string) => (
    <div className="stamps" role="group" aria-label={`${nameOf(to)}さんに送るスタンプ`}>
      {STAMPS.map((s) => <button key={s.label} type="button" className="stamp" disabled={left <= 0} onClick={() => send(to, stampNote(s))}><span aria-hidden="true">{s.emoji}</span>{s.label}</button>)}
    </div>
  );

  return (
    <section className="card thanks-card">
      <h3>🙏 ありがとう <span className="mission-count">{left > 0 ? `今日あと${left}回` : `今日は${THANKS_PER_DAY}回送りました`}</span></h3>

      {received.length > 0 && (
        <ul className="plain received">
          {received.map((t) => (
            <li key={t.id} className={t.createdAt > seen0 ? 'fresh' : ''}>
              {t.createdAt > seen0 && <span className="badge new">NEW</span>} <strong>{nameOf(t.from)}</strong>さんから
              <span className="hint"> {formatDate(t.date)}</span>{t.note && <> 「{t.note}」</>}
            </li>
          ))}
        </ul>
      )}
      {received.length === 0 && <p className="hint">まだ届いていません。誰かを助けると、届くかもしれません。</p>}

      {ideas.length > 0 && (
        <>
          <div className="label">こんなとき、ありがとうを伝えよう</div>
          {ideas.map((s) => (
            <div key={s.to} className="idea">
              <div><strong>{s.name}</strong>さんが {s.reason}</div>
              {stamps(s.to)}
            </div>
          ))}
        </>
      )}

      <div className="label">ほかの人にも(押して、スタンプを選ぶ)</div>
      <div className="chips">
        {others.map((m) => (
          <button key={m.sid} type="button" className={`chip-btn ${target === m.sid ? 'on' : ''}`} disabled={left <= 0} aria-pressed={target === m.sid}
            onClick={() => setTarget(target === m.sid ? null : m.sid)}>
            {sentIds.has(m.sid) ? '✓ ' : ''}{m.name}
          </button>
        ))}
      </div>
      {target && stamps(target)}
      {err && <p className="error">{err}</p>}
      <p className="hint">スタンプ1つで送れます。言葉を添えたいときは「チーム」の画面からどうぞ。</p>
    </section>
  );
}

