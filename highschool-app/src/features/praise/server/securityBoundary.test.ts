import { describe, expect, it } from "vitest";
import type { PraiseActor } from "../types";
import { sourceFixture, fixtureOptions, sourceId } from "../migration/fixtures";
import { transformSupabaseSnapshot } from "../migration/transform";
import { applyPraiseCommand } from "./commands";
import { praiseView } from "./view";

const manager: PraiseActor = { uid: "manager", roles: { semester: "superAdmin", retreat: "none" }, teamMemberships: {} };
const delegate: PraiseActor = { uid: "delegate", roles: { semester: "praise", retreat: "none" }, teamMemberships: { praise: { role: "staff", active: true } } };
function importedState(mapped = false) {
  const state = transformSupabaseSnapshot(sourceFixture(), { ...fixtureOptions, ...(mapped ? { map: { meetingGroupVersions: { [sourceId(6)]: sourceId(8) } } } : {}) }).state;
  state.access.delegate = { uid: "delegate", staffId: `staff_${sourceId(3)}`, role: "groupStaff", active: true, revision: 1, updatedAt: 1000, updatedBy: "manager" };
  return state;
}

describe("이관 기록과 새 명령의 보안 경계", () => {
  it("operation 원장에 없는 과거 감사 ID도 재사용해서 덮어쓸 수 없다", () => {
    const state = importedState(); const [auditId] = Object.keys(state.audit); const before = structuredClone(state);
    const command = { type: "meta.save" as const, expectedRevision: state.meta.revision, meta: { name: state.meta.name, startDate: state.meta.startDate, endDate: state.meta.endDate, status: state.meta.status, mode: state.meta.mode } };
    expect(() => applyPraiseCommand(state, command, manager, 2000, auditId)).toThrow(expect.objectContaining({ status: 409, code: "operation_conflict" }));
    expect(state).toEqual(before);
  });
  it("감사와 operation이 없어도 이미 존재하는 버전 ID를 덮어쓸 수 없다", () => {
    const state = importedState(); state.groupVersions.v_existing = { ...Object.values(state.groupVersions)[0], id: "v_existing" };
    const command = { type: "meta.save" as const, expectedRevision: state.meta.revision, meta: { name: state.meta.name, startDate: state.meta.startDate, endDate: state.meta.endDate, status: state.meta.status, mode: state.meta.mode } };
    expect(() => applyPraiseCommand(state, command, manager, 2000, "existing")).toThrow(expect.objectContaining({ status: 409, code: "operation_conflict" }));
  });
  it("미상 과거 조 출석은 현재 조 스탭에게 열리지 않고 관리자만 검토한다", () => {
    const state = importedState(); expect(praiseView(state, delegate).attendance).toEqual({});
    expect(Object.keys(praiseView(state, manager).attendance)).toHaveLength(1);
  });
  it("동결·조 검증과 무관하게 공통 회차 연결은 live 전환을 거절한다", () => {
    const state = transformSupabaseSnapshot(sourceFixture(), { ...fixtureOptions, map: {
      semesterId: "2026-2", teamId: "praise", meetingSessionIds: { [sourceId(6)]: "existing-session" }, meetingGroupVersions: { [sourceId(6)]: sourceId(8) },
    } }).state;
    expect(state.meta.importBlockers).toEqual(["shared_attendance_cutover_pending"]);
    expect(() => applyPraiseCommand(state, { type: "meta.save", expectedRevision: state.meta.revision, meta: {
      name: state.meta.name, startDate: state.meta.startDate, endDate: state.meta.endDate, status: state.meta.status, mode: "live", semesterId: state.meta.semesterId, teamId: state.meta.teamId,
    } }, manager, 2000, "open-live")).toThrow(expect.objectContaining({ status: 409, code: "migration_incomplete" }));
  });
  it("검증된 과거 조 출석은 해당 버전 담당자에게만 보인다", () => {
    const state = importedState(true); expect(Object.keys(praiseView(state, delegate).attendance)).toHaveLength(1);
    const original = state.groupVersions[`groupver_${sourceId(8)}`];
    state.groupVersions.current = { ...structuredClone(original), id: "current", number: 2 };
    original.groups[0].staffIds = []; state.meta.activeGroupVersionId = "current";
    state.meetings[`meeting_${sourceId(6)}`].groupVersionId = "current";
    expect(praiseView(state, delegate).attendance).toEqual({});
  });
  it("역사적 감사·비공개 연결 원장은 일반 스탭 응답에서 제외한다", () => {
    const state = importedState(true); state.people[`student_${sourceId(5)}`].rosterLink = { studentId: "PRIVATE_LINK" };
    const view = praiseView(state, delegate);
    expect(view.audit).toEqual([]); expect(view.imports).toEqual([]); expect(view.access).toEqual([]); expect(view.policy).toBeNull();
    expect(JSON.stringify(view)).not.toContain("PRIVATE_LINK"); expect(view.people.every((person) => person.sourceId === undefined)).toBe(true);
    expect(view.stages.every((stage) => stage.candidates.length === 0 && stage.overrides.length === 0 && stage.warnings.length === 0)).toBe(true);
  });
});
