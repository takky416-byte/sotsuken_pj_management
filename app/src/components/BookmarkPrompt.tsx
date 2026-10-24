import { useState } from 'react';
import { EMPTY_STATE, HOW_TO, KEY, MAX_SNOOZES, load, platformOf, shouldShow, snooze, type BookmarkState } from '../lib/bookmark';
import { addDays, jstDate } from '../lib/dates';

const read = (email: string): BookmarkState => { try { return load(localStorage.getItem(KEY(email))); } catch { return EMPTY_STATE; } };
const write = (email: string, s: BookmarkState) => { try { localStorage.setItem(KEY(email), JSON.stringify(s)); } catch { /* 保存できなくても動く */ } };

/** ホームの「お気に入りに追加しよう」。追加したら二度と出ない。「あとで」は3日あいだを空けて、3回まで。 */
export function BookmarkPrompt({ email }: { email: string }) {
  const [state, setState] = useState(() => read(email));
  const [copied, setCopied] = useState(false);
  const today = jstDate();
  if (!shouldShow(state, today)) return null;
  const how = HOW_TO[platformOf(navigator.userAgent)];
  const url = window.location.origin + '/';
  const update = (s: BookmarkState) => { write(email, s); setState(s); };
  const copy = () => { navigator.clipboard?.writeText(url).then(() => setCopied(true), () => undefined); };

  return (
    <section className="card bookmark" aria-label="お気に入りに追加">
      <h3>⭐ このアプリを、お気に入りに追加しよう</h3>
      <p className="hint">毎日開くアプリです。お気に入り(ブックマーク)に入れておくと、すぐ開けます。</p>
      <div className="bookmark-url">
        <code>{url}</code>
        <button type="button" className="ghost" onClick={copy}>{copied ? 'コピーしました' : 'URLをコピー'}</button>
      </div>
      <details open>
        <summary>{how.title} での追加のしかた</summary>
        <ol>{how.steps.map((s) => <li key={s}>{s}</li>)}</ol>
      </details>
      <div className="row">
        <button type="button" onClick={() => update({ ...state, done: true })}>追加した</button>
        {state.snoozes < MAX_SNOOZES && <button type="button" className="ghost" onClick={() => update(snooze(state, today, addDays))}>あとで(3日後にまた出します)</button>}
      </div>
    </section>
  );
}
