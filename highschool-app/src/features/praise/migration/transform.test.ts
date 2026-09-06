import { describe, expect, it } from "vitest";
import { transformSupabaseSnapshot, validateSourceTables } from "./transform";
import { fixtureOptions, fixtureTime, sourceFixture, sourceId } from "./fixtures";

describe("원본 찬양팀 데이터 이관", () => {
  it("원본을 변경하지 않고 같은 UUID·옵션으로 동일 shadow 원장을 만든다", () => {
    const source = sourceFixture(); const before = structuredClone(source);
    const first = transformSupabaseSnapshot(source, fixtureOptions); const second = transformSupabaseSnapshot(source, fixtureOptions);
    expect(first).toEqual(second); expect(source).toEqual(before); expect(first.state.meta.mode).toBe("shadow");
    expect(first.report.targetCounts).toMatchObject({ people: 2, meetings: 1, groupVersions: 1, attendance: 1, stageVersions: 1, stageAssignments: 1, historicalAudit: 1, access: 0 });
  });
  it("개인 메모·이메일·원본 감사·사유/경고 원문은 앱 원장에 포함하지 않는다", () => {
    const source = sourceFixture(); const result = transformSupabaseSnapshot(source, fixtureOptions);
    expect(JSON.stringify(source)).toContain("PRIVATE_SENTINEL"); expect(JSON.stringify(result)).not.toContain("PRIVATE_SENTINEL");
    const event = Object.values(result.state.audit)[0]; expect(event.historical).toBe(true); expect(event.actor.uid).toBe(`supabase:${sourceId(4)}`); expect(event.changes).toEqual([]);
  });
  it("LATE를 바꿀 때 명시 옵션이 필요하고 원래 상태/수정자/시각을 남긴다", () => {
    expect(() => transformSupabaseSnapshot(sourceFixture(), { ...fixtureOptions, lateAsPresent: false })).toThrow("late_as_present_approval_required");
    const result = transformSupabaseSnapshot(sourceFixture(), fixtureOptions); const row = Object.values(Object.values(result.state.attendance)[0])[0];
    expect(row).toMatchObject({ status: "PRESENT", originalStatus: "LATE", importedActorId: sourceId(4), updatedBy: `supabase:${sourceId(4)}`, updatedAt: Date.parse(fixtureTime) });
    expect(result.report.lateConverted).toBe(1);
  });
  it("출석 없는 셀을 생성하지 않으며 스탭 false를 명시 결석으로 보존한다", () => {
    const source = sourceFixture(); source.attendance = [];
    const result = transformSupabaseSnapshot(source, { ...fixtureOptions, lateAsPresent: false });
    expect(result.state.attendance).toEqual({}); expect(Object.values(Object.values(result.state.availability)[0])[0].present).toBe(false);
  });
  it("원본 예배일을 +1로 재계산하지 않고 이름에는 내보내기 시각을 표시한다", () => {
    const result = transformSupabaseSnapshot(sourceFixture(), fixtureOptions);
    expect(Object.values(result.state.meetings)[0].worshipDate).toBe("2026-09-13");
    const stage = Object.values(result.state.stageVersions)[0]; expect(stage.worshipDate).toBe("2026-09-13"); expect(stage.nameSnapshotAsOf).toBe(fixtureTime); expect(stage.imported).toBe(true);
  });
  it("stage plan이 없는 회차의 예배일을 추정하지 않는다", () => {
    const source = sourceFixture(); const meeting = { ...source.meetings[0], id: sourceId(20), sequence: 2, meeting_date: "2026-09-12" }; source.meetings.push(meeting);
    expect(() => transformSupabaseSnapshot(source, fixtureOptions)).toThrow("meeting_worship_date_mapping_required");
    const result = transformSupabaseSnapshot(source, { ...fixtureOptions, map: { worshipDates: { [sourceId(20)]: "2026-09-13" } } });
    expect(Object.keys(result.state.meetings)).toHaveLength(2);
  });
  it("출석의 역사적 조 버전이 없으면 live 차단 표식을 남긴다", () => {
    const result = transformSupabaseSnapshot(sourceFixture(), fixtureOptions);
    expect(result.state.meta.importBlockers).toContain("historical_group_unresolved");
    expect(Object.values(Object.values(result.state.attendance)[0])[0].groupVersionId).toBe("import-unresolved");
    const mapped = transformSupabaseSnapshot(sourceFixture(), { ...fixtureOptions, map: { meetingGroupVersions: { [sourceId(6)]: sourceId(8) } } });
    expect(mapped.state.meta.importBlockers).toBeUndefined();
    expect(Object.values(Object.values(mapped.state.attendance)[0])[0].groupVersionId).toBe(`groupver_${sourceId(8)}`);
  });
  it("역사적 조가 확인돼도 공통 회차는 출석 원장 전환이 완료될 때까지 차단한다", () => {
    const result = transformSupabaseSnapshot(sourceFixture(), { ...fixtureOptions, map: {
      semesterId: "2026-2", teamId: "praise", meetingSessionIds: { [sourceId(6)]: "existing-session" }, meetingGroupVersions: { [sourceId(6)]: sourceId(8) },
    } });
    expect(result.state.meta.importBlockers).toEqual(["shared_attendance_cutover_pending"]);
    expect(result.state.meetings[`meeting_${sourceId(6)}`].linkedSessionId).toBe("existing-session");
    expect(result.state.meta.mode).toBe("shadow");
    expect(result.report.liveReviewRequired.some((reason) => reason.includes("단일 출석 원천"))).toBe(true);
    const unresolved = transformSupabaseSnapshot(sourceFixture(), { ...fixtureOptions, map: { meetingSessionIds: { [sourceId(6)]: "existing-session" } } });
    expect(unresolved.state.meta.importBlockers).toEqual(["historical_group_unresolved", "shared_attendance_cutover_pending"]);
  });
  it("이름이 같아도 자동 계정/학생 연결을 하지 않는다", () => {
    const source = sourceFixture(); source.staff[0].name = source.students[0].name;
    const result = transformSupabaseSnapshot(source, fixtureOptions);
    expect(Object.keys(result.state.people)).toHaveLength(2); expect(result.state.access).toEqual({});
    expect(Object.values(result.state.people).every((person) => person.rosterLink === undefined)).toBe(true);
  });
  it("명시된 UUID 매핑만 학생 원장 참조와 Firebase 접근 계정으로 반영한다", () => {
    const result = transformSupabaseSnapshot(sourceFixture(), { ...fixtureOptions, map: { semesterId: "2026-2", teamId: "praise", people: { [sourceId(5)]: { studentId: "student-existing", classKey: "2-2-1" } }, profiles: { [sourceId(4)]: { uid: "firebase-test-uid", staffId: sourceId(3), role: "groupStaff" } } } });
    expect(result.state.people[`student_${sourceId(5)}`].rosterLink).toEqual({ studentId: "student-existing", classKey: "2-2-1" });
    expect(result.state.access["firebase-test-uid"]).toMatchObject({ role: "groupStaff", staffId: `staff_${sourceId(3)}` });
    expect(result.state.access[sourceId(4)]).toBeUndefined();
  });
  it("정지 프로필·불일치 스탭 매핑은 권한을 부여하지 않는다", () => {
    const source = sourceFixture(); source.profiles[0].status = "DISABLED";
    expect(() => transformSupabaseSnapshot(source, { ...fixtureOptions, map: { profiles: { [sourceId(4)]: { uid: "firebase-test", staffId: sourceId(3), role: "manager" } } } })).toThrow("mapping_profile_not_active");
  });
  it("완전한 테이블 집합이 없으면 빈 테이블로 간주하지 않는다", () => {
    const source = sourceFixture(); delete source.stage_candidates;
    expect(() => validateSourceTables(source)).toThrow("missing_table_stage_candidates");
  });
  it("중복 행·중복 출석·존재하지 않는 참조를 거절한다", () => {
    const duplicate = sourceFixture(); duplicate.students.push({ ...duplicate.students[0] });
    expect(() => validateSourceTables(duplicate)).toThrow("duplicate_students");
    const duplicateAttendance = sourceFixture(); duplicateAttendance.attendance.push({ ...duplicateAttendance.attendance[0], id: sourceId(21) });
    expect(() => validateSourceTables(duplicateAttendance)).toThrow("duplicate_relation_attendance");
    const missing = sourceFixture(); missing.attendance[0].term_student_id = sourceId(99);
    expect(() => validateSourceTables(missing)).toThrow("missing_ref_attendance_term_student_id");
  });
  it("학기를 가로지르는 출석과 버전/조 연결을 거절한다", () => {
    const source = sourceFixture(); source.terms.push({ ...source.terms[0], id: sourceId(30) }); source.meetings[0].term_id = sourceId(30); source.stage_plans[0].term_id = sourceId(30);
    expect(() => validateSourceTables(source)).toThrow("cross_term_attendance");
    const wrongVersion = sourceFixture(); wrongVersion.grouping_versions.push({ ...wrongVersion.grouping_versions[0], id: sourceId(31), version_no: 2 }); wrongVersion.group_student_members[0].version_id = sourceId(31);
    expect(() => validateSourceTables(wrongVersion)).toThrow("cross_version_group_member");
  });
  it("양쪽 인원 FK가 함께 있는 등단 기록과 누락된 예배부를 거절한다", () => {
    const source = sourceFixture(); source.stage_assignments[0].staff_id = sourceId(3);
    expect(() => validateSourceTables(source)).toThrow("student_reference_shape");
    const service = sourceFixture(); service.stage_services = service.stage_services.filter((row) => row.department === "SECOND");
    expect(() => transformSupabaseSnapshot(service, fixtureOptions)).toThrow("stage_services_incomplete");
  });
  it("참조 ID/잘못된 날짜 오류에 입력값을 노출하지 않는다", () => {
    const source = sourceFixture(); source.students[0].id = "PRIVATE_SENTINEL";
    expect(() => validateSourceTables(source)).toThrow("students_key_uuid");
    const dates = sourceFixture(); dates.meetings[0].meeting_date = "2026-02-30";
    expect(() => transformSupabaseSnapshot(dates, fixtureOptions)).toThrow("date_invalid");
    expect(() => transformSupabaseSnapshot(sourceFixture(), { ...fixtureOptions, workspaceId: "../attendance" })).toThrow("target_id_invalid");
  });
});
