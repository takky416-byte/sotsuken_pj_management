// 入力の書きかけを、この端末 (ブラウザ) に残す。画面を移っても、再読み込みしても、閉じても消えない。
// キーは、ログインしている人ごとに分ける (共用のパソコンで、ほかの人の書きかけが出ないように)。ログアウトのときに消す。
const PREFIX = 'draft:v1:';

export const draftStorageKey = (email: string, key: string) => `${PREFIX}${email}:${key}`;

export type StoredDraft = { v: string; at: number };

export function readDraft(k: string): StoredDraft | null {
  try {
    const raw = localStorage.getItem(k);
    if (!raw) return null;
    const d = JSON.parse(raw) as StoredDraft;
    return typeof d?.v === 'string' ? d : null;
  } catch { return null; }
}

export function writeDraft(k: string, v: string) {
  try { localStorage.setItem(k, JSON.stringify({ v, at: Date.now() })); } catch { /* 保存できなくても、入力はできる */ }
}

export function removeDraft(k: string) {
  try { localStorage.removeItem(k); } catch { /* 何もしない */ }
}

/**
 * この人の、保存していない書きかけ (作業ログの下書きも含む) のキー。
 * 作業ログの下書きは、その日のうちしか出せないので、過ぎた日の分は、ここで消す (数に入れない)。
 */
export function draftKeysOf(email: string, sid: string | null, today: string): string[] {
  const out: string[] = [];
  const old: string[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k) continue;
      if (k.startsWith(`${PREFIX}${email}:`)) out.push(k);
      else if (sid && k.startsWith(`daily-draft:${sid}:`)) (k.endsWith(`:${today}`) ? out : old).push(k);
    }
  } catch { /* 読めなければ、なし */ }
  old.forEach(removeDraft);
  return out;
}
