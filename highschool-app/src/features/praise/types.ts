import type { MinistryRoles } from "@/features/portal/accessPolicy";
import type { GroupingRule, GroupingSettings } from "./domain/grouping";
import type {
  StageAssignment,
  StageOverride,
  StagePerformanceRole,
  StagePersonType,
} from "./domain/stage";
import type { PraiseMeetingGuide } from "./content/types";

export type PraiseActor = { uid: string; name?: string; roles: MinistryRoles };
export type PraiseRole = "manager" | "editor" | "groupStaff" | "member";
export type PraiseGender = "FEMALE" | "MALE" | "UNSPECIFIED";
export type PraiseDepartment = "FIRST" | "SECOND";
export type PraiseStatus = "PRESENT" | "ABSENT";
export interface PraiseStamp {
  revision: number;
  updatedAt: number;
  updatedBy: string;
}
export interface PraiseMeta extends PraiseStamp {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  semesterId?: string;
  teamId?: string;
  status: "active" | "archived";
  mode: "setup" | "shadow" | "live";
  sourceAsOf?: string;
  importBlockers?: string[];
  activeGroupVersionId?: string;
}
export interface PraiseRosterLink {
  personId?: string;
  year?: string;
  classKey?: string;
  studentId?: string;
  staffId?: string;
  applicationKey?: string;
}
export interface PraisePerson extends PraiseStamp {
  id: string;
  kind: StagePersonType;
  name: string;
  grade: number;
  gender: PraiseGender;
  department: PraiseDepartment;
  team: "SINGER" | "SESSION";
  active: boolean;
  isStudentLeader: boolean;
  singerCapable: boolean;
  groupStaffCapable: boolean;
  preferredService: PraiseDepartment | "BOTH";
  excludeFromAutoSinger: boolean;
  sourceId?: string;
  rosterLink?: PraiseRosterLink;
}
export interface PraiseMeeting extends PraiseStamp {
  id: string;
  date: string;
  worshipDate: string;
  sequence: number;
  title: string;
  cancelled: boolean;
  temporary: boolean;
  linkedSessionId?: string;
  groupVersionId?: string;
}
export interface PraiseGroup {
  id: string;
  name: string;
  studentIds: string[];
  staffIds: string[];
}
export type PraiseVersionKind = "AUTO_DRAFT" | "MANUAL_DRAFT" | "CONFIRMED";
export interface PraiseGroupVersion {
  id: string;
  number: number;
  kind: PraiseVersionKind;
  sourceVersionId?: string;
  createdAt: number;
  createdBy: string;
  seed: number;
  settings: GroupingSettings;
  rules: GroupingRule[];
  groups: PraiseGroup[];
  warnings: string[];
  acknowledgedWarnings: boolean;
}
export interface PraiseAttendance extends PraiseStamp {
  status: PraiseStatus | null;
  groupVersionId: string;
  originalStatus?: "LATE";
  importedActorId?: string;
  importedAt?: string;
}
/** API 전용 원장 출처. 원본 신청키와 Firebase 경로는 응답하지 않는다. */
export interface PraiseAttendanceSource {
  source: "semester" | "praise";
  mapping: "linked" | "unlinked" | "shadow" | "invalid";
  writable: boolean;
  revision?: string;
  originalStatus?: "출석" | "지각" | "결석";
}
export type PraiseAttendanceSources = Record<string, Record<string, PraiseAttendanceSource>>;
/** 서버 전용. 공통 원장 시도 이전에 영수증을 확보하여 지연 재시도의 덮어쓰기를 막는다. */
export interface PraiseSharedAttendanceOperation {
  phase: "prepared" | "attempting" | "complete" | "failed" | "closed";
  meetingId: string;
  personId: string;
  semesterId: string;
  sessionId: string;
  applicationKey: string;
  groupVersionId: string;
  expectedSourceRevision: string;
  mappingProof?: string;
  teamId?: string;
  studentId?: string;
  meetingDate?: string;
  status: PraiseStatus | null;
  beforeStatus: PraiseStatus | null;
}
export interface PraiseSharedAttendanceResolution {
  phase: "prepared" | "verified" | "complete" | "superseded";
  pendingOperationId: string;
  resolution: "finalize" | "close";
  expectedSourceRevision: string;
  originalFingerprint: string;
}
export interface PraisePendingAttendanceReview {
  operationId: string;
  meetingId: string;
  personId: string;
  requestedAt: number;
  status: PraiseStatus | null;
  phase: "prepared" | "attempting";
  currentStatus: PraiseStatus | null;
  sourceRevision: string;
  canFinalize: boolean;
}
export interface PraiseStaffAvailability extends PraiseStamp {
  present: boolean | null;
  role: "SINGER" | "SESSION";
}
export interface PraiseStageConfig {
  leaderType: StagePersonType;
  leaderId: string;
  staffOnly: boolean;
  first: { singerTarget: number; choirTarget: number };
  second: { singerTarget: number; choirTarget: number };
  studentRatio: number;
  minimumFemaleSingers: number;
}
export interface PraiseStageService {
  department: PraiseDepartment;
  assignments: StageAssignment[];
}
export interface PraiseStageCandidate {
  personId: string;
  eligible: boolean;
  reason: string;
}
export interface PraiseStageVersion {
  id: string;
  meetingId: string;
  number: number;
  kind: PraiseVersionKind;
  sourceVersionId?: string;
  createdAt: number;
  createdBy: string;
  inputRevision: string;
  worshipDate: string;
  config: PraiseStageConfig;
  leaderName: string;
  services: PraiseStageService[];
  overrides: StageOverride[];
  candidates: PraiseStageCandidate[];
  warnings: string[];
  acknowledgedWarnings: boolean;
  imported?: boolean;
  nameSnapshotAsOf?: string;
}
export interface PraiseAccess extends PraiseStamp {
  uid: string;
  staffId: string;
  role: PraiseRole;
  active: boolean;
}
export interface PraiseGuide extends PraiseStamp {
  meetingId: string;
  published: boolean;
  content: PraiseMeetingGuide;
}
export interface PraisePolicy extends PraiseStamp {
  grouping: GroupingSettings;
  rules: GroupingRule[];
  stage: Omit<PraiseStageConfig, "leaderType" | "leaderId" | "staffOnly">;
}
export interface PraiseAuditEvent {
  id: string;
  at: number;
  actor: { uid: string; name?: string };
  action: string;
  label: string;
  targetId?: string;
  changes: Array<{ field: string; before?: string; after?: string }>;
  projectedAt?: number;
  historical?: boolean;
  sourceActorId?: string;
}
export interface PraiseImportBatch {
  id: string;
  at: number;
  by: string;
  source: string;
  checksum: string;
  counts: Record<string, number>;
  sourceAsOf?: string;
}
export interface PraiseState {
  schemaVersion: 1;
  meta: PraiseMeta;
  people: Record<string, PraisePerson>;
  meetings: Record<string, PraiseMeeting>;
  groupVersions: Record<string, PraiseGroupVersion>;
  attendance: Record<string, Record<string, PraiseAttendance>>;
  availability: Record<string, Record<string, PraiseStaffAvailability>>;
  stageVersions: Record<string, PraiseStageVersion>;
  access: Record<string, PraiseAccess>;
  guides: Record<string, PraiseGuide>;
  policy: PraisePolicy;
  audit: Record<string, PraiseAuditEvent>;
  operations: Record<
    string,
    { at: number; actorUid: string; fingerprint: string; sharedAttendance?: PraiseSharedAttendanceOperation; sharedAttendanceResolution?: PraiseSharedAttendanceResolution }
  >;
  imports: Record<string, PraiseImportBatch>;
}
export interface PraisePermissions {
  read: boolean;
  manage: boolean;
  stageEdit: boolean;
  attendanceAll: boolean;
  staffId: string | null;
  role: PraiseRole | "observer";
}
/** API 응답은 권한별 최소 데이터만 포함한다. 저장 원장을 그대로 반환하지 않는다. */
export interface PraiseView {
  meta: PraiseMeta;
  permissions: PraisePermissions;
  people: PraisePerson[];
  meetings: PraiseMeeting[];
  groups: PraiseGroupVersion[];
  attendance: PraiseState["attendance"];
  attendanceSources?: PraiseAttendanceSources;
  pendingAttendance?: PraisePendingAttendanceReview[];
  availability: PraiseState["availability"];
  stages: PraiseStageVersion[];
  access: PraiseAccess[];
  guides: PraiseGuide[];
  policy: PraisePolicy | null;
  audit: PraiseAuditEvent[];
  imports: PraiseImportBatch[];
  inputRevisions: Record<string, string>;
}
export type PraisePersonInput = Omit<PraisePerson, keyof PraiseStamp>;
export type PraiseMeetingInput = Omit<PraiseMeeting, keyof PraiseStamp>;
export type PraiseGroupInput = Pick<
  PraiseGroupVersion,
  "settings" | "rules" | "groups" | "seed"
