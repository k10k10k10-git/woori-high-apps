import { describe, expect, it } from "vitest";
import {
  accessibleTeamKeys,
  canAccessOperationsCenter,
  canEditTeam,
  normalizeTeamMemberships,
  ownTeamKey,
  semesterTeamForKey,
} from "./teamModel";

const leader = { semester: "leader", retreat: "leader" } as const;

describe("teamModel", () => {
  it("명시된 활성 팀만 소속으로 인정한다", () => {
    const memberships = normalizeTeamMemberships({
      media: { role: "leader", active: true },
      praise: { role: "staff", active: false },
      unknown: { role: "leader", active: true },
    });
    expect(accessibleTeamKeys(leader, memberships)).toEqual(["media"]);
    expect(ownTeamKey(leader, memberships)).toBe("media");
    expect(canEditTeam("media", leader, memberships)).toBe(true);
    expect(canEditTeam("praise", leader, memberships)).toBe(false);
  });

  it("조회자는 담당 팀을 볼 수 있지만 수정하지 못한다", () => {
    const memberships = normalizeTeamMemberships({ praise: { role: "viewer", active: true } });
    expect(accessibleTeamKeys(leader, memberships)).toEqual(["praise"]);
    expect(canEditTeam("praise", leader, memberships)).toBe(false);
  });

  it("학기 동적 팀 ID를 저장된 키 또는 이전 이름으로 연결한다", () => {
    const teams = [
      { id: "dynamic-1", name: "찬양팀", color: "", order: 0 },
      { id: "dynamic-2", name: "이름 변경", teamKey: "media", color: "", order: 1 },
    ] as const;
    expect(semesterTeamForKey(teams, "praise")?.id).toBe("dynamic-1");
    expect(semesterTeamForKey(teams, "media")?.id).toBe("dynamic-2");
  });

  it("팀이 연결된 팀장은 중앙 운영 대신 자기 팀 공간을 사용한다", () => {
    const memberships = normalizeTeamMemberships({ media: { role: "leader", active: true } });
    expect(canAccessOperationsCenter(leader, memberships)).toBe(false);
    expect(canAccessOperationsCenter({ semester: "adminTeam", retreat: "none" }, memberships)).toBe(true);
    expect(canAccessOperationsCenter({ semester: "superAdmin", retreat: "none" }, memberships)).toBe(true);
  });
});
