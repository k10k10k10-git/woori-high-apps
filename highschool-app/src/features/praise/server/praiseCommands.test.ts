import { describe, expect, it } from "vitest";
import { defaultPraisePolicy } from "../defaults";
import { createFirstMeetingGuide } from "../content/templates";
import { canEditViewAttendance, canWritePraiseAttendance, praisePermissions } from "../permissions";
import type { PraiseActor, PraiseCommand, PraiseGroupInput, PraiseMeetingInput, PraisePerson, PraisePersonInput, PraiseStageConfig, PraiseStageInput, PraiseStageVersion, PraiseState } from "../types";
import type { StageAssignment } from "../domain/stage";
import { applyPraiseCommand, createPraiseState } from "./commands";
import { parseCommand, parseCreate } from "./parsers";
import { generatePraiseStage, stageHistory, stageInputRevision, validateManualStage } from "./stageModel";
import { praiseView } from "./view";

const manager: PraiseActor = { uid: "manager", name: "합성 관리자", roles: { semester: "superAdmin", retreat: "none" }, teamMemberships: {} };
const actor = (uid: string): PraiseActor => ({ uid, name: `합성 ${uid}`, roles: { semester: "praise", retreat: "none" }, teamMemberships: { praise: { role: "staff", active: true } } });
const staffActor = actor("group-staff"), editor = actor("editor"), member = actor("member"), observer = actor("observer");
const stamp = { revision: 1, updatedAt: 1000, updatedBy: manager.uid };

function person(id: string, kind: "STAFF" | "STUDENT", patch: Partial<PraisePerson> = {}): PraisePerson {
  return { ...stamp, id, kind, name: `합성 ${id}`, grade: kind === "STUDENT" ? 1 : 0, gender: "FEMALE", department: "FIRST", team: "SINGER", active: true, isStudentLeader: false, singerCapable: true, groupStaffCapable: true, preferredService: "BOTH", excludeFromAutoSinger: false, ...patch };
}
function fixture(): PraiseState {
  const students = Array.from({ length: 8 }, (_, index) => person(`student-${index + 1}`, "STUDENT", { department: index < 4 ? "FIRST" : "SECOND" }));
  const staff = Array.from({ length: 5 }, (_, index) => person(`staff-${index + 1}`, "STAFF"));
  const policy = defaultPraisePolicy(1000, manager.uid);
  policy.grouping = { ...policy.grouping, groupCount: 2, studentMin: 4, studentMax: 4, staffMin: 1, staffMax: 2 };
  return {
    schemaVersion: 1, meta: { ...stamp, id: "synthetic-term", name: "합성 학기", startDate: "2026-09-01", endDate: "2026-12-31", status: "active", mode: "live", activeGroupVersionId: "confirmed-group" },
    people: Object.fromEntries([...students, ...staff].map((item) => [item.id, item])),
    meetings: { meeting: { ...stamp, id: "meeting", title: "합성 모임", sequence: 1, date: "2026-09-05", worshipDate: "2026-09-06", cancelled: false, temporary: false } },
    groupVersions: { "confirmed-group": { id: "confirmed-group", number: 1, kind: "CONFIRMED", createdAt: 1000, createdBy: manager.uid, settings: structuredClone(policy.grouping), seed: 1, rules: [], warnings: [], acknowledgedWarnings: false, groups: [
      { id: "first-group", name: "합성 1조", studentIds: students.slice(0, 4).map((item) => item.id), staffIds: ["staff-2"] },
      { id: "second-group", name: "합성 2조", studentIds: students.slice(4).map((item) => item.id), staffIds: ["staff-3"] },
    ] } },
    attendance: { meeting: Object.fromEntries(students.map((item) => [item.id, { ...stamp, status: "PRESENT", groupVersionId: "confirmed-group" }])) },
    availability: { meeting: Object.fromEntries(staff.map((item) => [item.id, { ...stamp, present: true, role: "SINGER" }])) },
    access: {
      "group-staff": { ...stamp, uid: staffActor.uid, staffId: "staff-2", role: "groupStaff", active: true },
      editor: { ...stamp, uid: editor.uid, staffId: "staff-3", role: "editor", active: true },
      member: { ...stamp, uid: member.uid, staffId: "staff-4", role: "member", active: true },
    }, policy, stageVersions: {}, audit: {}, operations: {}, imports: {}, guides: {},
  };
}
function apply(state: PraiseState, command: PraiseCommand, who = manager, operationId = "synthetic-op") { return applyPraiseCommand(state, command, who, 2000, operationId); }
function stageConfig(patch: Partial<PraiseStageConfig> = {}): PraiseStageConfig {
  return { leaderType: "STAFF", leaderId: "staff-1", staffOnly: false, first: { singerTarget: 2, choirTarget: 1 }, second: { singerTarget: 2, choirTarget: 1 }, studentRatio: .75, minimumFemaleSingers: 1, ...patch };
}
function assignment(id: string, patch: Partial<StageAssignment> = {}): StageAssignment {
  return { personId: id, personType: id.startsWith("student") ? "STUDENT" : "STAFF", name: `합성 ${id}`, gender: "FEMALE", role: "SINGER", side: "LEFT", positionOrder: 0, reason: "합성 사유", isManual: false, ...patch };
}
function manual(config = stageConfig()): PraiseStageInput { return { config, overrides: [], services: [{ department: "FIRST", assignments: [assignment("student-1")] }, { department: "SECOND", assignments: [assignment("student-5")] }] }; }
function stageVersion(id: string, patch: Partial<PraiseStageVersion> = {}): PraiseStageVersion {
  return { id, meetingId: "past-meeting", number: 1, kind: "CONFIRMED", createdAt: 500, createdBy: "past-manager", inputRevision: "historical", worshipDate: "2026-08-30", config: stageConfig(), leaderName: "합성 과거 인도자", overrides: [], services: manual().services, candidates: [{ personId: "student-1", eligible: true, reason: "합성 후보" }, { personId: "student-2", eligible: true, reason: "합성 후보" }], warnings: [], acknowledgedWarnings: false, ...patch };
}
function groupDraft(state: PraiseState): PraiseGroupInput { const group = state.groupVersions["confirmed-group"]; return structuredClone({ settings: group.settings, rules: group.rules, seed: group.seed, groups: group.groups }); }
function meetingInput(state: PraiseState): PraiseMeetingInput { const { revision: _revision, updatedBy: _by, updatedAt: _at, ...value } = state.meetings.meeting; void _revision; void _by; void _at; return value; }
function personInput(value: PraisePerson): PraisePersonInput { const { revision: _revision, updatedBy: _by, updatedAt: _at, ...person } = value; void _revision; void _by; void _at; return person; }
function expectError(run: () => unknown, code: string, status: number) { expect(run).toThrowError(expect.objectContaining({ code, status })); }
const setAttendance = (personId = "student-1", status: "PRESENT" | "ABSENT" | null = "ABSENT", expectedRevision = 1): PraiseCommand => ({ type: "attendance.set", meetingId: "meeting", personId, status, expectedRevision });

