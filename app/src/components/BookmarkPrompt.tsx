import { useEffect, useState } from 'react';
import { downloadBlob } from '../data/export';
import { shortcutFor } from '../lib/shortcut';
import { Em } from './Em';
import { EMPTY_STATE, HOW_TO, KEY, MAX_SNOOZES, load, platformOf, shouldShow, snooze, type BookmarkState } from '../lib/bookmark';
import { addDays, jstDate } from '../lib/dates';
import { useNarrow } from '../lib/useNarrow';

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> };

const read = (email: string): BookmarkState => { try { return load(localStorage.getItem(KEY(email))); } catch { return EMPTY_STATE; } };
const write = (email: string, s: BookmarkState) => { try { localStorage.setItem(KEY(email), JSON.stringify(s)); } catch { /* 保存できなくても動く */ } };

/** ホームの「お気に入りに追加しよう」。追加したら二度と出ない。「あとで」は3日あいだを空けて、3回まで。 */
export function BookmarkPrompt({ email }: { email: string }) {
  const [state, setState] = useState(() => read(email));
  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState(false);
  const [install, setInstall] = useState<InstallEvent | null>(null);
  const narrow = useNarrow();
  const [expanded, setExpanded] = useState(false);
  // Chrome・Edge などは、「ホーム画面に追加(インストール)」を、ボタンから動かせる
  useEffect(() => {
    const on = (e: Event) => { e.preventDefault(); setInstall(e as InstallEvent); };
    window.addEventListener('beforeinstallprompt', on);
    return () => window.removeEventListener('beforeinstallprompt', on);
  }, []);
  const today = jstDate();
  if (!shouldShow(state, today)) return null;
  const how = HOW_TO[platformOf(navigator.userAgent)];
  const url = window.location.origin + '/';
  const update = (s: BookmarkState) => { write(email, s); setState(s); };
  const platform = platformOf(navigator.userAgent);
  const canShare = (platform === 'ios' || platform === 'android') && typeof navigator.share === 'function';
  const doInstall = async () => {
    if (!install) return;
    await install.prompt();
    const r = await install.userChoice;
    setInstall(null);
    if (r.outcome === 'accepted') update({ ...state, done: true });
  };
  // iPhone・Androidは、共有メニューを開く (「お気に入りに追加」「ホーム画面に追加」を選べる)
  const share = () => { navigator.share({ title: '卒研PJ管理', url }).catch(() => undefined); };
  // パソコン: デスクトップに置くためのショートカットのファイルを、ダウンロードさせる
  const file = shortcutFor(platform, url);
  const saveShortcut = () => { if (!file) return; downloadBlob(file.filename, new Blob([file.content], { type: file.mime })); setSaved(true); };
  const copy = () => { navigator.clipboard?.writeText(url).then(() => setCopied(true), () => undefined); };

  return (
    <section className="card bookmark" aria-label="お気に入りに追加">
      <div className="bookmark-bar">
        <div className="bookmark-main">
          <strong><Em e="⭐" />このアプリを、お気に入りに追加してください</strong>
          <details>
            <summary>{how.title} での追加のしかた</summary>
            <ol>{how.steps.map((s) => <li key={s}>{s}</li>)}</ol>
            <p className="hint">URL: <code>{url}</code>(「あとで」は3日後にまた出ます)</p>
          </details>
        </div>
        {narrow && !expanded ? (
          <span className="bookmark-act">
            <button type="button" onClick={() => setExpanded(true)}>追加する</button>
            <button type="button" onClick={() => update({ ...state, done: true })}>追加しました</button>
            {state.snoozes < MAX_SNOOZES && <button type="button" className="ghost" onClick={() => update(snooze(state, today, addDays))}>あとで</button>}
          </span>
        ) : (
        <span className="bookmark-act">
          {install && <button type="button" onClick={doInstall}>ホーム画面に追加</button>}
          {!install && canShare && <button type="button" onClick={share}>追加のメニューを開く</button>}
          {file && <button type="button" onClick={saveShortcut}>デスクトップ用ショートカットを保存</button>}
          <button type="button" className="ghost" onClick={copy}>{copied ? 'コピーしました' : 'URLをコピー'}</button>
          <button type="button" onClick={() => update({ ...state, done: true })}>追加しました</button>
          {state.snoozes < MAX_SNOOZES && <button type="button" className="ghost" onClick={() => update(snooze(state, today, addDays))}>あとで</button>}
        </span>
        )}
      </div>
      {saved && <p className="hint" role="status">ダウンロードしたファイル「{file?.filename}」を、<strong>デスクトップにドラッグ</strong>して置いてください。ブラウザに「危険なファイル」と出たときは、このアプリのURLだけが入った小さなファイルなので、「保持」を選んでかまいません。</p>}
    </section>
  );
}
