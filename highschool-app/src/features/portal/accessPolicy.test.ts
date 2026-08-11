import { describe, expect, it } from "vitest";
import {
  ASSIGNABLE_ROLES,
  canAccessPortalArea,
  canEditPortalArea,
  canManageRoles,
  canWriteStudentRoster,
  iguardScope,
  MINISTRY_ROLE_LABELS,
  resolveMinistryRole,
  retreatEntryHref,
  type MinistryRole,
  type PortalArea,
} from "./accessPolicy";

type Expectation = {
  access: Record<PortalArea, boolean>;
  edit: Record<PortalArea, boolean>;
  field: "none" | "execution" | "all";
  manageRoles: boolean;
};

// Step1 요구 표를 그대로 옮긴 것 — 이 표가 권한의 계약이다.
const MATRIX: Record<MinistryRole, Expectation> = {
  superAdmin: {
    access: { home: true, semester: true, "retreat-admin": true, "retreat-field": true },
    edit: { home: true, semester: true, "retreat-admin": true, "retreat-field": true },
    field: "all",
    manageRoles: true,
  },
  pastor: {
    access: { home: true, semester: true, "retreat-admin": true, "retreat-field": true },
    edit: { home: true, semester: true, "retreat-admin": true, "retreat-field": true },
    field: "all",
    manageRoles: false,
  },
  leader: {
    access: { home: true, semester: true, "retreat-admin": true, "retreat-field": true },
    edit: { home: true, semester: true, "retreat-admin": true, "retreat-field": true },
    field: "all",
    manageRoles: false,
  },
  adminTeam: {
    access: { home: true, semester: true, "retreat-admin": true, "retreat-field": true },
    edit: { home: true, semester: true, "retreat-admin": true, "retreat-field": true },
    field: "execution",
    manageRoles: false,
  },
  iguardTeam: {
    access: { home: true, semester: false, "retreat-admin": false, "retreat-field": true },
    edit: { home: true, semester: false, "retreat-admin": false, "retreat-field": true },
    field: "all",
    manageRoles: false,
  },
  staff: {
    access: { home: true, semester: true, "retreat-admin": false, "retreat-field": true },
    edit: { home: true, semester: false, "retreat-admin": false, "retreat-field": true },
    field: "execution",
    manageRoles: false,
  },
  none: {
    access: { home: false, semester: false, "retreat-admin": false, "retreat-field": false },
    edit: { home: false, semester: false, "retreat-admin": false, "retreat-field": false },
    field: "none",
    manageRoles: false,
  },
};

describe("6단계 역할 권한 표", () => {
  for (const [role, expected] of Object.entries(MATRIX) as Array<[MinistryRole, Expectation]>) {
    it(`${MINISTRY_ROLE_LABELS[role]}의 영역 접근·수정 권한`, () => {
      for (const [area, allowed] of Object.entries(expected.access) as Array<[PortalArea, boolean]>) {
        expect(canAccessPortalArea(area, role)).toBe(allowed);
      }
      for (const [area, allowed] of Object.entries(expected.edit) as Array<[PortalArea, boolean]>) {
        expect(canEditPortalArea(area, role)).toBe(allowed);
      }
      expect(iguardScope(role)).toBe(expected.field);
      expect(canManageRoles(role)).toBe(expected.manageRoles);
    });
  }

  it("역할 배정은 통합관리자만 가능하다", () => {
    const managers = ASSIGNABLE_ROLES.filter(canManageRoles);
    expect(managers).toEqual(["superAdmin"]);
  });

  it("학생 출석부 원장 반영은 현재 Rules에 맞춰 통합관리자만 가능하다", () => {
    const writers = ASSIGNABLE_ROLES.filter(canWriteStudentRoster);
    expect(writers).toEqual(["superAdmin"]);
  });

  it("스탭은 학기 화면을 보되 수정하지 못한다", () => {
    expect(canAccessPortalArea("semester", "staff")).toBe(true);
    expect(canEditPortalArea("semester", "staff")).toBe(false);
  });

  it("이가드팀은 행정 화면에 접근하지 못한다", () => {
    expect(canAccessPortalArea("retreat-admin", "iguardTeam")).toBe(false);
    expect(canAccessPortalArea("semester", "iguardTeam")).toBe(false);
  });

  it("행정팀은 이가드 실행탭만 사용한다", () => {
    expect(iguardScope("adminTeam")).toBe("execution");
  });
});

describe("resolveMinistryRole", () => {
  it("admins 노드가 최우선이다", () => {
    expect(resolveMinistryRole({ isMainAdmin: true, hasRetreatAdmin: false, hasIguardMember: false }))
      .toBe("superAdmin");
  });

  it("retreatAdmins의 role 필드로 교역자·팀장·행정팀을 구분한다", () => {
    expect(resolveMinistryRole({ isMainAdmin: false, hasRetreatAdmin: true, retreatAdminRole: "pastor", hasIguardMember: false })).toBe("pastor");
    expect(resolveMinistryRole({ isMainAdmin: false, hasRetreatAdmin: true, retreatAdminRole: "leader", hasIguardMember: false })).toBe("leader");
    expect(resolveMinistryRole({ isMainAdmin: false, hasRetreatAdmin: true, retreatAdminRole: "adminTeam", hasIguardMember: false })).toBe("adminTeam");
  });

  it("role 필드가 없는 레거시 retreatAdmins는 행정팀으로 본다", () => {
    expect(resolveMinistryRole({ isMainAdmin: false, hasRetreatAdmin: true, hasIguardMember: false })).toBe("adminTeam");
    expect(resolveMinistryRole({ isMainAdmin: false, hasRetreatAdmin: true, retreatAdminRole: "이상한값", hasIguardMember: false })).toBe("adminTeam");
  });

  it("iguardRoles로 이가드팀과 스탭을 구분하고, 값이 없으면 이가드팀이다", () => {
    expect(resolveMinistryRole({ isMainAdmin: false, hasRetreatAdmin: false, hasIguardMember: true, iguardRole: "staff" })).toBe("staff");
    expect(resolveMinistryRole({ isMainAdmin: false, hasRetreatAdmin: false, hasIguardMember: true, iguardRole: "team" })).toBe("iguardTeam");
    expect(resolveMinistryRole({ isMainAdmin: false, hasRetreatAdmin: false, hasIguardMember: true })).toBe("iguardTeam");
  });

  it("아무 노드에도 없으면 권한 없음이다", () => {
    expect(resolveMinistryRole({ isMainAdmin: false, hasRetreatAdmin: false, hasIguardMember: false })).toBe("none");
  });
});

describe("retreatEntryHref", () => {
  it("행정 권한이 있으면 행정 화면으로 연결한다", () => {
    expect(retreatEntryHref("summer 2026", "adminTeam")).toBe("/retreat/summer%202026");
  });

  it("이가드 전용 계정은 현장 화면으로 연결한다", () => {
    expect(retreatEntryHref("summer 2026", "staff")).toBe("/retreat/summer%202026/field");
    expect(retreatEntryHref("summer 2026", "iguardTeam")).toBe("/retreat/summer%202026/field");
  });
});
