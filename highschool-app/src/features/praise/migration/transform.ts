import type { PraiseAccess, PraiseRosterLink, PraiseState, PraiseStamp, PraiseStageConfig } from "../types";
import type { GroupingRule, GroupingSettings } from "../domain/grouping";

export const SOURCE_TABLE_KEYS: Record<string, string[]> = {
  staff: ["id"], admin_allowlist: ["email"], profiles: ["id"], access_requests: ["id"], audit_events: ["id"],
  terms: ["id"], students: ["id"], term_students: ["id"], meetings: ["id"], import_batches: ["id"],
  grouping_rules: ["id"], grouping_rule_members: ["rule_id", "term_student_id"], grouping_versions: ["id"], groups: ["id"],
  group_student_members: ["version_id", "term_student_id"], group_staff_members: ["version_id", "staff_id"],
  attendance: ["id"], stage_plans: ["id"], stage_staff_availability: ["id"], stage_versions: ["id"],
  stage_services: ["id"], stage_candidates: ["id"], stage_overrides: ["id"], stage_assignments: ["id"],
};
type Row = Record<string, unknown>;
export type SourceTables = Record<string, Row[]>;
export interface MigrationMap {
  semesterId?: string; teamId?: string;
  people?: Record<string, PraiseRosterLink>;
  profiles?: Record<string, { uid: string; staffId: string; role: PraiseAccess["role"] }>;
  meetingSessionIds?: Record<string, string>;
  meetingGroupVersions?: Record<string, string>;
  worshipDates?: Record<string, string>;
}
export interface MigrationOptions {
  termId: string; workspaceId: string; sourceAsOf: string; checksum: string;
  lateAsPresent?: boolean; map?: MigrationMap;
}
export interface MigrationReport {
  schemaVersion: 1; sourceCounts: Record<string, number>; targetCounts: Record<string, number>;
  lateConverted: number; historicalNamesAsOf: string;
  archiveOnly: string[]; liveReviewRequired: string[];
}

export class MigrationError extends Error {
  code: string;
  constructor(code: string) { super(`이관 검증 실패: ${code}`); this.name = "MigrationError"; this.code = code; }
}
function fail(code: string): never { throw new MigrationError(code); }
function obj(value: unknown, label = "object"): Row {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(`${label}_shape`);
  return value as Row;
}
function text(value: unknown, label: string, max = 500): string {
  if (typeof value !== "string" || !value.trim() || value.length > max || /[\u0000-\u001f\u007f]/.test(value)) fail(`${label}_text`);
  return value;
}
function uuid(value: unknown, label = "source_id"): string {
  const result = text(value, label, 36);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(result)) fail(`${label}_uuid`);
  return result.toLowerCase();
}
function targetId(value: unknown): string {
  const result = text(value, "target_id", 128);
  if (!/^[A-Za-z0-9_-]+$/.test(result) || ["__proto__", "constructor", "prototype"].includes(result)) fail("target_id_invalid");
  return result;
}
const id = (value: unknown, prefix = "src") => `${prefix}_${uuid(value)}`;
function integer(value: unknown, label: string, min = 0, max = Number.MAX_SAFE_INTEGER): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < min || value > max) fail(`${label}_number`);
  return value;
}
function bool(value: unknown, label: string): boolean { if (typeof value !== "boolean") fail(`${label}_boolean`); return value; }
function choice<T extends string>(value: unknown, choices: readonly T[], label: string): T {
  if (typeof value !== "string" || !choices.includes(value as T)) fail(`${label}_choice`); return value as T;
}
function date(value: unknown): string {
  const result = text(value, "date", 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(result) || !Number.isFinite(Date.parse(result)) || new Date(result).toISOString().slice(0, 10) !== result) fail("date_invalid");
  return result;
}
function instant(value: unknown): number {
  const result = Date.parse(text(value, "timestamp", 80)); if (!Number.isFinite(result)) fail("timestamp_invalid"); return result;
}
function lines(value: unknown): string[] {
  if (!Array.isArray(value)) fail("warnings_shape"); return value.map((item) => text(item, "warning", 2000));
}
function historicalWarnings(value: unknown): string[] {
  return lines(value).map((_, index) => `원본 경고 ${index + 1}: 상세는 보안 보관본에서 확인`);
}
const sourceActor = (value: unknown) => value === null || value === undefined ? "supabase:unknown" : `supabase:${uuid(value, "actor")}`;
const stamp = (row: Row): PraiseStamp => ({ revision: row.revision === undefined ? 1 : integer(row.revision, "revision", 1), updatedAt: instant(row.updated_at ?? row.created_at), updatedBy: sourceActor(row.updated_by ?? row.created_by) });

