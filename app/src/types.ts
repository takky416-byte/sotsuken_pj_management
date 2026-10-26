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
  /** user: 手で追加、draft: 叩き台、adhoc: 作業ログで「WBSにない作業」として追加 */
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
  /** 教員からチームへの短いメッセージ (学生のホームに出る)。なければ未設定 */
  message?: { text: string; at: number } | null;
  /** 成果物を提出する Google ドライブのフォルダ (教員が設定) */
  submitUrl?: string;
  /** 初期WBS (叩き台) の見直しを、チームの誰かが「終えた」と記録した時刻と人。なければ未確認 (学生も書ける) */
  wbsReview?: { at: number; by: string } | null;
  /** 企業に提出する報告書に載せる、チームの文章 (チームの学生と教員が書く) */
  reportNotes?: ReportNotes | null;
};

/** 各文章の記入日時 (summaryAt など) は、その文章を書き換えたときだけ更新する。at は最後に保存した時刻 */
export type ReportNotes = {
  summary: string; issues: string; next: string; by: string; at: number;
  summaryAt?: number; issuesAt?: number; nextAt?: number;
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