describe("찬양 명령의 담당 조·충돌·멱등 계약", () => {
  it("조 담당자는 본인 조만, 등단 편성 담당도 연결된 조만 출결을 수정한다", () => {
    const state = fixture();
    expect(apply(state, setAttendance(), staffActor).attendance.meeting["student-1"].status).toBe("ABSENT");
    expectError(() => apply(state, setAttendance("student-5"), staffActor), "forbidden", 403);
    expect(apply(state, setAttendance("student-5"), editor).attendance.meeting["student-5"].status).toBe("ABSENT");
    expectError(() => apply(state, setAttendance(), editor), "forbidden", 403);
    expectError(() => apply(state, setAttendance(), member), "forbidden", 403);
    expect(praisePermissions(editor, state)).toMatchObject({ stageEdit: true, attendanceAll: false });
  });

  it("미입력 null은 결석과 구분하여 보존하고 최초 기록의 조 기준을 고정한다", () => {
    const state = fixture(), original = structuredClone(state);
    const next = apply(state, setAttendance("student-1", null), staffActor);
    expect(next.attendance.meeting["student-1"]).toMatchObject({ status: null, revision: 2, groupVersionId: "confirmed-group" });
    expect(next.meetings.meeting.groupVersionId).toBe("confirmed-group");
    expect(next.audit["synthetic-op"].changes).toEqual([{ field: "출결", before: "출석", after: "미입력" }]);
    expect(state).toEqual(original);
  });

  it("기록 기준 버전이 오래되면 409이며 입력 원장은 그대로다", () => {
    const state = fixture(), original = structuredClone(state);
    expectError(() => apply(state, setAttendance("student-1", "ABSENT", 0)), "revision_conflict", 409);
    expect(state).toEqual(original);
  });

  it("같은 계정의 같은 작업 번호 재시도는 기록·감사 로그를 중복 생성하지 않는다", () => {
    const command = setAttendance(), next = apply(fixture(), command);
    const repeated = applyPraiseCommand(next, command, manager, 5000, "synthetic-op");
    expect(repeated).toBe(next); expect(Object.keys(repeated.audit)).toHaveLength(1);
    expect(repeated.attendance.meeting["student-1"].revision).toBe(2);
    expectError(() => apply(next, setAttendance("student-1", "PRESENT")), "operation_conflict", 409);
    expectError(() => apply(next, command, staffActor), "operation_conflict", 409);
  });

  it("담당자 연결 해제와 주일 찬양팀 접근 회수는 즉시 쓰기를 막는다", () => {
    const state = fixture(); state.access[staffActor.uid].active = false;
    expectError(() => apply(state, setAttendance(), staffActor), "forbidden", 403);
    state.access[staffActor.uid].active = true;
    expectError(() => apply(state, setAttendance(), { ...staffActor, roles: { semester: "none", retreat: "superAdmin" }, teamMemberships: {} }), "forbidden", 403);
  });

  it("일반 스탭의 참석은 본인만 기록한다", () => {
    const state = fixture();
    const own: PraiseCommand = { type: "availability.set", meetingId: "meeting", personId: "staff-4", present: false, role: "SESSION", expectedRevision: 1 };
    expect(apply(state, own, member).availability.meeting["staff-4"]).toMatchObject({ present: false, role: "SESSION" });
    expectError(() => apply(state, { ...own, personId: "staff-2" }, member), "forbidden", 403);
  });
});

