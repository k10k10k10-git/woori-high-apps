import { describe, expect, it } from "vitest";
import { accessibleTeamKeys, canAccessTeam, canBrowseTeam } from "@/features/teams/teamModel";
import { canManageAnnualFinance, type MinistryRoles, type SemesterRole } from "./accessPolicy";

describe("연간 회계 접근 범위", () => {
  it("중앙 행정 계정은 행정·바나바 업무에 진입하고 찬양팀은 별도 배정이 필요하다", () => {
    const roles: MinistryRoles = { semester: "adminTeam", retreat: "none" };
    expect(accessibleTeamKeys(roles, {})).toEqual(["admin", "barnabas"]);
    expect(canBrowseTeam("admin", roles, {})).toBe(true);
    expect(canAccessTeam("admin", roles, {})).toBe(true);
    expect(canAccessTeam("praise", roles, {})).toBe(false);
  });
  it.each(["superAdmin", "pastor", "adminTeam"] as SemesterRole[])("중앙 학기 역할 %s만 허용한다", semester => {
    expect(canManageAnnualFinance({ semester, retreat: "none" })).toBe(true);
  });
  it.each(["leader", "staff", "praise", "worship", "barnabas", "media", "design", "none"] as SemesterRole[])("%s는 방학 행정 역할이 있어도 회계를 열지 않는다", semester => {
    expect(canManageAnnualFinance({ semester, retreat: "adminTeam" } as MinistryRoles)).toBe(false);
  });
});
