export const ACTIVITY_AREAS = {
  attendance: "출석",
  semester: "학기 사역",
  newFriends: "새친구",
  retreat: "수련회 행정",
  programs: "프로그램",
  field: "이가드 현장",
  accounts: "계정·권한",
  requests: "요청사항",
  schedule: "일정·준비",
} as const;

export type ActivityArea = keyof typeof ACTIVITY_AREAS;
export type ActivityAction = "create" | "update" | "delete";

export interface ActivityChange {
  field: string;
  before?: string | null;
  after?: string | null;
  redacted?: boolean;
}

/** 앱 저장 활동. Rules가 인증 UID·서버 시각을 검증하며, 직접 조작한 사람을 증명하지는 않는다. */
export interface ActivityLogRecord {
  id: string;
  schemaVersion: 1;
  occurredAt: number;
  recordedAt: number;
  actor: { kind: "user" | "system" | "unknown"; uid?: string; name?: string };
  area: ActivityArea;
  action: ActivityAction;
  target: { path: string; label: string; context?: string; href?: string };
  changes: ActivityChange[];
  changedCount: number;
}

export interface ActivityLogCursor { occurredAt: number; id: string }
export interface ActivityLogPage { records: ActivityLogRecord[]; nextCursor: ActivityLogCursor | null }
export interface ActivityLogRange { from: string; to: string }
export interface ActivityLogStatus { startedAt: number; lastRecordedAt: number }