describe("조 편성 확정과 과거 조 기준", () => {
  it("화면에서 수정한 미저장 초안 내용을 직접 확정하고 이전 버전은 보존한다", () => {
    const state = fixture(), before = structuredClone(state.groupVersions["confirmed-group"]), draft = groupDraft(state);
    draft.groups[0].name = "합성 수정 조";
    [draft.groups[0].studentIds[0], draft.groups[1].studentIds[0]] = [draft.groups[1].studentIds[0], draft.groups[0].studentIds[0]];
    const next = apply(state, { type: "groups.confirm", expectedRevision: 1, sourceVersionId: "confirmed-group", draft, acknowledgeWarnings: false });
    expect(next.meta.activeGroupVersionId).toBe("v_synthetic-op");
    expect(next.groupVersions["v_synthetic-op"].groups).toEqual(draft.groups);
    expect(next.groupVersions["confirmed-group"]).toEqual(before);
  });

  it("경고 미확인·누락 학생·오래된 편성 원천은 확정할 수 없다", () => {
    const state = fixture(), draft = groupDraft(state); draft.groups[0].staffIds = [];
    const command: PraiseCommand = { type: "groups.confirm", expectedRevision: 1, sourceVersionId: "confirmed-group", draft, acknowledgeWarnings: false };
    expectError(() => apply(state, command), "warnings_required", 409);
    expect(apply(state, { ...command, acknowledgeWarnings: true }).groupVersions["v_synthetic-op"].kind).toBe("CONFIRMED");
    draft.groups[0].studentIds.pop(); expectError(() => apply(state, { ...command, acknowledgeWarnings: true }), "invalid_request", 400);
    expectError(() => apply(state, { ...command, sourceVersionId: "missing" }), "revision_conflict", 409);
  });

  it("새 조 확정 이후에도 기록이 시작된 회차는 이전 조 담당자가 관리한다", () => {
    let state = apply(fixture(), setAttendance("student-1", null), staffActor, "pin-meeting");
    const draft = groupDraft(state); [draft.groups[0].studentIds[0], draft.groups[1].studentIds[0]] = [draft.groups[1].studentIds[0], draft.groups[0].studentIds[0]];
    state = apply(state, { type: "groups.confirm", expectedRevision: state.meta.revision, sourceVersionId: "confirmed-group", draft, acknowledgeWarnings: false }, manager, "new-groups");
    expect(canWritePraiseAttendance(staffActor, state, state.meetings.meeting, "student-1")).toBe(true);
    expect(canWritePraiseAttendance(editor, state, state.meetings.meeting, "student-1")).toBe(false);
    expect(canEditViewAttendance(praiseView(state, staffActor), "meeting", "student-1")).toBe(true);
  });
});

describe("운영 상태와 이관 경계", () => {
  for (const mode of ["archived", "shadow"] as const) {
    it(`${mode}에서는 관리자도 출결을 쓰지 못하고 학기 설정으로 복귀할 수 있다`, () => {
      const state = fixture(); if (mode === "archived") state.meta.status = "archived"; else state.meta.mode = "shadow";
      expectError(() => apply(state, setAttendance()), "read_only", 409);
      expect(apply(state, { type: "meta.save", expectedRevision: 1, meta: { name: state.meta.name, startDate: state.meta.startDate, endDate: state.meta.endDate, status: "active", mode: "live" } }).meta).toMatchObject({ status: "active", mode: "live" });
    });
  }

  it("준비 모드에서 담당 조 입력을 막고 관리자 준비 작업은 허용한다", () => {
    const state = fixture(); state.meta.mode = "setup";
    expectError(() => apply(state, setAttendance(), staffActor), "read_only", 409);
    expect(apply(state, setAttendance()).attendance.meeting["student-1"].status).toBe("ABSENT");
  });

  for (const mode of ["setup", "live"] as const) {
    it(`이관 미해결 기록을 ${mode}로 바꿔 읽기 전용을 해제하지 못한다`, () => {
      const state = fixture(); state.meta.mode = "shadow"; state.meta.importBlockers = ["source_snapshot_unverified"];
      const before = structuredClone(state);
      expectError(() => apply(state, { type: "meta.save", expectedRevision: 1, meta: { name: state.meta.name, startDate: state.meta.startDate, endDate: state.meta.endDate, status: "active", mode } }), "migration_incomplete", 409);
      expect(state).toEqual(before);
      expectError(() => apply(state, setAttendance()), "read_only", 409);
    });
  }

  it("대조 중인 기록의 표시 이름을 바꿔도 차단 항목과 원본 출석은 보존한다", () => {
    const state = fixture(); state.meta.mode = "shadow"; state.meta.importBlockers = ["source_snapshot_unverified"];
    const next = apply(state, { type: "meta.save", expectedRevision: 1, meta: { name: "검토용 보관본", startDate: state.meta.startDate, endDate: state.meta.endDate, status: "active", mode: "shadow" } });
    expect(next.meta).toMatchObject({ mode: "shadow", importBlockers: state.meta.importBlockers, name: "검토용 보관본" });
    expect(next.attendance).toEqual(state.attendance);
  });

  it("공통 출석 연결은 일반 회차 명령으로 만들 수 없고 연결 회차의 출결은 별도로 쓰지 않는다", () => {
    const state = fixture(); state.attendance = {};
    expectError(() => apply(state, { type: "meeting.save", expectedRevision: 1, meeting: { ...meetingInput(state), linkedSessionId: "semester-session" } }), "migration_required", 409);
    state.meetings.meeting.linkedSessionId = "semester-session";
    expectError(() => apply(state, setAttendance()), "linked_attendance", 409);
  });

  it("기록이 있는 회차의 날짜·조 기준은 변경할 수 없다", () => {
    const state = fixture();
    expectError(() => apply(state, { type: "meeting.save", expectedRevision: 1, meeting: { ...meetingInput(state), date: "2026-09-12" } }), "invalid_request", 400);
  });

  it("연결 회차가 없으면 학기·팀 참조를 해제하고 연결 회차가 있으면 막는다", () => {
    const state = fixture(); state.meta.semesterId = "semester"; state.meta.teamId = "team";
    const command: PraiseCommand = { type: "meta.save", expectedRevision: 1, meta: { name: state.meta.name, startDate: state.meta.startDate, endDate: state.meta.endDate, status: "active", mode: "live" } };
    const next = apply(state, command); expect(next.meta).not.toHaveProperty("semesterId"); expect(next.meta).not.toHaveProperty("teamId");
    state.meetings.meeting.linkedSessionId = "linked"; expectError(() => apply(state, command), "invalid_request", 400);
  });
});

