import type { Firestore } from 'firebase-admin/firestore';

export const DUMMY_NOTE: string;
export const DEFAULT_DAILY_START: string;
export function jstToday(now?: number): string;
export function pastClassDays(today: string): { date: string; periods: '1-2' | '3-4'; meeting: boolean; note: string }[];
type Doc = { id: string; data: Record<string, unknown> };
export function buildPilot(input: {
  teamId: string;
  members: { sid: string; name: string }[];
  today: string;
  existingTasks?: { id: string; title: string; parentId: string | null; depth: number; order: number; deleted?: boolean }[];
  existingClassDays?: { date: string }[];
  projectName?: string;
}): {
  start: string;
  days: { date: string; periods: string; meeting: boolean; note: string }[];
  tasks: Doc[]; dailies: Doc[]; meetings: Doc[]; comments: Doc[]; thanks: Doc[];
  team: Record<string, unknown>;
  newClassDays: { date: string }[];
};
export function applyPilot(opts: { db: Firestore; teamId: string; dryRun?: boolean; now?: number; log?: (m: string) => void }): Promise<unknown>;