>;
export type PraiseStageInput = Pick<
  PraiseStageVersion,
  "config" | "services" | "overrides"
>;
export type PraiseCommand =
  | { type: "attendance.resolve"; pendingOperationId: string; resolution: "finalize" | "close"; expectedSourceRevision: string; acknowledge: true }
  | {
      type: "meta.save";
      expectedRevision: number;
      meta: Pick<
        PraiseMeta,
        "name" | "startDate" | "endDate" | "status" | "mode"
      > &
        Partial<Pick<PraiseMeta, "semesterId" | "teamId">>;
    }
  | { type: "person.save"; expectedRevision: number; person: PraisePersonInput }
  | {
      type: "meeting.save";
      expectedRevision: number;
      meeting: PraiseMeetingInput;
    }
  | {
      type: "groups.generate";
      expectedRevision: number;
      settings: GroupingSettings;
      rules: GroupingRule[];
      seed: number;
    }
  | {
      type: "groups.save" | "groups.confirm";
      expectedRevision: number;
      sourceVersionId: string;
      draft: PraiseGroupInput;
      acknowledgeWarnings: boolean;
    }
  | {
      type: "attendance.set";
      expectedSourceRevision?: string;
      meetingId: string;
      personId: string;
      status: PraiseStatus | null;
      expectedRevision: number;
    }
  | {
      type: "availability.set";
      meetingId: string;
      personId: string;
      present: boolean | null;
      role: "SINGER" | "SESSION";
      expectedRevision: number;
    }
  | {
      type: "stage.generate";
      meetingId: string;
      inputRevision: string;
      config: PraiseStageConfig;
      overrides: StageOverride[];
    }
  | {
      type: "stage.save" | "stage.confirm";
      meetingId: string;
      sourceVersionId: string;
      inputRevision: string;
      draft: PraiseStageInput;
      acknowledgeWarnings: boolean;
    }
  | {
      type: "policy.save";
      expectedRevision: number;
      policy: Omit<PraisePolicy, keyof PraiseStamp>;
    }
  | {
      type: "access.save";
      expectedRevision: number;
      access: Omit<PraiseAccess, keyof PraiseStamp>;
    }
  | {
      type: "guide.save";
      expectedRevision: number;
      guide: Omit<PraiseGuide, keyof PraiseStamp>;
    }
  | {
      type: "people.import";
      people: PraisePersonInput[];
      checksum: string;
      source: string;
    };
export interface PraiseCommandRequest {
  operationId: string;
  command: PraiseCommand;
}
export interface PraiseCreateRequest {
  operationId: string;
  workspace: Pick<PraiseMeta, "id" | "name" | "startDate" | "endDate"> &
    Partial<Pick<PraiseMeta, "semesterId" | "teamId">>;
}
export type PraiseRoleOption = { value: PraiseRole; label: string };
export const PRAISE_ROLE_OPTIONS: PraiseRoleOption[] = [
  { value: "manager", label: "운영 책임자" },
  { value: "editor", label: "등단 편성 담당" },
  { value: "groupStaff", label: "조 담당 스탭" },
  { value: "member", label: "일반 스탭" },
];
export const PRAISE_ROLE_LABELS = Object.fromEntries(
  PRAISE_ROLE_OPTIONS.map(({ value, label }) => [value, label]),
) as Record<PraiseRole, string>;
export type PraiseEditableStageRole = StagePerformanceRole;
