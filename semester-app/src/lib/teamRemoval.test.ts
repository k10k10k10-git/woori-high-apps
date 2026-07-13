import { describe, expect, it } from "vitest";
import { buildTeamRemovalUpdates, teamRemovalImpact } from "./teamRemoval";
import { Application } from "./types";

function app(id: string, over: Partial<Application> = {}): Application {
  return {
    id,
    studentId: id,
    bu: "1부",
    grade: 1,
    class: 1,
    name: id,
    status: "접수",
    createdAt: "2026-07-14T00:00:00.000Z",
    ...over,
  };
}

describe("팀 삭제 참조 정리", () => {
  it("배치·1/2지망 영향 인원을 각각 집계한다", () => {
    expect(teamRemovalImpact([
      app("a", { teamId: "t1", status: "배치", choice1: "t1" }),
      app("b", { choice2: "t1" }),
      app("c", { teamId: "t2", status: "배치" }),
    ], "t1")).toEqual({ assigned: 1, firstChoice: 1, secondChoice: 1 });
  });

  it("팀·커리큘럼·신청자 참조를 하나의 루트 update payload로 만든다", () => {
    const updates = buildTeamRemovalUpdates("2026-1", "t1", {
      a: app("a", { teamId: "t1", status: "배치", choice1: "t1" }),
      b: app("b", { teamId: "t1", status: "취소", choice2: "t1" }),
      c: app("c", { teamId: "t2", status: "배치" }),
    });

    expect(updates).toEqual({
      "semesters/2026-1/teams/t1": null,
      "semesters/2026-1/curriculum/t1": null,
      "semesters/2026-1/applications/a/teamId": null,
      "semesters/2026-1/applications/a/status": "접수",
      "semesters/2026-1/applications/a/choice1": null,
      "semesters/2026-1/applications/b/teamId": null,
      "semesters/2026-1/applications/b/choice2": null,
    });
  });
});
