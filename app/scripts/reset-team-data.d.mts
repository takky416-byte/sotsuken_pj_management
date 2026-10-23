import type { Firestore } from 'firebase-admin/firestore';

export function parseTeams(text: string): string[];
export function resetTeams(opts: {
  db: Firestore;
  teams: string[];
  resetTeam?: boolean;
  includeTeacherNotes?: boolean;
  restoreCalendar?: boolean;
  dryRun?: boolean;
  log?: (msg: string) => void;
}): Promise<Record<string, Record<string, number>>>;
