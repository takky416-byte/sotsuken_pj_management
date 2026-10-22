import type { ClassDay } from '../types';
import { dayKey } from './dates';

export type DailyKind = 'task' | 'study' | 'discuss' | 'other';
export type DailyEntry = { kind: DailyKind; taskId?: string; note: string };

export type Daily = {
  id: string;
  sid: string;
  date: string;
  dayKey: number;
  entries: DailyEntry[];
  blocker: string;
  absent: boolean;
  submittedAt?: number;
  updatedAt?: number;
};

export const FIXED_KINDS: { kind: Exclude<DailyKind, 'task'>; label: string }[] = [
  { kind: 'study', label: '調査・勉強' },
  { kind: 'discuss', label: 'チームで相談' },
  { kind: 'other', label: 'その他' },
];

export const dailyId = (date: string, sid: string) => `${date}_${sid}`;

export type DayStatus = 'submitted' | 'absent' | 'missing';

/** 提出の成立: エントリが1つ以上ある、または困っていることが書かれている。欠席は教員だけが付ける。 */
export function statusOf(d: Daily | undefined): DayStatus {
  if (!d) return 'missing';
  if (d.absent) return 'absent';
  return d.entries.length > 0 || d.blocker.trim() !== '' ? 'submitted' : 'missing';
}

/** Firestore に書き込む形。firestore.rules の validDaily と対応している。 */
export function dailyDoc(
  p: { sid: string; date: string; entries: DailyEntry[]; blocker: string; absent: boolean },
  prev: Pick<Daily, 'submittedAt'> | undefined,
  now = Date.now(),
) {
  return {
    sid: p.sid, date: p.date, dayKey: dayKey(p.date),
    entries: p.entries.map((e) => (e.taskId ? { kind: e.kind, taskId: e.taskId, note: e.note } : { kind: e.kind, note: e.note })),
    blocker: p.blocker, absent: p.absent,
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
