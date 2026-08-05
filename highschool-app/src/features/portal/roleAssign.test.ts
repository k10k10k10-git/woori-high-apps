import { describe, expect, it } from "vitest";
import { isDowngrade, planRoleAssignment, type MemberPresence } from "./roleAssign";

const nobody: MemberPresence = { mainAdmin: false, hasRetreatAdmin: false, hasIguardMember: false };

describe("planRoleAssignment", () => {
  it("신규 사용자에게 행정팀을 주면 retreatAdmins만 쓴다", () => {
    expect(planRoleAssignment("adminTeam", nobody)).toEqual([
      { kind: "setRetreatAdmin", role: "adminTeam" },
    ]);
  });

  it("행정팀 → 교역자는 role만 갱신한다", () => {
    expect(planRoleAssignment("pastor", { ...nobody, hasRetreatAdmin: true, retreatAdminRole: "adminTeam" }))
      .toEqual([{ kind: "setRetreatAdmin", role: "pastor" }]);
  });

  it("이미 같은 역할이면 아무것도 쓰지 않는다", () => {
    expect(planRoleAssignment("pastor", { ...nobody, hasRetreatAdmin: true, retreatAdminRole: "pastor" })).toEqual([]);
    expect(planRoleAssignment("staff", { ...nobody, hasIguardMember: true, iguardRole: "staff" })).toEqual([]);
    expect(planRoleAssignment("none", nobody)).toEqual([]);
  });

  it("행정팀 → 이가드팀은 이가드를 먼저 부여하고 행정을 해제한다", () => {
    expect(planRoleAssignment("iguardTeam", { ...nobody, hasRetreatAdmin: true, retreatAdminRole: "adminTeam" }))
      .toEqual([
        { kind: "setIguardMember", role: "team" },
        { kind: "removeRetreatAdmin" },
      ]);
  });

  it("스탭 → 이가드팀은 iguardRoles만 바꾼다", () => {
    expect(planRoleAssignment("iguardTeam", { ...nobody, hasIguardMember: true, iguardRole: "staff" }))
      .toEqual([{ kind: "setIguardMember", role: "team" }]);
  });

  it("통합관리자 배정은 admins를 켜고 하위 노드를 정리한다", () => {
    expect(planRoleAssignment("superAdmin", { ...nobody, hasRetreatAdmin: true, hasIguardMember: true }))
      .toEqual([
        { kind: "setMainAdmin", enabled: true },
        { kind: "removeRetreatAdmin" },
        { kind: "removeIguardMember" },
      ]);
  });

  it("통합관리자 → 행정팀 강등은 admins를 해제한다", () => {
    expect(planRoleAssignment("adminTeam", { ...nobody, mainAdmin: true }))
      .toEqual([
        { kind: "setRetreatAdmin", role: "adminTeam" },
        { kind: "setMainAdmin", enabled: false },
      ]);
  });

  it("권한 해제는 존재하는 노드만 지운다", () => {
    expect(planRoleAssignment("none", { mainAdmin: true, hasRetreatAdmin: true, hasIguardMember: true }))
      .toEqual([
        { kind: "setMainAdmin", enabled: false },
        { kind: "removeRetreatAdmin" },
        { kind: "removeIguardMember" },
      ]);
  });

  it("레거시 항목(role 없는 retreatAdmins)은 행정팀으로 보고 재기록하지 않는다", () => {
    expect(planRoleAssignment("adminTeam", { ...nobody, hasRetreatAdmin: true })).toEqual([]);
  });
});

describe("isDowngrade", () => {
  it("권한이 낮아질 때만 참이다", () => {
    expect(isDowngrade("superAdmin", "staff")).toBe(true);
    expect(isDowngrade("adminTeam", "none")).toBe(true);
    expect(isDowngrade("staff", "iguardTeam")).toBe(false);
    expect(isDowngrade("pastor", "pastor")).toBe(false);
  });
});
