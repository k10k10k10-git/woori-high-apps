import { describe, expect, it } from "vitest";
import { semesterRoster } from "./roster";
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
    app("training", { trainingOnly: true }),
    app("waiting"),
    app("cancelled", { trainingOnly: true, status: "취소" }),
  ];

  it("사역팀 명단에는 배치된 신청자만 포함한다", () => {
    expect(semesterRoster(applications, "team").map((item) => item.id)).toEqual(["assigned"]);
  });

  it("훈련만 신청 명단을 취소자와 분리한다", () => {
    expect(semesterRoster(applications, "trainingOnly").map((item) => item.id)).toEqual(["training"]);
  });
});
