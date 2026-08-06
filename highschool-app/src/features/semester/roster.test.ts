import { describe, expect, it } from "vitest";
import { isTrainingApplicant, semesterRoster } from "./roster";
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