/** 원본 UUID와 FK를 먼저 검사한다. 오류에는 이름·연락처·원문 값이 들어가지 않는다. */
export function validateSourceTables(input: unknown): SourceTables {
  const source = obj(input, "tables"); const tables: SourceTables = {};
  for (const [table, keys] of Object.entries(SOURCE_TABLE_KEYS)) {
    const raw = source[table]; if (!Array.isArray(raw)) fail(`missing_table_${table}`);
    const rows = raw.map((row) => obj(row, table)); const seen = new Set<string>();
    for (const row of rows) {
      const key = keys.map((key) => key === "email" ? text(row[key], "allowlist_key") : uuid(row[key], `${table}_key`)).join("|");
      if (seen.has(key)) fail(`duplicate_${table}`); seen.add(key);
    }
    tables[table] = rows;
  }
  const indexes = Object.fromEntries(Object.entries(tables).map(([table, rows]) => [table, new Map(rows.filter((row) => row.id).map((row) => [uuid(row.id), row]))]));
  const foreign = (table: string, field: string, target: string, optional = false) => {
    for (const row of tables[table]) {
      if (optional && (row[field] === null || row[field] === undefined)) continue;
      if (!indexes[target].has(uuid(row[field], `${table}_${field}`))) fail(`missing_ref_${table}_${field}`);
    }
  };
  for (const [table, field, target, optional] of [
    ["profiles", "staff_id", "staff", true], ["access_requests", "user_id", "profiles"], ["access_requests", "reviewed_by", "profiles", true],
    ["audit_events", "actor_user_id", "profiles", true], ["terms", "created_by", "profiles", true],
    ["term_students", "term_id", "terms"], ["term_students", "student_id", "students"], ["meetings", "term_id", "terms"],
    ["import_batches", "term_id", "terms", true], ["import_batches", "created_by", "profiles", true],
    ["grouping_rules", "term_id", "terms"], ["grouping_rules", "created_by", "profiles", true],
    ["grouping_rule_members", "rule_id", "grouping_rules"], ["grouping_rule_members", "term_student_id", "term_students"],
    ["grouping_versions", "term_id", "terms"], ["grouping_versions", "source_version_id", "grouping_versions", true],
    ["grouping_versions", "created_by", "profiles", true], ["grouping_versions", "confirmed_by", "profiles", true], ["groups", "version_id", "grouping_versions"],
    ["group_student_members", "version_id", "grouping_versions"], ["group_student_members", "group_id", "groups"], ["group_student_members", "term_student_id", "term_students"],
    ["group_staff_members", "version_id", "grouping_versions"], ["group_staff_members", "group_id", "groups"], ["group_staff_members", "staff_id", "staff"],
    ["attendance", "meeting_id", "meetings"], ["attendance", "term_student_id", "term_students"], ["attendance", "updated_by", "profiles", true],
    ["stage_plans", "term_id", "terms"], ["stage_plans", "meeting_id", "meetings"],
    ["stage_staff_availability", "plan_id", "stage_plans"], ["stage_staff_availability", "staff_id", "staff"], ["stage_staff_availability", "updated_by", "profiles", true],
    ["stage_versions", "plan_id", "stage_plans"], ["stage_versions", "source_version_id", "stage_versions", true],
    ["stage_versions", "leader_term_student_id", "term_students", true], ["stage_versions", "leader_staff_id", "staff", true],
    ["stage_versions", "created_by", "profiles", true], ["stage_versions", "confirmed_by", "profiles", true], ["stage_services", "version_id", "stage_versions"],
    ["stage_candidates", "version_id", "stage_versions"], ["stage_candidates", "term_student_id", "term_students", true], ["stage_candidates", "staff_id", "staff", true],
    ["stage_overrides", "version_id", "stage_versions"], ["stage_overrides", "term_student_id", "term_students"],
    ["stage_assignments", "service_id", "stage_services"], ["stage_assignments", "term_student_id", "term_students", true], ["stage_assignments", "staff_id", "staff", true],
  ] as Array<[string, string, string, boolean?]>) foreign(table, field, target, optional);
  const get = (table: string, value: unknown) => indexes[table].get(uuid(value))!;
  const equal = (a: unknown, b: unknown, code: string) => { if (a !== b) fail(code); };
  const unique = (table: string, fields: string[]) => {
    const values = new Set<string>(); for (const row of tables[table]) { const key = JSON.stringify(fields.map((field) => row[field])); if (values.has(key)) fail(`duplicate_relation_${table}`); values.add(key); }
  };
  for (const [table, fields] of Object.entries({ term_students: ["term_id", "student_id"], meetings: ["term_id", "sequence"], grouping_versions: ["term_id", "version_no"], groups: ["version_id", "sort_order"], attendance: ["meeting_id", "term_student_id"], stage_plans: ["meeting_id"], stage_staff_availability: ["plan_id", "staff_id"], stage_versions: ["plan_id", "version_no"], stage_services: ["version_id", "department"] })) unique(table, fields);
  unique("meetings", ["term_id", "meeting_date"]); unique("stage_plans", ["term_id", "sunday_date"]);
  unique("stage_assignments", ["service_id", "person_type", "term_student_id", "staff_id"]); unique("stage_assignments", ["service_id", "role", "side", "position_order"]);
  for (const row of tables.grouping_rule_members) equal(get("grouping_rules", row.rule_id).term_id, get("term_students", row.term_student_id).term_id, "cross_term_rule_member");
  for (const row of tables.group_student_members) {
    equal(get("groups", row.group_id).version_id, row.version_id, "cross_version_group_member");
    equal(get("grouping_versions", row.version_id).term_id, get("term_students", row.term_student_id).term_id, "cross_term_group_member");
  }
  for (const row of tables.group_staff_members) equal(get("groups", row.group_id).version_id, row.version_id, "cross_version_group_staff");
  for (const row of tables.attendance) equal(get("meetings", row.meeting_id).term_id, get("term_students", row.term_student_id).term_id, "cross_term_attendance");
  for (const row of tables.stage_plans) equal(row.term_id, get("meetings", row.meeting_id).term_id, "cross_term_stage_plan");
  for (const row of tables.grouping_versions) if (row.source_version_id) {
    const previous = get("grouping_versions", row.source_version_id); equal(row.term_id, previous.term_id, "cross_term_group_source");
    if (integer(previous.version_no, "source_version", 1) >= integer(row.version_no, "version", 1)) fail("group_version_source_order");
  }
  for (const row of tables.stage_versions) if (row.source_version_id) {
    const previous = get("stage_versions", row.source_version_id); equal(row.plan_id, previous.plan_id, "cross_plan_stage_source");
    if (integer(previous.version_no, "source_version", 1) >= integer(row.version_no, "version", 1)) fail("stage_version_source_order");
  }
  const personShape = (row: Row, typeField: string, studentField: string, staffField: string, term: unknown) => {
    const kind = choice(row[typeField], ["STUDENT", "STAFF"], "person_type");
    if (kind === "STUDENT") { if (!row[studentField] || row[staffField]) fail("student_reference_shape"); equal(get("term_students", row[studentField]).term_id, term, "cross_term_stage_person"); }
    else if (!row[staffField] || row[studentField]) fail("staff_reference_shape");
  };
  for (const row of tables.stage_versions) personShape(row, "leader_type", "leader_term_student_id", "leader_staff_id", get("stage_plans", row.plan_id).term_id);
  for (const row of tables.stage_candidates) personShape(row, "person_type", "term_student_id", "staff_id", get("stage_plans", get("stage_versions", row.version_id).plan_id).term_id);
  for (const row of tables.stage_assignments) personShape(row, "person_type", "term_student_id", "staff_id", get("stage_plans", get("stage_versions", get("stage_services", row.service_id).version_id).plan_id).term_id);
  for (const row of tables.stage_overrides) {
    equal(get("term_students", row.term_student_id).term_id, get("stage_plans", get("stage_versions", row.version_id).plan_id).term_id, "cross_term_stage_override");
    if ((row.kind === "FORCE_STAGE" && !row.role) || (row.kind !== "FORCE_STAGE" && row.role)) fail("stage_override_shape");
  }
  return tables;
}