describe("팀원 정보 대조와 통합 명단 연결 불변성", () => {
  it("shadow 관리자는 기존 팀원의 최초 연결과 찬양 설정만 저장하며 원본 기록을 보존한다", () => {
    const state = fixture(); state.meta.mode = "shadow"; state.meta.importBlockers = ["historical_group_unresolved"];
    state.people["student-1"].sourceId = "source-student-1";
    const beforeAttendance = structuredClone(state.attendance), beforeStages = structuredClone(state.stageVersions), beforeGroups = structuredClone(state.groupVersions);
    const person = { ...personInput(state.people["student-1"]), team: "SESSION" as const, rosterLink: { applicationKey: "1_student-1", personId: "person_student_1", year: "2026", classKey: "1-1-1", studentId: "student-1" } };
    const next = apply(state, { type: "person.reconcile", expectedRevision: 1, person }, manager, "reconcile-person");
    expect(next.people["student-1"]).toMatchObject({ team: "SESSION", rosterLink: person.rosterLink, sourceId: "source-student-1", revision: 2 });
    expect(next.attendance).toEqual(beforeAttendance); expect(next.stageVersions).toEqual(beforeStages); expect(next.groupVersions).toEqual(beforeGroups);
    expect(next.meta.importBlockers).toEqual(state.meta.importBlockers);
    expect(next.audit["reconcile-person"]).toMatchObject({ label: "찬양팀 팀원 정보 대조", targetId: "student-1" });
    expect(next.audit["reconcile-person"].changes).toEqual(expect.arrayContaining([
      { field: "파트", before: "싱어", after: "세션" },
      { field: "통합 명단 연결", before: "미연결", after: "연결됨" },
    ]));
    expect(JSON.stringify(next.audit["reconcile-person"])).not.toContain("person_student_1");
    expect(JSON.stringify(next.audit["reconcile-person"])).not.toContain("1_student-1");
  });

  it("shadow의 일반 저장·신규 대조와 live의 대조 전용 명령을 거절한다", () => {
    const state = fixture(); state.meta.mode = "shadow";
    const existing = personInput(state.people["student-1"]);
    expectError(() => apply(state, { type: "person.save", expectedRevision: 1, person: existing }), "read_only", 409);
    expectError(() => apply(state, { type: "person.reconcile", expectedRevision: 0, person: personInput(person("new-student", "STUDENT")) }), "read_only", 409);
    state.meta.mode = "live";
    expectError(() => apply(state, { type: "person.reconcile", expectedRevision: 1, person: existing }), "read_only", 409);
  });

  it("실제 변경이 없는 팀원 저장은 revision과 감사 로그를 만들지 않는다", () => {
    const live = fixture();
    const liveBefore = structuredClone(live);
    expectError(() => apply(live, { type: "person.save", expectedRevision: 1, person: personInput(live.people["student-1"]) }), "no_changes", 409);
    expect(live).toEqual(liveBefore);

    const shadow = fixture(); shadow.meta.mode = "shadow";
    const shadowBefore = structuredClone(shadow);
    expectError(() => apply(shadow, { type: "person.reconcile", expectedRevision: 1, person: personInput(shadow.people["student-1"]) }), "no_changes", 409);
    expect(shadow).toEqual(shadowBefore);
  });

  it("기존 원장 연결과 이관 원본 ID는 화면 명령으로 해제·교체할 수 없다", () => {
    const state = fixture(); state.people["student-1"].sourceId = "source-student-1";
    state.people["student-1"].rosterLink = { applicationKey: "1_student-1", personId: "person_student_1", year: "2026", classKey: "1-1-1", studentId: "student-1" };
    const base = personInput(state.people["student-1"]);
    const withoutLink = { ...base }; delete withoutLink.rosterLink;
    expectError(() => apply(state, { type: "person.save", expectedRevision: 1, person: withoutLink }), "immutable_roster_link", 409);
    expectError(() => apply(state, { type: "person.save", expectedRevision: 1, person: { ...base, rosterLink: { ...base.rosterLink, applicationKey: "1_other", personId: "person_student_other", studentId: "other" } } }), "immutable_roster_link", 409);
    expectError(() => apply(state, { type: "person.save", expectedRevision: 1, person: { ...base, sourceId: "other-source" } }), "immutable_source", 409);
  });

  it("대조 명령 파서는 알려진 필드만 유지한다", () => {
    const state = fixture();
    const result = parseCommand({ operationId: "reconcile-parse", command: { type: "person.reconcile", expectedRevision: 1, person: { ...personInput(state.people["student-1"]), arbitraryPath: "classes" }, admin: true } });
    expect(result.command).toMatchObject({ type: "person.reconcile", expectedRevision: 1, person: { id: "student-1" } });
    expect(JSON.stringify(result.command)).not.toContain("arbitraryPath");
  });

  it("여러 팀원을 한 작업·감사 기록으로 연결하고 중간 실패 시 원본을 유지한다", () => {
    const state = fixture(); state.meta.mode = "shadow";
    const entries = ["student-1", "student-2"].map((id, index) => ({
      expectedRevision: 1,
      person: {
        ...personInput(state.people[id]),
        rosterLink: { applicationKey: `1_${id}`, personId: `person_student_${index + 1}`, year: "2026", classKey: `1-1-${index + 1}`, studentId: id },
      },
    }));
    const next = apply(state, { type: "people.reconcile", people: entries }, manager, "batch-reconcile");
    expect(next.people["student-1"].rosterLink).toEqual(entries[0].person.rosterLink);
    expect(next.people["student-2"].rosterLink).toEqual(entries[1].person.rosterLink);
    expect(next.people["student-1"].revision).toBe(2); expect(next.people["student-2"].revision).toBe(2);
    expect(next.meta.revision).toBe(state.meta.revision + 1);
    expect(Object.keys(next.operations).filter((id) => id === "batch-reconcile")).toHaveLength(1);
    expect(next.audit["batch-reconcile"]).toMatchObject({ label: "찬양팀 통합 명단 2명 연결", changedCount: 2, changes: [{ field: "연결된 팀원", before: "미연결 2명", after: "합성 student-1, 합성 student-2" }] });
    expect(JSON.stringify(next.audit["batch-reconcile"])).not.toContain("person_student_");
    const before = structuredClone(state);
    expectError(() => apply(state, { type: "people.reconcile", people: [{ ...entries[0], expectedRevision: 0 }, entries[1]] }, manager, "bad-batch"), "revision_conflict", 409);
    expect(state).toEqual(before);
  });

  it("일괄 대조는 중복·기존 연결·출석 저장 대기 중인 팀원을 거절한다", () => {
    const state = fixture(); state.meta.mode = "shadow";
    const entry = { expectedRevision: 1, person: { ...personInput(state.people["student-1"]), rosterLink: { applicationKey: "1_student-1", personId: "person_student_1", year: "2026", classKey: "1-1-1", studentId: "student-1" } } };
    expectError(() => apply(state, { type: "people.reconcile", people: [entry, entry] }, manager, "duplicate-batch"), "duplicate_person", 409);
    state.people["student-1"].rosterLink = entry.person.rosterLink;
    expectError(() => apply(state, { type: "people.reconcile", people: [{ ...entry, expectedRevision: 1 }] }, manager, "linked-batch"), "immutable_roster_link", 409);
    delete state.people["student-1"].rosterLink;
    state.operations.pending = { at: 1000, actorUid: manager.uid, fingerprint: "pending", sharedAttendance: { phase: "prepared", meetingId: "meeting", personId: "student-1", semesterId: "2026-2", sessionId: "session", applicationKey: "1_student-1", groupVersionId: "confirmed-group", status: "PRESENT", beforeStatus: "ABSENT", expectedSourceRevision: "a".repeat(64) } };
    expectError(() => apply(state, { type: "people.reconcile", people: [entry] }, manager, "pending-batch"), "shared_write_pending", 409);
  });

  it("일괄 대조 요청으로 기존 이름·학년·파트·상태를 함께 덮어쓰지 못한다", () => {
    const state = fixture(); state.meta.mode = "shadow"; const before = structuredClone(state);
    const base = personInput(state.people["student-1"]);
    const rosterLink = { applicationKey: "1_student-1", personId: "person_student_1", year: "2026", classKey: "1-1-1", studentId: "student-1" };
    for (const patch of [{ name: "다른 이름" }, { grade: 3 }, { team: "SESSION" as const }, { active: false }]) {
      expectError(() => apply(state, { type: "people.reconcile", people: [{ expectedRevision: 1, person: { ...base, ...patch, rosterLink } }] }, manager, `scope-${Object.keys(patch)[0]}`), "reconcile_scope", 409);
      expect(state).toEqual(before);
    }
  });
});

