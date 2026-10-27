import type { ClassDay } from '../types';
import { dayKey } from './dates';

export type DailyKind = 'task' | 'study' | 'discuss' | 'other';
/** その日の取り組みの結果: 進んだ / 完了した / 詰まった */
export type DailyResult = 'progress' | 'done' | 'stuck';
export const RESULT_LABEL: Record<DailyResult, string> = { progress: '進んだ', done: '完了した', stuck: '詰まった' };

export type DailyEntry = { kind: DailyKind; taskId?: string; note: string; result?: DailyResult };

export type Daily = {
  id: string;
  sid: string;
  date: string;
  dayKey: number;
  entries: DailyEntry[];
  blocker: string;
  /** 次にやること (次の授業日までに何をやるか) */
  next?: string;
  absent: boolean;
  submittedAt?: number;
  updatedAt?: number;
};

export const FIXED_KINDS: { kind: Exclude<DailyKind, 'task'>; label: string }[] = [
  { kind: 'study', label: '調査・勉強' },
  { kind: 'discuss', label: 'チームで相談' },
  { kind: 'other', label: 'その他' },
];

/** 作業ログの運用を始める日 (設定で変えられる)。これより前の授業日は、未提出の判定などの対象にしない。 */
export const DEFAULT_DAILY_START = '2026-10-28';

export const fromDailyStart = (days: ClassDay[], start: string): ClassDay[] => days.filter((d) => d.date >= start);

export const dailyId = (date: string, sid: string) => `${date}_${sid}`;

export type DayStatus = 'submitted' | 'absent' | 'missing';

/** 選んだ項目の一言は必須。一言のない項目は、提出に数えない。 */
export const hasNote = (e: DailyEntry) => e.note.trim() !== '';

/**
 * 作業ログの記述の最低文字数。「やった」だけで済ませず、何をどこまでやったかを書かせるための目安 (文字数は空白を除く)。
 * 提出の判定 (statusOf) は、これまでの作業ログとの互換のため、一言があれば成立とする。新しく提出するときの画面だけが、この長さを求める。
 */
export const MIN_NOTE_CHARS = 10;
export const MIN_NEXT_CHARS = 10;
export const charCount = (s: string) => s.replace(/\s/g, '').length;

export type DailyProblem = { key: string; message: string };

/**
 * 新しく提出する作業ログの検査。問題がなければ空の配列。
 * - 取り組みが1つ以上ある
 * - 各項目の説明が MIN_NOTE_CHARS 字以上 (何を・どこまで)
 * - 次にやることが MIN_NEXT_CHARS 字以上
 */
export function validateDaily(
  entries: DailyEntry[], next: string, titleOf: (e: DailyEntry) => string = () => '',
): DailyProblem[] {
  const out: DailyProblem[] = [];
  if (entries.length === 0) out.push({ key: 'entries', message: '前回の作業ログのあとにやったタスクを、1つ以上選んでください(間違って外したときは、「ほかのタスクを選ぶ」から選び直せます)' });
  entries.forEach((e, i) => {
    const n = charCount(e.note);
    if (n < MIN_NOTE_CHARS) out.push({ key: `note:${i}`, message: `${titleOf(e) || '取り組み'}の説明を、もう少し具体的に書いてください(何を、どこまでやったか)` });
  });
  const n = charCount(next);
  if (n < MIN_NEXT_CHARS) out.push({ key: 'next', message: `「次にやること」を、もう少し具体的に書いてください(いつまでに、何をやるか)` });
  return out;
}

/** 一言が未入力の項目 (画面で「一言を書いてください」と示す)。 */
export const entriesMissingNote = (entries: DailyEntry[]): DailyEntry[] => entries.filter((e) => !hasNote(e));

/**
 * 提出の成立: 一言のある項目が1つ以上ある、または困っていることが書かれている。
 * チェックだけの項目は数えない。欠席は教員だけが付ける。
 */
export function statusOf(d: Daily | undefined): DayStatus {
  if (!d) return 'missing';
  if (d.absent) return 'absent';
  return d.entries.some(hasNote) || d.blocker.trim() !== '' ? 'submitted' : 'missing';
}

/** Firestore に書き込む形。firestore.rules の validDaily と対応している。 */
export function dailyDoc(
  p: { sid: string; date: string; entries: DailyEntry[]; blocker: string; absent: boolean; next?: string },
  prev: Pick<Daily, 'submittedAt'> | undefined,
  now = Date.now(),
) {
  return {
    sid: p.sid, date: p.date, dayKey: dayKey(p.date),
    entries: p.entries.map((e) => ({
      kind: e.kind, ...(e.taskId ? { taskId: e.taskId } : {}), note: e.note, ...(e.result ? { result: e.result } : {}),
    })),
    blocker: p.blocker, next: p.next ?? '', absent: p.absent,
    submittedAt: prev?.submittedAt ?? now, updatedAt: now,
  };
}

/** 授業日のうち、from 以上 before 未満 (before は含まない) の日付を昇順で返す。 */
export function classDatesBetween(days: ClassDay[], from: string, before: string): string[] {
  return days.map((d) => d.date).filter((d) => d >= from && d < before).sort();
}

/**
 * 直近から遡って、未提出が何日続いているか。欠席の日は数えず、途切れさせもしない。
 * dates は対象の授業日 (昇順)。
 */
export function consecutiveMisses(statusByDate: ReadonlyMap<string, DayStatus>, dates: string[]): number {
  let n = 0;
  for (const date of [...dates].reverse()) {
    const s = statusByDate.get(date) ?? 'missing';
    if (s === 'absent') continue;
    if (s === 'submitted') break;
    n++;
  }
  return n;
}
