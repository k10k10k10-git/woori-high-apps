import { describe, expect, it } from "vitest";
import { desiredStateFor, planRoleAssignment, type MemberPresence } from "./roleAssign";
import type { MinistryRoles, RetreatRole, SemesterRole } from "./accessPolicy";

const nobody: MemberPresence = { mainAdmin: false, hasRetreatAdmin: false, hasIguardMember: false };

function roles(semester: SemesterRole, retreat: RetreatRole): MinistryRoles {
  return { semester, retreat };
}

describe("desiredStateFor — 두 축 역할이 어느 노드로 저장되는가", () => {
  it("어느 쪽이든 통합관리자면 admins만 쓴다", () => {
    expect(desiredStateFor(roles("superAdmin", "superAdmin")))
      .toEqual({ mainAdmin: true, retreatAdmin: null, iguard: null });
  });

  it("학기 편집이 필요한 역할은 retreatAdmins에 들어간다 (semesters 쓰기 = admins·retreatAdmins)", () => {
    for (const role of ["pastor", "leader", "adminTeam", "barnabas"] as const) {
      expect(desiredStateFor(roles(role, "fieldStaff")).retreatAdmin).not.toBeNull();
    }
  });

  it("사역팀 4개는 iguardMembers면 충분하다 (학기 조회만)", () => {
    for (const role of ["worship", "praise", "media", "design"] as const) {
      expect(desiredStateFor(roles(role, "fieldStaff")))
        .toEqual({ mainAdmin: false, retreatAdmin: null, iguard: "staff" });
    }
  });

  it("두 축 중 높은 행정 계열이 레거시 role 값이 된다", () => {
    expect(desiredStateFor(roles("praise", "adminTeam")).retreatAdmin).toBe("adminTeam");
    expect(desiredStateFor(roles("leader", "adminTeam")).retreatAdmin).toBe("leader");
    expect(desiredStateFor(roles("barnabas", "pastor")).retreatAdmin).toBe("pastor");
    expect(desiredStateFor(roles("barnabas", "fieldStaff")).retreatAdmin).toBe("adminTeam");
  });

  it("이가드팀만 iguardRoles=team, 나머지 현장 계열은 staff다", () => {
    expect(desiredStateFor(roles("none", "iguardTeam")).iguard).toBe("team");
    expect(desiredStateFor(roles("none", "fieldStaff")).iguard).toBe("staff");
    expect(desiredStateFor(roles("staff", "none")).iguard).toBe("staff");
  });

  it("양쪽 다 없으면 어떤 노드에도 넣지 않는다", () => {
    expect(desiredStateFor(roles("none", "none")))
      .toEqual({ mainAdmin: false, retreatAdmin: null, iguard: null });
  });
});

describe("planRoleAssignment", () => {
  it("신규 사용자에게 행정팀을 주면 retreatAdmins만 쓴다", () => {
    const target = roles("adminTeam", "adminTeam");
    expect(planRoleAssignment(target, nobody)).toEqual([
      { kind: "setRetreatAdmin", role: "adminTeam", roles: target },
    ]);
  });

  it("두 축 역할이 함께 저장된다", () => {
    const target = roles("leader", "adminTeam");
    const steps = planRoleAssignment(target, nobody);
    expect(steps).toEqual([{ kind: "setRetreatAdmin", role: "leader", roles: target }]);
  });

  it("이미 같은 두 축 역할이면 아무것도 쓰지 않는다", () => {
    const current = roles("pastor", "pastor");
    expect(planRoleAssignment(current, {
      ...nobody, hasRetreatAdmin: true, retreatAdminRole: "pastor", roles: current,
    })).toEqual([]);
    expect(planRoleAssignment(roles("none", "none"), nobody)).toEqual([]);
  });

  it("같은 버킷이어도 축 하나만 바뀌면 다시 기록한다", () => {
    const current = roles("leader", "leader");
    const target = roles("leader", "adminTeam");
    expect(planRoleAssignment(target, {
      ...nobody, hasRetreatAdmin: true, retreatAdminRole: "leader", roles: current,
    })).toEqual([{ kind: "setRetreatAdmin", role: "leader", roles: target }]);
  });

  it("행정 계열 → 현장 계열은 이가드를 먼저 부여하고 행정을 해제한다", () => {
    const target = roles("none", "iguardTeam");
    expect(planRoleAssignment(target, { ...nobody, hasRetreatAdmin: true, retreatAdminRole: "adminTeam" }))
      .toEqual([
        { kind: "setIguardMember", role: "team", roles: target },
        { kind: "removeRetreatAdmin" },
      ]);
  });

  it("현장 스탭 → 이가드팀은 iguardRoles만 바꾼다", () => {
    const target = roles("none", "iguardTeam");
    expect(planRoleAssignment(target, { ...nobody, hasIguardMember: true, iguardRole: "staff" }))
      .toEqual([{ kind: "setIguardMember", role: "team", roles: target }]);
  });

  it("통합관리자 배정은 admins를 켜고 하위 노드를 정리한다", () => {
    expect(planRoleAssignment(roles("superAdmin", "superAdmin"), { ...nobody, hasRetreatAdmin: true, hasIguardMember: true }))
      .toEqual([
        { kind: "setMainAdmin", enabled: true },
        { kind: "removeRetreatAdmin" },
        { kind: "removeIguardMember" },
      ]);
  });

  it("통합관리자 → 행정팀 강등은 부여를 먼저, admins 해제를 나중에 한다", () => {
    const target = roles("adminTeam", "adminTeam");
    expect(planRoleAssignment(target, { ...nobody, mainAdmin: true }))
      .toEqual([
        { kind: "setRetreatAdmin", role: "adminTeam", roles: target },
        { kind: "setMainAdmin", enabled: false },
      ]);
  });

  it("권한 해제는 존재하는 노드만 지운다", () => {
    expect(planRoleAssignment(roles("none", "none"), { mainAdmin: true, hasRetreatAdmin: true, hasIguardMember: true }))
      .toEqual([
        { kind: "setMainAdmin", enabled: false },
        { kind: "removeRetreatAdmin" },
        { kind: "removeIguardMember" },
      ]);
  });

  it("찬양팀 + 현장 스탭(대다수 조합)은 iguardMembers에만 들어간다", () => {
    const target = roles("praise", "fieldStaff");
    expect(planRoleAssignment(target, nobody))
      .toEqual([{ kind: "setIguardMember", role: "staff", roles: target }]);
  });
});