describe("등단 입력·후보·이력", () => {
  it("명단이나 출결이 달라지면 오래된 기준의 자동 편성을 409로 거절한다", () => {
    const state = fixture(), inputRevision = stageInputRevision(state, state.meetings.meeting);
    state.attendance.meeting["student-1"].status = "ABSENT";
    expectError(() => apply(state, { type: "stage.generate", meetingId: "meeting", inputRevision, config: stageConfig(), overrides: [] }, editor), "input_conflict", 409);
  });

  it("학생 인도자는 출석해야 하며 강제 등단도 결석·세션 학생을 후보로 만들지 않는다", () => {
    const state = fixture(); state.attendance.meeting["student-1"].status = "ABSENT"; state.people["student-2"].team = "SESSION";
    expectError(() => generatePraiseStage(state, state.meetings.meeting, stageConfig({ leaderType: "STUDENT", leaderId: "student-1" }), []), "invalid_request", 400);
    const result = generatePraiseStage(state, state.meetings.meeting, stageConfig(), [{ termStudentId: "student-1", kind: "FORCE_STAGE", department: "FIRST", role: "SINGER" }]);
    const ids = result.services.flatMap((service) => service.assignments.map((item) => item.personId));
    expect(ids).not.toContain("student-1"); expect(ids).not.toContain("student-2");
    expect(result.candidates.find((item) => item.personId === "student-1")?.eligible).toBe(false);
  });

  it("휴강·미입력은 학생 등단 자격을 주지 않는다", () => {
    const state = fixture(); state.attendance.meeting["student-1"].status = null;
    const draft = manual(); expectError(() => validateManualStage(state, state.meetings.meeting, draft), "invalid_request", 400);
    state.meetings.meeting.cancelled = true;
    expect(generatePraiseStage(state, state.meetings.meeting, stageConfig(), []).services.flatMap((service) => service.assignments).every((item) => item.personType === "STAFF")).toBe(true);
  });

  it("수동 배치에서 중복 인물·위치·인도자·다른 부 학생을 거절한다", () => {
    const state = fixture();
    for (const assignments of [[assignment("student-1"), assignment("student-1", { positionOrder: 1 })], [assignment("student-1"), assignment("student-2")], [assignment("staff-1")], [assignment("student-5")]]) {
      const draft = manual(); draft.services[0].assignments = assignments;
      expectError(() => validateManualStage(state, state.meetings.meeting, draft), "invalid_request", 400);
    }
  });

  it("일반 수동 편성의 지원 스탭은 예배당 3명까지이며 스탭 전용 모드는 예외다", () => {
    const state = fixture(), draft = manual(); draft.services[0].assignments = [2, 3, 4, 5].map((id, positionOrder) => assignment(`staff-${id}`, { positionOrder }));
    expectError(() => validateManualStage(state, state.meetings.meeting, draft), "invalid_request", 400);
    draft.services[0].assignments.pop(); expect(validateManualStage(state, state.meetings.meeting, draft).services[0].assignments).toHaveLength(3);
    const result = generatePraiseStage(state, state.meetings.meeting, stageConfig({ staffOnly: true }), []);
    expect(result.services.map((service) => service.assignments.length)).toEqual([4, 4]);
    state.attendance.meeting = {};
    const normal = generatePraiseStage(state, state.meetings.meeting, stageConfig({ first: { singerTarget: 8, choirTarget: 0 }, second: { singerTarget: 8, choirTarget: 0 } }), []);
    normal.services.forEach((service) => expect(service.assignments.filter((item) => item.personType === "STAFF").length).toBeLessThanOrEqual(3));
  });

  it("등단 편집 시 입력된 이름·성별을 원장으로 교정하고 확정본 이력을 덮지 않는다", () => {
    const state = fixture(); state.stageVersions.past = stageVersion("past");
    const inputRevision = stageInputRevision(state, state.meetings.meeting);
    let next = apply(state, { type: "stage.generate", meetingId: "meeting", inputRevision, config: stageConfig(), overrides: [] }, editor, "stage-draft");
    const draft = manual(); draft.services[0].assignments[0].name = "위조 표시 이름"; draft.services[0].assignments[0].gender = "MALE";
    next = apply(next, { type: "stage.confirm", meetingId: "meeting", inputRevision: stageInputRevision(next, next.meetings.meeting), sourceVersionId: "v_stage-draft", draft, acknowledgeWarnings: true }, editor, "stage-confirm");
    expect(next.stageVersions["v_stage-confirm"].services[0].assignments[0]).toMatchObject({ name: state.people["student-1"].name, gender: "FEMALE", isManual: true });
    expect(next.stageVersions.past).toEqual(state.stageVersions.past);
    expect(next.stageVersions["v_stage-draft"].kind).toBe("AUTO_DRAFT");
  });

  it("새 등단 초안이 저장되면 이전 버전을 기준으로 확정할 수 없다", () => {
    const state = fixture(); state.stageVersions.latest = stageVersion("latest", { meetingId: "meeting", kind: "AUTO_DRAFT", number: 2, worshipDate: state.meetings.meeting.worshipDate });
    expectError(() => apply(state, { type: "stage.confirm", meetingId: "meeting", inputRevision: stageInputRevision(state, state.meetings.meeting), sourceVersionId: "older", draft: manual(), acknowledgeWarnings: true }, editor), "revision_conflict", 409);
  });

  it("후보였으나 쉬었던 학생과 확정 당시 이름을 현재 명단 수정 후에도 보존한다", () => {
    const state = fixture(); state.stageVersions.past = stageVersion("past");
    const before = structuredClone(state.stageVersions.past); state.people["student-1"].name = "합성 변경 이름";
    expect(stageHistory(state, "2026-09-06").get("student-2")).toMatchObject({ totalCount: 0, missedPrevious: true });
    expect(stageHistory(state, "2026-09-06").get("student-1")).toMatchObject({ totalCount: 1, singerCount: 1, stagedPreviousTwo: false });
    expect(praiseView(state, observer).stages[0].services[0].assignments[0].name).toBe(before.services[0].assignments[0].name);
  });

  it("같은 주일의 임시 회차 두 확정본을 서로 다른 주의 연속 등단으로 세지 않는다", () => {
    const state = fixture();
    state.stageVersions.first = stageVersion("first", { meetingId: "first-meeting" });
    state.stageVersions.temporary = stageVersion("temporary", { meetingId: "temporary-meeting", createdAt: 700 });
    const history = stageHistory(state, "2026-09-06").get("student-1");
    expect(history?.totalCount).toBe(1);
    expect(history?.stagedPreviousTwo).toBe(false);
    expect(history?.singerPreviousTwo).toBe(false);
  });

  it("같은 회차의 새 예배일 초안이 과거 확정본의 날짜와 이력을 옮기지 않는다", () => {
    const state = fixture();
    state.stageVersions.confirmed = stageVersion("confirmed", { meetingId: "past-meeting", worshipDate: "2026-08-30" });
    state.stageVersions.draft = stageVersion("draft", { meetingId: "past-meeting", kind: "AUTO_DRAFT", number: 2, worshipDate: "2026-09-06", createdAt: 700 });
    expect(stageHistory(state, "2026-09-06").get("student-1")?.totalCount).toBe(1);
  });
});