function groupingSettings(value: unknown): GroupingSettings {
  const row = obj(value, "group_settings"); const result = {
    groupCount: integer(row.groupCount, "group_count", 1, 50), studentMin: integer(row.studentMin, "student_min", 0, 100), studentMax: integer(row.studentMax, "student_max", 1, 100),
    staffMin: integer(row.staffMin, "staff_min", 0, 20), staffMax: integer(row.staffMax, "staff_max", 0, 20),
    clusterGender: bool(row.clusterGender, "cluster_gender"), clusterGrade: bool(row.clusterGrade, "cluster_grade"), splitTeam: bool(row.splitTeam, "split_team"),
  };
  if (result.studentMin > result.studentMax || result.staffMin > result.staffMax) fail("group_capacity_order"); return result;
}

/** 이름 매칭·새 DB 쓰기 없이 지정한 한 원본 학기를 shadow 원장으로 변환한다. */
export function transformSupabaseSnapshot(input: unknown, options: MigrationOptions): { state: PraiseState; report: MigrationReport } {
  const tables = validateSourceTables(input); const termId = uuid(options.termId); const workspaceId = targetId(options.workspaceId);
  const asOf = new Date(instant(options.sourceAsOf)).toISOString(); const at = Date.parse(asOf);
  if (!/^[a-f0-9]{64}$/.test(options.checksum)) fail("checksum_invalid");
  const source = tables.terms.find((row) => row.id === termId); if (!source) fail("selected_term_missing");
  const mapping = options.map ?? {}; obj(mapping, "mapping");
  for (const key of Object.keys(mapping)) if (!["semesterId", "teamId", "people", "profiles", "meetingSessionIds", "meetingGroupVersions", "worshipDates"].includes(key)) fail("mapping_unknown_field");
  const current = (table: string) => tables[table].filter((row) => row.term_id === termId);
  const students = new Map(tables.students.map((row) => [row.id, row]));
  const members = current("term_students"); const memberIds = new Set(members.map((row) => row.id));
  const groupVersions = current("grouping_versions"); const groupVersionIds = new Set(groupVersions.map((row) => row.id));
  const meetings = current("meetings"); const meetingIds = new Set(meetings.map((row) => row.id));
  const plans = current("stage_plans"); const planIds = new Set(plans.map((row) => row.id));
  const stageVersions = tables.stage_versions.filter((row) => planIds.has(row.plan_id));
  const stageVersionIds = new Set(stageVersions.map((row) => row.id));
  const stageServices = tables.stage_services.filter((row) => stageVersionIds.has(row.version_id)); const stageServiceIds = new Set(stageServices.map((row) => row.id));
  const selectedAttendance = tables.attendance.filter((row) => meetingIds.has(row.meeting_id));
  const lateCount = selectedAttendance.filter((row) => row.status === "LATE").length;
  if (lateCount > 0 && options.lateAsPresent !== true) fail("late_as_present_approval_required");
  const report: MigrationReport = { schemaVersion: 1, sourceCounts: Object.fromEntries(Object.entries(tables).map(([key, rows]) => [key, rows.length])), targetCounts: {}, lateConverted: lateCount, historicalNamesAsOf: asOf,
    archiveOnly: ["개인 메모·이메일·접근 신청·허용목록 및 원본 감사 before/after", "원본 프로필·설정·확인자·revision·첨부 경로·후보 부서 등 변환 형식에 없는 모든 필드"],
    liveReviewRequired: ["원본 입력 동결 및 대조 영수증 확인", "학기·주일 연결과 미연결 인원 검토", "과거 이름은 원본 내보내기 시점의 이름이며 당시 이름 스냅샷이 아님", "명시 계정 연결과 권한 승인"] };
  const defaults = { groupCount: 4, studentMin: 2, studentMax: 10, staffMin: 1, staffMax: 3, clusterGender: false, clusterGrade: false, splitTeam: false };
  const defaultStage = { first: { singerTarget: 6, choirTarget: 6 }, second: { singerTarget: 6, choirTarget: 6 }, studentRatio: .75, minimumFemaleSingers: 3 };
  const state: PraiseState = { schemaVersion: 1, meta: { id: workspaceId, name: text(source.name, "term_name", 120), startDate: date(source.start_date), endDate: date(source.end_date), status: choice(source.status, ["DRAFT", "ACTIVE", "ARCHIVED"], "term_status") === "ARCHIVED" ? "archived" : "active", mode: "shadow", sourceAsOf: asOf, ...stamp(source),
    ...(mapping.semesterId ? { semesterId: targetId(mapping.semesterId) } : {}), ...(mapping.teamId ? { teamId: targetId(mapping.teamId) } : {}) },
    people: {}, meetings: {}, groupVersions: {}, attendance: {}, availability: {}, stageVersions: {}, access: {}, guides: {},
    policy: { grouping: defaults, rules: [], stage: defaultStage, revision: 1, updatedAt: at, updatedBy: "migration:archive" }, audit: {}, operations: {}, imports: {} };
  if (state.meta.startDate > state.meta.endDate) fail("term_date_order");
  const linkFor = (sourceId: string): PraiseRosterLink | undefined => {
    const link = mapping.people?.[sourceId]; if (!link) return undefined;
    const row = obj(link, "roster_link");
    if (Object.keys(row).some((key) => !["personId", "year", "classKey", "studentId", "staffId", "applicationKey"].includes(key))) fail("roster_link_unknown_field");
    return Object.fromEntries(Object.entries(row).map(([key, value]) => [key, targetId(value)]));
  };
  for (const member of members) {
    const student = students.get(member.student_id)!; const personId = id(member.id, "student"); const sourceId = uuid(member.id); const link = linkFor(sourceId);
    state.people[personId] = { id: personId, kind: "STUDENT", name: text(student.name, "student_name", 80), grade: integer(member.grade, "student_grade", 1, 3), gender: choice(member.gender, ["FEMALE", "MALE", "UNSPECIFIED"], "gender"), department: choice(member.service_department, ["FIRST", "SECOND"], "department"), team: choice(member.team, ["SINGER", "SESSION"], "team"),
      active: bool(member.active, "student_active"), isStudentLeader: bool(member.is_student_leader, "student_leader"), singerCapable: member.team === "SINGER", groupStaffCapable: false, preferredService: choice(member.service_department, ["FIRST", "SECOND"], "department"), excludeFromAutoSinger: false, sourceId, ...(link ? { rosterLink: link } : {}), ...stamp(member) };
  }
  // 원본 스탭은 학기 전용 테이블이 없다. 활성·비활성을 포함해 공통 스탭 원장을 보존한다.
  for (const staff of tables.staff) {
    const personId = id(staff.id, "staff"); const sourceId = uuid(staff.id); const link = linkFor(sourceId);
    const preference = choice(staff.preferred_service, ["FIRST", "SECOND", "BOTH"], "preferred_service");
    state.people[personId] = { id: personId, kind: "STAFF", name: text(staff.name, "staff_name", 80), grade: 0, gender: choice(staff.gender, ["FEMALE", "MALE", "UNSPECIFIED"], "gender"), department: preference === "SECOND" ? "SECOND" : "FIRST", team: choice(staff.default_stage_role, ["SINGER", "SESSION"], "staff_role"),
      active: bool(staff.active, "staff_active"), isStudentLeader: false, singerCapable: bool(staff.singer_capable, "singer_capable"), groupStaffCapable: bool(staff.group_leader_capable, "group_staff_capable"), preferredService: preference, excludeFromAutoSinger: bool(staff.exclude_from_auto_singer, "exclude_auto_singer"), sourceId, ...(link ? { rosterLink: link } : {}), ...stamp(staff) };
  }
  for (const sourceId of Object.keys(mapping.people ?? {})) if (!state.people[id(sourceId, "student")] && !state.people[id(sourceId, "staff")]) fail("mapping_person_missing");
  const parseRule = (row: Row, snapshot = false): GroupingRule => {
    const type = choice(row.type, ["TOGETHER", "APART", "TOP_SEED", "GENDER_MIN", "GRADE_MIN", "TEAM_MIN"], "rule_type");
    const rawMembers = snapshot ? row.memberIds : tables.grouping_rule_members.filter((member) => member.rule_id === row.id).map((member) => member.term_student_id);
    if (!Array.isArray(rawMembers)) fail("rule_members_shape");
    const memberKeys = rawMembers.map((value) => { if (!memberIds.has(uuid(value))) fail("rule_member_missing"); return id(value, "student"); });
    if (new Set(memberKeys).size !== memberKeys.length) fail("duplicate_rule_members");
    return { id: id(row.id, "rule"), type, memberIds: memberKeys, ...(type.endsWith("_MIN") ? { value: text(row.value, "rule_value", 30), minCount: integer(snapshot ? row.minCount : row.min_count, "rule_min", 1, 100) } : {}) };
  };
  state.policy.rules = current("grouping_rules").map((row) => parseRule(row));
  for (const version of groupVersions) {
    if (!Array.isArray(version.rules_snapshot)) fail("rules_snapshot_shape");
    const versionId = id(version.id, "groupver");
    const groups = tables.groups.filter((group) => group.version_id === version.id).sort((a, b) => integer(a.sort_order, "group_order") - integer(b.sort_order, "group_order"));
    state.groupVersions[versionId] = { id: versionId, number: integer(version.version_no, "group_version_number", 1), kind: choice(version.kind, ["AUTO_DRAFT", "MANUAL_DRAFT", "CONFIRMED"], "group_kind"), ...(version.source_version_id ? { sourceVersionId: id(version.source_version_id, "groupver") } : {}), createdAt: instant(version.created_at), createdBy: sourceActor(version.created_by), seed: version.seed === null ? 0 : integer(version.seed, "group_seed", -2147483648, 2147483647),
      settings: groupingSettings(version.settings_snapshot), rules: version.rules_snapshot.map((row) => parseRule(obj(row), true)), groups: groups.map((group) => ({ id: id(group.id, "group"), name: text(group.name, "group_name", 120), studentIds: tables.group_student_members.filter((member) => member.group_id === group.id).map((member) => id(member.term_student_id, "student")), staffIds: tables.group_staff_members.filter((member) => member.group_id === group.id).map((member) => id(member.staff_id, "staff")) })), warnings: historicalWarnings(version.warnings), acknowledgedWarnings: lines(version.ignored_warnings).length > 0 };
  }
  const latestGroup = Object.values(state.groupVersions).filter((version) => version.kind === "CONFIRMED").sort((a, b) => b.number - a.number)[0];
  if (latestGroup) { state.meta.activeGroupVersionId = latestGroup.id; state.policy.grouping = { ...latestGroup.settings }; }
  else if (groupVersions.length) state.policy.grouping = { ...Object.values(state.groupVersions).sort((a, b) => b.number - a.number)[0].settings };
  for (const meeting of meetings) {
    const key = id(meeting.id, "meeting"); const plan = plans.find((plan) => plan.meeting_id === meeting.id); const worship = mapping.worshipDates?.[uuid(meeting.id)] ?? plan?.sunday_date;
    if (!worship) fail("meeting_worship_date_mapping_required");
    const groupSource = mapping.meetingGroupVersions?.[uuid(meeting.id)];
    if (groupSource && !groupVersionIds.has(uuid(groupSource))) fail("meeting_group_mapping_missing");
    if (groupSource && groupVersions.find((version) => version.id === groupSource)?.kind !== "CONFIRMED") fail("meeting_group_mapping_not_confirmed");
    state.meetings[key] = { id: key, date: date(meeting.meeting_date), worshipDate: date(worship), sequence: integer(meeting.sequence, "meeting_sequence", 1), title: text(meeting.title, "meeting_title", 120), cancelled: bool(meeting.is_cancelled, "cancelled"), temporary: choice(meeting.kind, ["REGULAR", "EXTRA"], "meeting_kind") === "EXTRA", ...(groupSource ? { groupVersionId: id(groupSource, "groupver") } : {}), ...(mapping.meetingSessionIds?.[uuid(meeting.id)] ? { linkedSessionId: targetId(mapping.meetingSessionIds[uuid(meeting.id)]) } : {}), ...stamp(meeting) };
  }
  for (const mapName of ["meetingSessionIds", "meetingGroupVersions", "worshipDates"] as const) for (const key of Object.keys(mapping[mapName] ?? {})) if (!meetingIds.has(uuid(key))) fail("mapping_meeting_missing");
  let unresolvedGroups = 0;
  for (const row of selectedAttendance) {
    const meetingId = id(row.meeting_id, "meeting"); const status = choice(row.status, ["PRESENT", "LATE", "ABSENT"], "attendance_status");
    const groupVersionId = state.meetings[meetingId].groupVersionId ?? "import-unresolved";
    if (groupVersionId === "import-unresolved") unresolvedGroups++;
    (state.attendance[meetingId] ??= {})[id(row.term_student_id, "student")] = { status: status === "LATE" ? "PRESENT" : status, groupVersionId, ...(status === "LATE" ? { originalStatus: "LATE" } : {}), ...(row.updated_by ? { importedActorId: uuid(row.updated_by) } : {}), importedAt: asOf, ...stamp(row) };
  }
  if (unresolvedGroups) {
    report.liveReviewRequired.push(`원본에 역사적 조 버전이 없어 미연결로 보존한 출석 ${unresolvedGroups}건`);
    state.meta.importBlockers = ["historical_group_unresolved"];
  }
  if (Object.values(state.meetings).some((meeting) => meeting.linkedSessionId)) {
    // ID 참조만 연결한 상태다. 공통 출석 원천 선택·최신 읽기 어댑터가 완성될 때까지 입력을 열지 않는다.
    state.meta.importBlockers = [...(state.meta.importBlockers ?? []), "shared_attendance_cutover_pending"];
    report.liveReviewRequired.push("공통 회차는 참조만 연결됨: 원본 대조·단일 출석 원천 선택·등단 계산 읽기 어댑터 및 권한 검증 필요");
  }
  for (const row of tables.stage_staff_availability.filter((row) => planIds.has(row.plan_id))) {
    const plan = plans.find((plan) => plan.id === row.plan_id)!;
    (state.availability[id(plan.meeting_id, "meeting")] ??= {})[id(row.staff_id, "staff")] = { present: bool(row.present, "availability_present"), role: choice(row.stage_role, ["SINGER", "SESSION"], "availability_role"), ...stamp(row) };
  }
  const personKey = (row: Row) => row.person_type === "STUDENT" ? id(row.term_student_id, "student") : id(row.staff_id, "staff");
  for (const version of stageVersions) {
    const key = id(version.id, "stagever"); const plan = plans.find((plan) => plan.id === version.plan_id)!; const config = obj(version.config_snapshot, "stage_config");
    const leaderType = choice(version.leader_type, ["STUDENT", "STAFF"], "leader_type"); const leaderId = leaderType === "STUDENT" ? id(version.leader_term_student_id, "student") : id(version.leader_staff_id, "staff");
    const services = stageServices.filter((row) => row.version_id === version.id);
    if (services.length !== 2 || !services.some((row) => row.department === "FIRST") || !services.some((row) => row.department === "SECOND")) fail("stage_services_incomplete");
    const target = (department: string) => { const row = services.find((row) => row.department === department)!; return { singerTarget: integer(row.singer_target, "singer_target", 0, 50), choirTarget: integer(row.choir_target, "choir_target", 0, 100) }; };
    const stageConfig: PraiseStageConfig = { leaderType, leaderId, staffOnly: config.staffOnly === undefined ? false : bool(config.staffOnly, "staff_only"), first: target("FIRST"), second: target("SECOND"), studentRatio: config.studentRatio === undefined ? .75 : Number(config.studentRatio), minimumFemaleSingers: config.minimumFemaleSingers === undefined ? 3 : integer(config.minimumFemaleSingers, "minimum_female", 0, 50) };
    if (!Number.isFinite(stageConfig.studentRatio) || stageConfig.studentRatio < .7 || stageConfig.studentRatio > .8) fail("stage_student_ratio");
    state.stageVersions[key] = { id: key, meetingId: id(plan.meeting_id, "meeting"), number: integer(version.version_no, "stage_version_number", 1), kind: choice(version.kind, ["AUTO_DRAFT", "MANUAL_DRAFT", "CONFIRMED"], "stage_kind"), ...(version.source_version_id ? { sourceVersionId: id(version.source_version_id, "stagever") } : {}), createdAt: instant(version.created_at), createdBy: sourceActor(version.created_by), inputRevision: `import:${options.checksum.slice(0, 32)}`, worshipDate: state.meetings[id(plan.meeting_id, "meeting")].worshipDate, config: stageConfig, leaderName: state.people[leaderId].name,
      services: services.map((service) => ({ department: choice(service.department, ["FIRST", "SECOND"], "stage_department"), assignments: tables.stage_assignments.filter((row) => row.service_id === service.id).map((row) => { const personId = personKey(row); const person = state.people[personId]; if (!person) fail("stage_person_missing"); text(row.reason, "assignment_reason", 2000); return { personType: choice(row.person_type, ["STUDENT", "STAFF"], "assignment_type"), personId, name: person.name, gender: person.gender, role: choice(row.role, ["SINGER", "CHOIR"], "assignment_role"), side: choice(row.side, ["LEFT", "RIGHT"], "assignment_side"), positionOrder: integer(row.position_order, "stage_position"), reason: "원본 배정 사유는 보안 보관본에서 확인", isManual: bool(row.is_manual, "assignment_manual") }; }) })),
      overrides: tables.stage_overrides.filter((row) => row.version_id === version.id).map((row) => ({ termStudentId: id(row.term_student_id, "student"), kind: choice(row.kind, ["MOVE_DEPARTMENT", "FORCE_STAGE", "EXCLUDE_STAGE"] as const, "override_kind"), department: choice(row.department, ["FIRST", "SECOND"] as const, "override_department"), ...(row.role ? { role: choice(row.role, ["SINGER", "CHOIR", "RANDOM"] as const, "override_role") } : {}) })),
      candidates: tables.stage_candidates.filter((row) => row.version_id === version.id).map((row) => { text(row.reason, "candidate_reason", 2000); return { personId: personKey(row), eligible: bool(row.eligible, "candidate_eligible"), reason: "원본 후보 사유는 보안 보관본에서 확인" }; }), warnings: historicalWarnings(version.warnings), acknowledgedWarnings: lines(version.ignored_warnings).length > 0, imported: true, nameSnapshotAsOf: asOf };
  }
  const latestStage = Object.values(state.stageVersions).sort((a, b) => b.createdAt - a.createdAt)[0];
  if (latestStage) { const config = latestStage.config; state.policy.stage = { first: { ...config.first }, second: { ...config.second }, studentRatio: config.studentRatio, minimumFemaleSingers: config.minimumFemaleSingers }; }
  const usedUids = new Set<string>();
  for (const [profileId, value] of Object.entries(mapping.profiles ?? {})) {
    const entry = obj(value, "profile_mapping"); const profile = tables.profiles.find((row) => row.id === uuid(profileId));
    if (!profile || profile.status !== "ACTIVE") fail("mapping_profile_not_active");
    const staffId = id(entry.staffId, "staff"); if (!state.people[staffId] || (profile.staff_id && profile.staff_id !== entry.staffId)) fail("mapping_profile_staff_mismatch");
    const uid = targetId(entry.uid); if (usedUids.has(uid)) fail("mapping_duplicate_firebase_uid"); usedUids.add(uid);
    state.access[uid] = { uid, staffId, role: choice(entry.role, ["manager", "editor", "groupStaff", "member"], "mapped_role"), active: true, revision: 1, updatedAt: at, updatedBy: "migration:explicit-map" };
  }
  // 원본 원문은 archive에 남긴다. 현재 계정의 확인된 행위로 재해석하거나 글로벌 로그에 투영하지 않는다.
  const includedIds = new Set([source.id, ...members.map((row) => row.id), ...members.map((row) => row.student_id), ...tables.staff.map((row) => row.id), ...meetings.map((row) => row.id), ...groupVersions.map((row) => row.id), ...tables.groups.filter((row) => groupVersionIds.has(row.version_id)).map((row) => row.id), ...selectedAttendance.map((row) => row.id), ...plans.map((row) => row.id), ...stageVersions.map((row) => row.id), ...stageServices.map((row) => row.id), ...tables.stage_assignments.filter((row) => stageServiceIds.has(row.service_id)).map((row) => row.id)]);
  for (const row of tables.audit_events.filter((row) => row.entity_id && includedIds.has(row.entity_id))) {
    const key = id(row.id, "audit"); state.audit[key] = { id: key, at: instant(row.created_at), actor: { uid: sourceActor(row.actor_user_id) }, action: "historical.import", label: "외부 찬양팀 과거 기록 (원문은 보안 보관본)", changes: [], historical: true, ...(row.actor_user_id ? { sourceActorId: uuid(row.actor_user_id) } : {}) };
  }
  for (const row of tables.import_batches.filter((row) => row.term_id === termId || row.term_id === null)) {
    const key = id(row.id, "batch"); state.imports[key] = { id: key, at: instant(row.created_at), by: sourceActor(row.created_by), source: "supabase-v2-archive", checksum: options.checksum, counts: { rows: integer(row.row_count, "import_rows") }, sourceAsOf: asOf };
  }
  const batchId = `migration_${options.checksum.slice(0, 32)}`;
  state.imports[batchId] = { id: batchId, at, by: "migration:archive", source: "supabase-v2", checksum: options.checksum, counts: report.sourceCounts, sourceAsOf: asOf };
  state.operations[batchId] = { at, actorUid: "migration:archive", fingerprint: `${options.checksum}:${termId}:${workspaceId}` };
  report.targetCounts = { people: Object.keys(state.people).length, meetings: Object.keys(state.meetings).length, groupVersions: Object.keys(state.groupVersions).length, attendance: selectedAttendance.length, availability: Object.values(state.availability).reduce((sum, rows) => sum + Object.keys(rows).length, 0), stageVersions: Object.keys(state.stageVersions).length, stageAssignments: Object.values(state.stageVersions).reduce((sum, version) => sum + version.services.reduce((sum, service) => sum + service.assignments.length, 0), 0), access: Object.keys(state.access).length, historicalAudit: Object.keys(state.audit).length, importBatches: Object.keys(state.imports).length };
  return { state, report };
}
