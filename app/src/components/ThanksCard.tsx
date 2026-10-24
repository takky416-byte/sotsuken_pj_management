import { useContext, useEffect, useRef, useState } from 'react';
import { ProfileOverride } from '../auth/AuthProvider';
import { sendThanks } from '../data/thanks';
import { Em } from './Em';
import { celebrate } from '../lib/celebrate';
import type { Thank } from '../lib/engagement';
import { formatDate } from '../lib/dates';
import { say, stamps as toneStamps, useTone } from '../lib/tone';
import {
  THANKS_PER_DAY, stampNote, suggestThanks, thanksLeft, unseenFor, type ThanksSuggestion,
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
  useTone(); // トーンが変わったら、スタンプも描き直す
  const nameOf = (id: string) => (id === 'teacher' ? '先生' : members.find((m) => m.sid === id)?.name ?? id);
  const [seen0] = useState(() => getSeen(sid)); // 開いた時点の既読。新着の表示に使う
  const fresh = unseenFor(thanks, sid, seen0);
  const [target, setTarget] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string[]>([]);
  const [err, setErr] = useState('');
  const left = thanksLeft(thanks, sid, today) - sentTo.length; // 送った直後は、購読が追いつくまでの分も引く
  const celebrated = useRef(false);
  const preview = useContext(ProfileOverride) !== null; // 教員の「学生の画面」では、お祝いも既読の記録もしない

  // 新着があれば、1回だけお祝いして、既読にする
  useEffect(() => {
    if (preview || celebrated.current || fresh.length === 0) return;
    celebrated.current = true;
    celebrate(fresh.length === 1 ? say.thanksReceived(nameOf(fresh[0].from)) : say.thanksReceivedMany(fresh.length));
    setSeen(sid, Math.max(...fresh.map((t) => t.createdAt)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fresh.length]);

  const sentIds = new Set([...thanks.filter((t) => t.from === sid && t.date === today).map((t) => t.to), ...sentTo]);
  const ideas: ThanksSuggestion[] = suggestThanks(tasks, members, thanks, sid, today).filter((s) => !sentTo.includes(s.to));
  const others = members.filter((m) => m.sid !== sid);
  const received = thanks.filter((t) => t.to === sid).slice(0, 4);
  // 新着や、伝えるきっかけがあるときだけ、開いておく。それ以外は閉じておく (開閉は、この端末に覚える)
  const [pref, setPref] = useState<boolean | null>(() => { try { const v = localStorage.getItem('thanks-open'); return v === null ? null : v === '1'; } catch { return null; } });
  const open = pref ?? (fresh.length > 0 || ideas.length > 0);
  useEffect(() => { if (pref !== null) { try { localStorage.setItem('thanks-open', pref ? '1' : '0'); } catch { /* 保存できなくても動く */ } } }, [pref]);

  const send = async (to: string, note: string) => {
    if (left <= 0) return;
    setErr(''); setTarget(null); setSentTo((x) => [...x, to]);
    try { await sendThanks(teamId, sid, to, note); celebrate(say.thanksSent(nameOf(to))); }
    catch (e) { setSentTo((x) => x.filter((y) => y !== to)); setErr(`送れませんでした: ${(e as Error).message}`); }
  };
  const stamps = (to: string) => (
    <div className="stamps" role="group" aria-label={`${nameOf(to)}さんに送るスタンプ`}>
      {toneStamps().map((s) => <button key={s.label} type="button" className="stamp" disabled={left <= 0} onClick={() => send(to, stampNote(s))}>{s.emoji && <span aria-hidden="true">{s.emoji}</span>}{s.label}</button>)}
    </div>
  );

  return (
    <details className="card thanks-card fold" open={open} onToggle={(e) => { const v = (e.currentTarget as HTMLDetailsElement).open; if (v !== open) setPref(v); }}>
      <summary>
        <h3><Em e="🙏" />ありがとう <span className="mission-count">{left > 0 ? `今日あと${left}回` : `今日は${THANKS_PER_DAY}回送りました`}</span>{fresh.length > 0 && <span className="badge new">NEW</span>}</h3>
      </summary>

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
      <p className="hint">スタンプ1つで送れます。言葉を添えたいときは、下の「チームのようす」からどうぞ。</p>
    </details>
  );
}