describe("권한별 조회 응답", () => {
  it("일반 열람자는 담당자·원장 연결·초안·특이사항·후보·타인 활동을 받지 않는다", () => {
    const state = fixture(); state.people["student-1"].rosterLink = { personId: "private-link" }; state.people["student-1"].sourceId = "source-private";
    state.stageVersions.confirmed = stageVersion("confirmed", { overrides: [{ termStudentId: "student-1", kind: "EXCLUDE_STAGE", department: "FIRST" }], warnings: ["합성 내부 경고"] });
    state.stageVersions.draft = stageVersion("draft", { kind: "AUTO_DRAFT", number: 2 });
    state.guides.private = { ...stamp, meetingId: "meeting", published: false, content: createFirstMeetingGuide() };
    state.guides.public = { ...stamp, meetingId: "published-meeting", published: true, content: createFirstMeetingGuide() };
    state.audit.private = { id: "private", at: 1000, actor: { uid: manager.uid }, action: "synthetic", label: "합성 내부 기록", changes: [] };
    const view = praiseView(state, observer);
    expect(view.people).toEqual([]); expect(view.groups).toEqual([]); expect(view.attendance).toEqual({}); expect(view.availability).toEqual({});
    expect(view.access).toEqual([]); expect(view.imports).toEqual([]); expect(view.policy).toBeNull(); expect(view.audit).toEqual([]); expect(view.inputRevisions).toEqual({});
    expect(view.guides).toHaveLength(1); expect(view.guides[0].published).toBe(true);
    expect(view.stages).toHaveLength(1); expect(view.stages[0]).toMatchObject({ overrides: [], candidates: [], warnings: [] });
    expect(view.stages[0].services.flatMap((service) => service.assignments).every((row) => row.reason === "")).toBe(true);
    expect(JSON.stringify(view)).not.toContain("private-link"); expect(JSON.stringify(view)).not.toContain("source-private");
  });

  it("조 담당자 응답은 담당 조·본인 참석만 포함하고 공개 인물 원장 연결을 제거한다", () => {
    const state = fixture(); state.people["student-1"].rosterLink = { personId: "private-link" }; state.people["student-1"].sourceId = "source-private";
    const view = praiseView(state, staffActor);
    expect(Object.keys(view.attendance.meeting).sort()).toEqual(["student-1", "student-2", "student-3", "student-4"]);
    expect(Object.keys(view.availability.meeting)).toEqual(["staff-2"]);
    expect(view.people.map((row) => row.id)).not.toContain("student-5");
    expect(view.people.find((row) => row.id === "student-1")?.rosterLink).toBeUndefined();
    expect(view.groups.every((version) => version.groups.length === 1)).toBe(true);
  });

  it("주일 찬양팀 접근이 없으면 공개 확정본도 읽지 못한다", () => {
    expectError(() => praiseView(fixture(), { ...observer, roles: { semester: "none", retreat: "none" }, teamMemberships: {} }), "forbidden", 403);
  });
});

