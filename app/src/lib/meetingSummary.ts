// ミーティングの要旨 (録音から作った下書きを、先生が直して、学生に公開する)。画面にも Firestore にも依存しない処理。

/** 学生に公開する要旨。teams/{チーム}/meetingSummaries/{日付} */
export type MeetingSummary = {
  id: string; // 日付 (YYYY-MM-DD)
  date: string;
  /** 全体の要旨 (3〜5行) */
  summary: string;
  /** 決まったこと */
  decided: string[];
  /** 次の1週間でやること */
  actions: string[];
  /** 詰まり・懸念 */
  concerns: string[];
  publishedAt: number;
};

/** 先生だけが見られる下書き。teams/{チーム}/meetingDrafts/{日付}。録音から Apps Script が作る。先生が自分で書くこともできる。 */
export type MeetingDraft = {
  id: string;
  date: string;
  summary: string;
  decided: string[];
  actions: string[];
  concerns: string[];
  /** AI が聞き取れなかった・自信がなかった点 (先生が確かめる。学生には出ない) */
  unclear: string[];
  /** 'recording': 録音から自動 / 'manual': 先生が書いた */
  source: 'recording' | 'manual';
  /** 録音のファイル名 (先生の確認用。学生には出ない) */
  file?: string;
  createdAt: number;
  updatedAt: number;
};

export const LIMITS = { summary: 1200, item: 200, items: 12 } as const;

/** 1行1項目のテキストを、項目の配列に (空行・前後の空白・先頭の「・」「- 」を除く)。 */
export function linesToList(text: string): string[] {
  return text.split(/\r?\n/).map((l) => l.replace(/^\s*(?:[-・●*]\s*)/, '').trim()).filter(Boolean).slice(0, LIMITS.items).map((l) => l.slice(0, LIMITS.item));
}

export const listToLines = (list: readonly string[] | undefined): string => (list ?? []).join('\n');

/** 公開する形にする。要旨が空なら null (公開できない)。 */
export function toSummary(date: string, d: { summary: string; decided: string[]; actions: string[]; concerns: string[] }, now = Date.now()): Omit<MeetingSummary, 'id'> | null {
  const summary = d.summary.trim().slice(0, LIMITS.summary);
  if (!summary) return null;
  const clean = (l: string[]) => l.map((x) => x.trim()).filter(Boolean).slice(0, LIMITS.items).map((x) => x.slice(0, LIMITS.item));
  return { date, summary, decided: clean(d.decided), actions: clean(d.actions), concerns: clean(d.concerns), publishedAt: now };
}

/** 学生のホームに出す、いちばん新しい要旨と、それ以前の要旨 (新しい順)。 */
export function splitLatest<T extends { date: string }>(list: T[]): { latest: T | null; older: T[] } {
  const sorted = [...list].sort((a, b) => b.date.localeCompare(a.date));
  return { latest: sorted[0] ?? null, older: sorted.slice(1) };
}
