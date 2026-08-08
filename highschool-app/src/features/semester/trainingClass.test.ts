import { describe, expect, it } from "vitest";
import { buildTrainingClassRemovalUpdates, trainingClassRemovalImpact } from "./trainingClass";
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

describe("trainingClassRemovalImpact", () => {
  it("해당 훈련 반에 배정된 인원을 센다", () => {
    const applications = [
      app("a", { trainingClassId: "tc1" }),
      app("b", { trainingClassId: "tc2" }),
      app("c", { trainingClassId: "tc1" }),
    ];
    expect(trainingClassRemovalImpact(applications, "tc1")).toEqual({ enrolled: 2 });
  });
});

describe("buildTrainingClassRemovalUpdates", () => {
  it("반 노드와 신청자 참조를 한 번의 루트 update로 정리한다", () => {
    const updates = buildTrainingClassRemovalUpdates("2026-2", "tc1", {
      "1_100": { studentId: "100", bu: "1부", grade: 1, class: 1, name: "가", status: "접수", createdAt: "", trainingClassId: "tc1" },
      "1_200": { studentId: "200", bu: "1부", grade: 1, class: 1, name: "나", status: "접수", createdAt: "", trainingClassId: "tc2" },
    });

    expect(updates).toEqual({
      "semesters/2026-2/trainingClasses/tc1": null,
      // 커리큘럼은 사역팀 삭제와 같이 함께 지운다 — 안 지우면 고아로 남는다
      "semesters/2026-2/curriculum/tc1": null,
      "semesters/2026-2/applications/1_100/trainingClassId": null,
    });
  });

  it("훈련 신청 사실(trainingOnly)은 지우지 않는다", () => {
    const updates = buildTrainingClassRemovalUpdates("2026-2", "tc1", {
      "1_100": { studentId: "100", bu: "1부", grade: 1, class: 1, name: "가", status: "접수", createdAt: "", trainingClassId: "tc1", trainingOnly: true },
    });
    expect(Object.keys(updates)).not.toContain("semesters/2026-2/applications/1_100/trainingOnly");
  });
});