describe("명령 파서와 개설 기본값", () => {
  it("새 운영 공간은 토요일 모임·다음 주일·미게시 첫 모임 가이드로 준비한다", () => {
    const input = parseCreate({ operationId: "create-test", workspace: { id: "synthetic", name: "합성 학기", startDate: "2026-09-01", endDate: "2026-09-13" } });
    const state = createPraiseState(input, manager, 1000);
    expect(Object.values(state.meetings).map((meeting) => [meeting.date, meeting.worshipDate])).toEqual([["2026-09-05", "2026-09-06"], ["2026-09-12", "2026-09-13"]]);
    expect(state.meta.mode).toBe("setup"); expect(Object.values(state.guides)).toHaveLength(1); expect(Object.values(state.guides)[0].published).toBe(false);
    expectError(() => createPraiseState(input, observer, 1000), "forbidden", 403);
  });

  it("새 입력의 지각·가짜 날짜·초과 학생 비율·위험 ID를 거절한다", () => {
    const state = fixture();
    for (const command of [
      { ...setAttendance(), status: "LATE" },
      { type: "meeting.save", expectedRevision: 1, meeting: { ...meetingInput(state), date: "2026-02-30" } },
      { type: "stage.generate", meetingId: "meeting", inputRevision: "revision", config: stageConfig({ studentRatio: .9 }), overrides: [] },
      { ...setAttendance(), personId: "__proto__" },
    ]) expectError(() => parseCommand({ operationId: "test", command }), "invalid_request", 400);
  });

  it("미입력 null은 파싱하며 알 수 없는 원장 필드를 저장 명령에 섞지 않는다", () => {
    const result = parseCommand({ operationId: "test", command: { ...setAttendance("student-1", null), admin: true, arbitraryPath: "classes" } });
    expect(result.command).toEqual(setAttendance("student-1", null));
  });

  it("일괄 대조 목록은 100명으로 제한하고 각 팀원의 알려진 필드만 파싱한다", () => {
    const state = fixture(), entry = { expectedRevision: 1, person: { ...personInput(state.people["student-1"]), arbitraryPath: "classes" } };
    const parsed = parseCommand({ operationId: "batch-parse", command: { type: "people.reconcile", people: [entry], arbitraryPath: "semesters" } });
    expect(parsed.command).toMatchObject({ type: "people.reconcile", people: [{ expectedRevision: 1, person: { id: "student-1" } }] });
    expect(JSON.stringify(parsed.command)).not.toContain("arbitraryPath");
    expectError(() => parseCommand({ operationId: "too-many", command: { type: "people.reconcile", people: Array.from({ length: 101 }, () => entry) } }), "invalid_request", 400);
  });
});


