export const RENAMES: Record<string, string>;
export function renameMilestones(opts: {
  db: import('firebase-admin/firestore').Firestore;
  dryRun?: boolean;
  renames?: Record<string, string>;
  log?: (message: string) => void;
}): Promise<{ milestones: number; classDays: number }>;
