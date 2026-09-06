import { describe, expect, it } from "vitest";
import { latestConfirmedPraiseStages, praiseStudentStageHistory, preferredPraiseStageVersion } from "./stageHistoryModel";
import { praiseFixture } from "./components/praiseTestFixtures";
import type { PraiseStageVersion } from "./types";

function version(patch: Partial<PraiseStageVersion> = {}): PraiseStageVersion {
  return { id: "stage-a", meetingId: "meeting-a", number: 1, kind: "CONFIRMED", createdAt: 1000, createdBy: "actor", inputRevision: "input-a", worshipDate: "2026-09-06", config: { ...praiseFixture().policy!.stage, leaderType: "STAFF", leaderId: "staff-1", staffOnly: false }, leaderName: "합성스탭", services: [], overrides: [], candidates: [], warnings: [], acknowledgedWarnings: true, ...patch };
}
function assigned(personId: string, name = "당시학생", role: "SINGER" | "CHOIR" = "SINGER") { return { personId, name, role, personType: "STUDENT" as const, gender: "FEMALE" as const, side: "LEFT" as const, positionOrder: 0, reason: "합성 사유", isManual: false }; }

describe("예배일별 최신 확정 이력", () => {
  it("과거 예배는 최신 확정본을 기본으로, 현재·미래 예배는 최신 작업본을 기본으로 선택한다", () => {
    const confirmed = version(); const draft = version({ id: "draft", kind: "MANUAL_DRAFT", createdAt: 3000, number: 3 });
    expect(preferredPraiseStageVersion([confirmed, draft], "2026-09-06", "2026-09-07")?.id).toBe(confirmed.id);
    expect(preferredPraiseStageVersion([confirmed, draft], "2026-09-06", "2026-09-06")?.id).toBe(draft.id);
    expect(preferredPraiseStageVersion([confirmed, draft], "2026-09-06", "2026-09-05")?.id).toBe(draft.id);
    expect(preferredPraiseStageVersion([draft], "2026-09-06", "2026-09-07")).toBeUndefined();
  });
  it("다른 회차도 같은 예배일이면 createdAt·number·id 순서로 한 건만 선택한다", () => {
    const versions = [version({ id: "low-number", number: 1 }), version({ id: "tie-a", number: 2 }), version({ id: "tie-z", number: 2, meetingId: "other-meeting" }), version({ id: "older-created", number: 999, createdAt: 999 }), version({ id: "draft-new", kind: "AUTO_DRAFT", number: 1000, createdAt: 5000 })];
    expect(latestConfirmedPraiseStages(versions).map((item) => item.id)).toEqual(["tie-z"]);
    expect(latestConfirmedPraiseStages([...versions, version({ id: "new-created", createdAt: 1001 })]).map((item) => item.id)).toEqual(["new-created"]);
  });
  it("before는 저장된 예배일이 현재 주일보다 이른 확정본만 선택한다", () => {
    const versions = [version({ id: "past", worshipDate: "2026-08-30" }), version(), version({ id: "future", worshipDate: "2026-09-13" })];
    expect(latestConfirmedPraiseStages(versions, "2026-09-06").map((item) => item.id)).toEqual(["past"]);
  });
  it("1·2부 중복 등단은 한 번이고 초안·이전 확정본은 포함하지 않는다", () => {
    const people = praiseFixture().people;
    const before = version({ services: [{ department: "FIRST", assignments: [assigned("student-2")] }] });
    const current = version({ id: "latest", createdAt: 2000, services: [{ department: "FIRST", assignments: [assigned("student-1")] }, { department: "SECOND", assignments: [assigned("student-1", "당시학생", "CHOIR")] }] });
    const draft = version({ id: "draft", kind: "MANUAL_DRAFT", createdAt: 3000, worshipDate: "2026-09-13", services: [{ department: "FIRST", assignments: [assigned("student-2", "초안이름")] }] });
    const result = praiseStudentStageHistory(people, [before, current, draft]);
    expect(result.versions).toHaveLength(1);
    const student = result.rows.find((row) => row.id === "student-1")!;
    expect(student.stagedCount).toBe(1); expect(student.records[0].label).toBe("1부 싱어 · 2부 콰이어");
    expect(result.rows.find((row) => row.id === "student-2")!.records[0].label).toBe("기록 없음");
    expect(result.rows.flatMap((row) => row.searchNames)).not.toContain("초안이름");
  });
  it("인도자·싱어·콰이어·명시적 휴식·기록 없음을 구분한다", () => {
    const people = praiseFixture().people.filter((person) => person.kind === "STUDENT");
    const extra = Array.from({ length: 4 }, (_, index) => ({ ...people[0], id: `extra-${index}`, name: `합성추가${index}` }));
    const source = version({ config: { ...version().config, leaderType: "STUDENT", leaderId: "student-1" }, leaderName: "당시인도자", services: [{ department: "FIRST", assignments: [assigned("student-2"), assigned("extra-0", "합성콰이어", "CHOIR")] }], candidates: [{ personId: "extra-1", eligible: true, reason: "원문을 표시하지 않음" }, { personId: "extra-3", eligible: false, reason: "미입력 또는 결석" }], overrides: [{ termStudentId: "extra-2", kind: "EXCLUDE_STAGE", department: "FIRST" }] });
    const rows = praiseStudentStageHistory([...people, ...extra], [source]).rows;
    const label = (id: string) => rows.find((row) => row.id === id)?.records[0].label;
    expect(label("student-1")).toBe("인도자"); expect(label("student-2")).toBe("1부 싱어"); expect(label("extra-0")).toBe("1부 콰이어");
    expect(label("extra-1")).toBe("반에서 예배하기"); expect(label("extra-2")).toBe("반에서 예배하기"); expect(label("extra-3")).toBe("기록 없음");
  });
  it("현재 이름 변경·비활성·명단 삭제 후에도 확정 당시 이름을 보존한다", () => {
    const people = praiseFixture().people; people[0].active = false; people[0].name = "현재변경이름";
    const first = version({ services: [{ department: "FIRST", assignments: [assigned("student-1", "첫주이름"), assigned("removed-student", "보관된당시학생")] }] });
    const second = version({ id: "second", worshipDate: "2026-09-13", services: [{ department: "SECOND", assignments: [assigned("student-1", "둘째주이름")] }] });
    const original = structuredClone({ people, stages: [first, second] });
    const rows = praiseStudentStageHistory(people, [first, second]).rows;
    const student = rows.find((row) => row.id === "student-1")!;
    expect(student.name).toBe("둘째주이름"); expect(student.currentName).toBe("현재변경이름"); expect(student.active).toBe(false);
    expect(student.records.map((record) => record.storedNames)).toEqual([["둘째주이름"], ["첫주이름"]]);
    expect(student.searchNames).toEqual(expect.arrayContaining(["현재변경이름", "첫주이름", "둘째주이름"]));
    expect(rows.find((row) => row.id === "removed-student")).toMatchObject({ name: "보관된당시학생", active: null, stagedCount: 1 });
    expect({ people, stages: [first, second] }).toEqual(original);
  });
  it("동명이인은 서로 다른 학생으로 유지한다", () => {
    const result = praiseStudentStageHistory([], [version({ services: [{ department: "FIRST", assignments: [assigned("student-a", "동명이인"), assigned("student-b", "동명이인")] }] })]);
    expect(result.rows.map((row) => row.id)).toEqual(["student-a", "student-b"]);
  });
  it("일반 스탭 응답에서 후보 정보가 없으면 출석·휴식을 추정하지 않는다", () => {
    const result = praiseStudentStageHistory(praiseFixture().people, [version({ candidates: [], overrides: [] })]);
    expect(result.rows.every((row) => row.stagedCount === 0 && row.records[0].label === "기록 없음")).toBe(true);
  });
  it("종류를 알 수 없는 후보나 스탭 배정을 학생으로 만들지 않는다", () => {
    const result = praiseStudentStageHistory([], [version({ candidates: [{ personId: "unknown", eligible: true, reason: "합성" }], services: [{ department: "FIRST", assignments: [{ ...assigned("staff-only"), personType: "STAFF" }] }] })]);
    expect(result.rows).toEqual([]);
  });
  it("날짜 범위는 양 끝을 포함하고 범위 밖 이력은 횟수에서 제외한다", () => {
    const dates = ["2026-08-30", "2026-09-06", "2026-09-13", "2026-09-20"];
    const versions = dates.map((date) => version({ id: date, worshipDate: date, services: [{ department: "FIRST", assignments: [assigned("student-1")] }] }));
    const result = praiseStudentStageHistory(praiseFixture().people, versions, { from: "2026-09-06", to: "2026-09-13" });
    expect(result.versions.map((source) => source.worshipDate)).toEqual(["2026-09-13", "2026-09-06"]);
    expect(result.rows.find((row) => row.id === "student-1")!.stagedCount).toBe(2);
  });
});