describe("스탭 주일 참석 감사 식별", () => {
  it("주일 날짜·대상 스탭·참석과 역할의 전후 값을 원자 감사에 남긴다", () => {
    const next = apply(fixture(), { type: "availability.set", meetingId: "meeting", personId: "staff-4", present: false, role: "SESSION", expectedRevision: 1 }, member, "staff-change");
    expect(next.audit["staff-change"]).toMatchObject({
      label: "2026-09-06 합성 staff-4 주일 참석·역할 변경", targetId: "staff-4", actor: { uid: member.uid },
      changes: [{ field: "주일 참석", before: "참석", after: "불참" }, { field: "참석 역할", before: "싱어", after: "세션" }],
    });
    expect(next.availability.meeting["staff-4"]).toMatchObject({ present: false, role: "SESSION", updatedBy: member.uid });
  });
  it("기록을 지운 결과를 결석으로 바꾸지 않고 재시도에서 감사도 중복하지 않는다", () => {
    const command: PraiseCommand = { type: "availability.set", meetingId: "meeting", personId: "staff-4", present: null, role: "SINGER", expectedRevision: 1 };
    const next = apply(fixture(), command, member, "clear-staff");
    expect(next.audit["clear-staff"].changes[0].after).toBe("미입력");
    expect(apply(next, command, member, "clear-staff")).toEqual(next);
  });
});

describe("운영 전환 후 과거 기록 보관",()=>{
 it("과거 출결·스탭 참석·등단 생성과 회차 날짜 우회를 서버에서 거절한다",()=>{
  const s=fixture();s.meta.readOnlyBefore="2026-09-12";
  expectError(()=>apply(s,setAttendance()),"historical_read_only",409);
  expectError(()=>apply(s,{type:"availability.set",meetingId:"meeting",personId:"staff-1",present:false,role:"SINGER",expectedRevision:1}),"historical_read_only",409);
  expectError(()=>apply(s,{type:"stage.generate",meetingId:"meeting",inputRevision:stageInputRevision(s,s.meetings.meeting),config:stageConfig(),overrides:[]}),"historical_read_only",409);
  expectError(()=>apply(s,{type:"meeting.save",expectedRevision:0,meeting:{...meetingInput(s),id:"new-past"}}),"historical_read_only",409);
  s.meetings.meeting.date="2026-09-12";
  expect(apply(s,setAttendance()).attendance.meeting["student-1"].status).toBe("ABSENT");
 });
 it("활동 스탭은 원본 조 담당 플래그와 무관하게 수동 배정할 수 있고 중복은 금지한다",()=>{
  const s=fixture();s.people["staff-2"].groupStaffCapable=false;const draft=groupDraft(s);
  expect(apply(s,{type:"groups.confirm",expectedRevision:1,sourceVersionId:"confirmed-group",draft,acknowledgeWarnings:true}).meta.activeGroupVersionId).toBe("v_synthetic-op");
  draft.groups[1].staffIds.push("staff-2");expect(()=>apply(s,{type:"groups.confirm",expectedRevision:1,sourceVersionId:"confirmed-group",draft,acknowledgeWarnings:true})).toThrow();
 });
});


describe("같은 스탭의 복수 로그인 계정", () => {
  const second = actor("second-login");
  const link: PraiseCommand = { type: "access.save", expectedRevision: 0, access: { uid: second.uid, staffId: "staff-2", role: "groupStaff", active: true } };
  it("두 계정은 같은 조만 조회·입력하며 감사의 로그인 UID는 구분된다", () => {
    const state = apply(fixture(), link, manager, "link-second");
    expect(state.access[staffActor.uid].active).toBe(true);
    for (const who of [staffActor, second]) {
      expect(praiseView(state, who).people.map(p => p.id)).not.toContain("student-5");
      expectError(() => apply(state, setAttendance("student-5"), who), "forbidden", 403);
      const saved = apply(state, setAttendance(), who, who.uid + "-save");
      expect(saved.attendance.meeting["student-1"].updatedBy).toBe(who.uid);
      expect(saved.audit[who.uid + "-save"].actor.uid).toBe(who.uid);
    }
  });
  it("한 계정 회수는 다른 계정의 담당 권한을 회수하지 않는다", () => {
    let state = apply(fixture(), link, manager, "link-second");
    state = apply(state, { ...link, expectedRevision: 1, access: { ...link.access, active: false } }, manager, "revoke-second");
    expectError(() => apply(state, setAttendance(), second), "forbidden", 403);
    expect(praiseView(state, second).attendance).toEqual({});
    expect(apply(state, setAttendance(), staffActor).attendance.meeting["student-1"].status).toBe("ABSENT");
  });
  it("새 연결로 기존 UID를 덮어쓰거나 일반 담당자가 계정을 추가할 수 없다", () => {
    const state = apply(fixture(), link, manager, "link-second");
    expectError(() => apply(state, link), "revision_conflict", 409);
    expectError(() => apply(fixture(), link, staffActor), "forbidden", 403);
  });
});
