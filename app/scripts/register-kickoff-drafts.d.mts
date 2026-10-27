import type { Firestore } from 'firebase-admin/firestore';

export type SampleDraft = { no: 1 | 2; title: string; outline: string };
export function sampleDrafts(read?: (file: string) => string): SampleDraft[];
export function registerDrafts(opts: {
  db: Firestore;
  teams: string[];
  drafts?: SampleDraft[];
  dryRun?: boolean;
  log?: (msg: string) => void;
}): Promise<Record<string, number[]>>;
