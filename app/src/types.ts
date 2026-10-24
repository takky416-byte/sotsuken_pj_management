export type TaskStatus = 'todo' | 'doing' | 'done' | 'hold';

export type TaskLink = { url: string; label: string };

export type Task = {
  id: string;
  title: string;
  detail: string;
  parentId: string | null;
  depth: 1 | 2 | 3;
  order: number;
  status: TaskStatus;
  assignees: string[];
  startDate: string | null;
  endDate: string | null;
  links: TaskLink[];
  /** user: 手で追加、draft: 叩き台、adhoc: 作業レポートで「WBSにない作業」として追加 */
  source: 'user' | 'draft' | 'adhoc';
  createdBy: string;
  updatedBy: string;
  createdAt: number;
  updatedAt: number;
  deleted: boolean;
  deletedAt: number | null;
};

export type Member = { sid: string; name: string };

export type Team = {
  id: string;
  members: Member[];
  status: 'planning' | 'active';
  projectName: string;
  proposals: { no: number; title: string; adopted: boolean }[];
  driveUrl: string;
  kickoffAt: number | null;
  teamMeetingInput: boolean;
};

export type Milestone = {
  id: string;
  title: string;
  date: string;
  endDate?: string | null;
  teamId: string | null;
  note?: string;
};

export type ClassDay = { date: string; periods: '3-4' | '1-2'; meeting: boolean; note: string };

export const STATUS_LABEL: Record<TaskStatus, string> = {
  todo: '未着手', doing: '進行中', done: '完了', hold: '保留',
};
export const TEAM_IDS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'] as const;
