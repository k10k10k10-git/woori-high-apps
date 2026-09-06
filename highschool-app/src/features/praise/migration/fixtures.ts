import { SOURCE_TABLE_KEYS, type SourceTables } from "./transform";

/** 실제 운영 기록과 관계없는 회귀 테스트 전용 원본 스키마 fixture. */
export const sourceId = (number: number) => `00000000-0000-4000-8000-${String(number).padStart(12, "0")}`;
export const fixtureTime = "2026-09-05T00:00:00.000Z";
export const fixtureOptions = { termId: sourceId(1), workspaceId: "migration-test", sourceAsOf: fixtureTime, checksum: "a".repeat(64), lateAsPresent: true };
export function sourceFixture(): SourceTables {
  const tables = Object.fromEntries(Object.keys(SOURCE_TABLE_KEYS).map((table) => [table, []])) as SourceTables;
  const time = { created_at: fixtureTime, updated_at: fixtureTime };
  tables.terms = [{ id: sourceId(1), name: "검증용 학기", start_date: "2026-09-01", end_date: "2026-12-31", status: "ACTIVE", late_counts_as_present: false, timezone: "Asia/Seoul", created_by: sourceId(4), ...time }];
  tables.students = [{ id: sourceId(2), name: "검증 학생", note: "PRIVATE_SENTINEL", ...time }];
  tables.staff = [{ id: sourceId(3), name: "검증 스탭", email: "PRIVATE_SENTINEL", gender: "FEMALE", active: true, singer_capable: true, group_leader_capable: true, preferred_service: "BOTH", default_stage_role: "SINGER", exclude_from_auto_singer: false, is_default_stage_leader: true, note: "PRIVATE_SENTINEL", ...time }];
  tables.profiles = [{ id: sourceId(4), staff_id: sourceId(3), email: "PRIVATE_SENTINEL", role: "ADMIN", status: "ACTIVE", ...time }];
  tables.term_students = [{ id: sourceId(5), term_id: sourceId(1), student_id: sourceId(2), grade: 2, gender: "MALE", service_department: "SECOND", team: "SINGER", is_student_leader: false, active: true, note: "PRIVATE_SENTINEL", ...time }];
  tables.meetings = [{ id: sourceId(6), term_id: sourceId(1), sequence: 1, meeting_date: "2026-09-05", title: "검증 모임", kind: "REGULAR", is_cancelled: false, ...time }];
  tables.stage_plans = [{ id: sourceId(7), term_id: sourceId(1), meeting_id: sourceId(6), sunday_date: "2026-09-13", ...time }];
  const settings = { groupCount: 1, studentMin: 0, studentMax: 10, staffMin: 0, staffMax: 3, clusterGender: false, clusterGrade: false, splitTeam: false };
  tables.grouping_versions = [{ id: sourceId(8), term_id: sourceId(1), version_no: 1, kind: "CONFIRMED", settings_snapshot: settings, rules_snapshot: [], warnings: ["PRIVATE_SENTINEL"], ignored_warnings: ["PRIVATE_SENTINEL"], seed: 1, source_version_id: null, revision: 1, created_by: sourceId(4), confirmed_by: sourceId(4), confirmed_at: fixtureTime, ...time }];
  tables.groups = [{ id: sourceId(9), version_id: sourceId(8), name: "검증 조", sort_order: 0, student_min: 0, student_max: 10, staff_min: 0, staff_max: 3 }];
  tables.group_student_members = [{ version_id: sourceId(8), group_id: sourceId(9), term_student_id: sourceId(5), assigned_by: sourceId(4), ...time }];
  tables.group_staff_members = [{ version_id: sourceId(8), group_id: sourceId(9), staff_id: sourceId(3), assigned_by: sourceId(4), ...time }];
  tables.attendance = [{ id: sourceId(10), meeting_id: sourceId(6), term_student_id: sourceId(5), status: "LATE", note: "PRIVATE_SENTINEL", updated_by: sourceId(4), ...time }];
  tables.stage_staff_availability = [{ id: sourceId(11), plan_id: sourceId(7), staff_id: sourceId(3), present: false, stage_role: "SINGER", updated_by: sourceId(4), ...time }];
  tables.stage_versions = [{ id: sourceId(12), plan_id: sourceId(7), version_no: 1, kind: "CONFIRMED", leader_type: "STAFF", leader_staff_id: sourceId(3), leader_term_student_id: null, config_snapshot: { staffOnly: false, studentRatio: .75, minimumFemaleSingers: 3 }, warnings: ["PRIVATE_SENTINEL"], ignored_warnings: [], source_version_id: null, revision: 1, created_by: sourceId(4), confirmed_by: sourceId(4), confirmed_at: fixtureTime, ...time }];
  tables.stage_services = [{ id: sourceId(13), version_id: sourceId(12), department: "FIRST", singer_target: 6, choir_target: 6 }, { id: sourceId(14), version_id: sourceId(12), department: "SECOND", singer_target: 6, choir_target: 0 }];
  tables.stage_candidates = [{ id: sourceId(15), version_id: sourceId(12), person_type: "STUDENT", term_student_id: sourceId(5), staff_id: null, department: "SECOND", eligible: true, reason: "PRIVATE_SENTINEL" }];
  tables.stage_overrides = [{ id: sourceId(16), version_id: sourceId(12), term_student_id: sourceId(5), kind: "FORCE_STAGE", department: "SECOND", role: "SINGER" }];
  tables.stage_assignments = [{ id: sourceId(17), service_id: sourceId(14), person_type: "STUDENT", term_student_id: sourceId(5), staff_id: null, role: "SINGER", side: "LEFT", position_order: 0, reason: "PRIVATE_SENTINEL", is_manual: true }];
  tables.audit_events = [{ id: sourceId(18), actor_user_id: sourceId(4), action: "PRIVATE_SENTINEL", entity_type: "attendance", entity_id: sourceId(10), before_json: { note: "PRIVATE_SENTINEL" }, after_json: { status: "LATE" }, created_at: fixtureTime }];
  tables.import_batches = [{ id: sourceId(19), term_id: sourceId(1), kind: "STUDENTS", file_name: "PRIVATE_SENTINEL", object_path: "test/roster.csv", status: "COMPLETED", row_count: 1, mapping: { note: "PRIVATE_SENTINEL" }, errors: [], created_by: sourceId(4), created_at: fixtureTime }];
  return tables;
}
