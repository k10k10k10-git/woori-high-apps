import { describe, expect, it } from "vitest";
import { completionRoster, isStaffApplication, isTrainingApplicant, semesterRoster, splitStudentsAndStaff } from "./roster";
import type { Application } from "./types";

function app(id: string, partial: Partial<Application> = {}): Application {
  return {
    id,
    studentId: id,
    bu: "1부",
    grade: 1,
    class: 1,
    name: id,
    status: "접수",
    createdAt: "2026-08-01T00:00:00.000Z",
    ...partial,
  };
}

describe("semesterRoster", () => {
  const applications = [
    app("assigned", { teamId: "team-a", status: "배치" }),
    app("bothTrainingAndTeam", { teamId: "team-a", status: "배치", trainingClassId: "tc1" }),
    app("trainingLegacy", { trainingOnly: true }),
    app("trainingClass", { trainingClassId: "tc2" }),
    app("waiting"),
    app("cancelled", { trainingOnly: true, status: "취소" }),
  ];

  it("사역팀 명단에는 배치된 신청자만 포함한다", () => {
    expect(semesterRoster(applications, "team").map((item) => item.id))
      .toEqual(["assigned", "bothTrainingAndTeam"]);
  });

  it("훈련 명단에는 사역팀을 함께 하는 사람도 포함한다", () => {
    expect(semesterRoster(applications, "training").map((item) => item.id))
      .toEqual(["bothTrainingAndTeam", "trainingLegacy", "trainingClass"]);
  });

  it("취소자는 어느 명단에도 없다", () => {
    expect(semesterRoster(applications, "training").some((item) => item.id === "cancelled")).toBe(false);
    expect(semesterRoster(applications, "team").some((item) => item.id === "cancelled")).toBe(false);
  });
});

describe("isTrainingApplicant", () => {
  it("훈련 반 배정 또는 레거시 trainingOnly를 훈련 신청으로 본다", () => {
    expect(isTrainingApplicant(app("a", { trainingClassId: "tc1" }))).toBe(true);
    expect(isTrainingApplicant(app("b", { trainingOnly: true }))).toBe(true);
    expect(isTrainingApplicant(app("c", { teamId: "team-a" }))).toBe(false);
  });
});

describe("스탭 분리", () => {
  const staff = app("staff", { bu: "스탭", teamId: "team-a", status: "배치" });
  const student = app("student", { teamId: "team-a", status: "배치" });

  it("스탭 여부는 bu로 판정한다", () => {
    expect(isStaffApplication(staff)).toBe(true);
    expect(isStaffApplication(student)).toBe(false);
  });

  it("학생과 스탭을 두 묶음으로 나누고 원래 순서를 유지한다", () => {
    const { students, staff: staffList } = splitStudentsAndStaff([student, staff, app("student2", { teamId: "t" })]);
    expect(students.map((item) => item.id)).toEqual(["student", "student2"]);
    expect(staffList.map((item) => item.id)).toEqual(["staff"]);
  });

  it("출석 명단에는 스탭이 남지만 수료 대상에서는 빠진다", () => {
    const applications = [student, staff];
    expect(semesterRoster(applications, "team").map((item) => item.id)).toEqual(["student", "staff"]);
    expect(completionRoster(applications, "team").map((item) => item.id)).toEqual(["student"]);
  });

  it("훈련 수료에서도 스탭은 제외된다", () => {
    const trainingStaff = app("trainingStaff", { bu: "스탭", trainingClassId: "tc1" });
    const trainingStudent = app("trainingStudent", { trainingClassId: "tc1" });
    expect(completionRoster([trainingStaff, trainingStudent], "training").map((item) => item.id))
      .toEqual(["trainingStudent"]);
  });
});
