import { describe, expect, it } from "vitest";
import {
  ASSIGNABLE_RETREAT_ROLES,
  ASSIGNABLE_SEMESTER_ROLES,
  canAccessArea,
  canCreateRetreat,
  canDestroyRetreat,
  canDestroySemester,
  canEditArea,
  canManageRolesOf,
  canSeeSensitiveRetreat,
  canWriteStudentRoster,
  describeRoles,
  iguardScopeOf,
  resolveMinistryRoles,
  retreatEntryHref,
  type MinistryRoles,
  type RetreatRole,
  type SemesterRole,
} from "./accessPolicy";

function roles(semester: SemesterRole, retreat: RetreatRole): MinistryRoles {
  return { semester, retreat };
}

// ─── 학기 축 ──────────────────────────────────────────────────
// 합의한 권한표를 그대로 옮긴 것 — 이 표가 계약이다.
describe("학기 역할 — 학기·주일 화면", () => {
  const cases: Array<[SemesterRole, { semester: "none" | "read" | "write"; sunday: "none" | "read" | "write" }]> = [
    ["superAdmin", { semester: "write", sunday: "write" }],
    ["pastor", { semester: "write", sunday: "write" }],
    ["leader", { semester: "write", sunday: "write" }],
    ["adminTeam", { semester: "write", sunday: "write" }],
    ["barnabas", { semester: "read", sunday: "write" }],
    ["worship", { semester: "read", sunday: "read" }],
    ["praise", { semester: "read", sunday: "read" }],
    ["media", { semester: "read", sunday: "read" }],
    ["design", { semester: "read", sunday: "read" }],
    ["staff", { semester: "read", sunday: "read" }],
    ["none", { semester: "none", sunday: "none" }],
  ];

  for (const [role, expected] of cases) {
    it(`${role}: 학기 ${expected.semester} / 주일 ${expected.sunday}`, () => {
      const r = roles(role, "none");
      expect(canAccessArea("semester", r)).toBe(expected.semester !== "none");
      expect(canEditArea("semester", r)).toBe(expected.semester === "write");
      expect(canAccessArea("sunday", r)).toBe(expected.sunday !== "none");
      expect(canEditArea("sunday", r)).toBe(expected.sunday === "write");
    });
  }

  it("바나바팀은 주일을 편집하지만 학기는 조회만 한다", () => {
    const r = roles("barnabas", "fieldStaff");
    expect(canEditArea("sunday", r)).toBe(true);
    expect(canEditArea("semester", r)).toBe(false);
  });

  it("사역팀 4개는 주일을 편집하지 못한다", () => {
    for (const team of ["worship", "praise", "media", "design"] as const) {
      expect(canEditArea("sunday", roles(team, "fieldStaff"))).toBe(false);
    }
  });

  it("학기 삭제·아카이브는 통합관리자와 교역자만 가능하다", () => {
    const allowed = ASSIGNABLE_SEMESTER_ROLES.filter((role) => canDestroySemester(roles(role, "none")));
    expect(allowed).toEqual(["superAdmin", "pastor"]);
  });

  it("출석부 원장 반영은 현재 Rules(classes 쓰기=admins)에 맞춰 통합관리자만 가능하다", () => {
    const allowed = ASSIGNABLE_SEMESTER_ROLES.filter((role) => canWriteStudentRoster(roles(role, "none")));
    expect(allowed).toEqual(["superAdmin"]);
  });
});

// ─── 방학 축 ──────────────────────────────────────────────────
describe("방학 역할 — 수련회 행정·현장 화면", () => {
  const cases: Array<[RetreatRole, { admin: boolean; adminEdit: boolean; field: "none" | "execution" | "all"; sensitive: boolean }]> = [
    ["superAdmin", { admin: true, adminEdit: true, field: "all", sensitive: true }],
    ["pastor", { admin: true, adminEdit: true, field: "all", sensitive: true }],
    ["leader", { admin: true, adminEdit: false, field: "all", sensitive: false }],
    ["adminTeam", { admin: true, adminEdit: true, field: "execution", sensitive: true }],
    ["iguardTeam", { admin: true, adminEdit: false, field: "all", sensitive: false }],
    ["fieldStaff", { admin: false, adminEdit: false, field: "execution", sensitive: false }],
    ["none", { admin: false, adminEdit: false, field: "none", sensitive: false }],
  ];

  for (const [role, expected] of cases) {
    it(`${role}: 행정 ${expected.admin ? "접근" : "차단"} / 현장 ${expected.field}`, () => {
      const r = roles("none", role);
      expect(canAccessArea("retreat-admin", r)).toBe(expected.admin);
      expect(canEditArea("retreat-admin", r)).toBe(expected.adminEdit);
      expect(iguardScopeOf(r)).toBe(expected.field);
      expect(canSeeSensitiveRetreat(r)).toBe(expected.sensitive);
    });
  }

  it("스탭팀장은 민감정보(계좌·의료·주민번호)를 보지 못한다", () => {
    expect(canSeeSensitiveRetreat(roles("leader", "leader"))).toBe(false);
  });

  it("수련회 삭제·백업 복구는 통합관리자와 교역자만 가능하다", () => {
    const allowed = ASSIGNABLE_RETREAT_ROLES.filter((role) => canDestroyRetreat(roles("none", role)));
    expect(allowed).toEqual(["superAdmin", "pastor"]);
  });

  it("수련회 생성은 통합관리자·교역자·행정팀만 가능하다", () => {
    const allowed = ASSIGNABLE_RETREAT_ROLES.filter((role) => canCreateRetreat(roles("none", role)));
    expect(allowed).toEqual(["superAdmin", "pastor", "adminTeam"]);
  });

  it("스탭팀장·이가드팀은 행정을 조회만 한다 — 저장은 화면에서 잠근다", () => {
    for (const role of ["leader", "iguardTeam"] as const) {
      expect(canAccessArea("retreat-admin", roles("none", role))).toBe(true);
      expect(canEditArea("retreat-admin", roles("none", role))).toBe(false);
      // 민감 탭은 Rules가 막으므로 화면에서도 반드시 감춘다(권한 오류 방지)
      expect(canSeeSensitiveRetreat(roles("none", role))).toBe(false);
    }
  });

  it("이가드팀은 학기 화면을 열 수 없다", () => {
    expect(canAccessArea("semester", roles("none", "iguardTeam"))).toBe(false);
    expect(canAccessArea("sunday", roles("none", "iguardTeam"))).toBe(false);
  });
});

// ─── 두 축 조합 ───────────────────────────────────────────────
describe("두 축을 각자 적용한다", () => {
  it("학기=스탭팀장 / 방학=행정팀 — 화면마다 다른 역할이 적용된다", () => {
    const r = roles("leader", "adminTeam");
    expect(canEditArea("semester", r)).toBe(true);   // 스탭팀장
    expect(canDestroySemester(r)).toBe(false);       // 스탭팀장은 학기 삭제 불가
    expect(canEditArea("retreat-admin", r)).toBe(true); // 행정팀
    expect(canSeeSensitiveRetreat(r)).toBe(true);    // 행정팀은 민감정보 취급
    expect(iguardScopeOf(r)).toBe("execution");      // 행정팀은 현장 실행탭만
  });

  it("학기=찬양팀 / 방학=현장 스탭 — 대다수 스탭의 조합", () => {
    const r = roles("praise", "fieldStaff");
    expect(canAccessArea("semester", r)).toBe(true);
    expect(canEditArea("semester", r)).toBe(false);
    expect(canAccessArea("retreat-admin", r)).toBe(false);
    expect(iguardScopeOf(r)).toBe("execution");
  });

  it("한쪽만 있어도 홈에는 들어갈 수 있다", () => {
    expect(canAccessArea("home", roles("none", "fieldStaff"))).toBe(true);
    expect(canAccessArea("home", roles("staff", "none"))).toBe(true);
    expect(canAccessArea("home", roles("none", "none"))).toBe(false);
  });

  it("역할 배정은 통합관리자·교역자만 가능하다", () => {
    expect(canManageRolesOf(roles("superAdmin", "superAdmin"))).toBe(true);
    expect(canManageRolesOf(roles("pastor", "pastor"))).toBe(true);
    expect(canManageRolesOf(roles("leader", "adminTeam"))).toBe(false);
    expect(canManageRolesOf(roles("barnabas", "fieldStaff"))).toBe(false);
  });
});

// ─── DB 값 해석 (하위호환이 핵심) ─────────────────────────────
describe("resolveMinistryRoles — 기존 구성원이 권한을 잃지 않는다", () => {
  it("admins 노드가 최우선이다", () => {
    expect(resolveMinistryRoles({ isMainAdmin: true, hasRetreatAdmin: false, hasIguardMember: false }))
      .toEqual({ semester: "superAdmin", retreat: "superAdmin" });
  });

  it("새 필드가 없는 retreatAdmins는 기존 role을 두 축에 그대로 적용한다", () => {
    expect(resolveMinistryRoles({ isMainAdmin: false, hasRetreatAdmin: true, retreatAdminRole: "pastor", hasIguardMember: false }))
      .toEqual({ semester: "pastor", retreat: "pastor" });
    expect(resolveMinistryRoles({ isMainAdmin: false, hasRetreatAdmin: true, retreatAdminRole: "leader", hasIguardMember: false }))
      .toEqual({ semester: "leader", retreat: "leader" });
  });

  it("role 필드가 없는 레거시 retreatAdmins는 행정팀으로 본다", () => {
    expect(resolveMinistryRoles({ isMainAdmin: false, hasRetreatAdmin: true, hasIguardMember: false }))
      .toEqual({ semester: "adminTeam", retreat: "adminTeam" });
    expect(resolveMinistryRoles({ isMainAdmin: false, hasRetreatAdmin: true, retreatAdminRole: "이상한값", hasIguardMember: false }))
      .toEqual({ semester: "adminTeam", retreat: "adminTeam" });
  });

  it("레거시 스탭은 학기 조회 + 현장 실행을 그대로 유지한다", () => {
    const resolved = resolveMinistryRoles({ isMainAdmin: false, hasRetreatAdmin: false, hasIguardMember: true, iguardRole: "staff" });
    expect(resolved).toEqual({ semester: "staff", retreat: "fieldStaff" });
    expect(canAccessArea("semester", resolved)).toBe(true);
    expect(canEditArea("semester", resolved)).toBe(false);
    expect(iguardScopeOf(resolved)).toBe("execution");
  });

  it("레거시 이가드팀은 학기 접근 없이 현장 전체를 유지한다", () => {
    const resolved = resolveMinistryRoles({ isMainAdmin: false, hasRetreatAdmin: false, hasIguardMember: true, iguardRole: "team" });
    expect(resolved).toEqual({ semester: "none", retreat: "iguardTeam" });
    expect(iguardScopeOf(resolved)).toBe("all");
  });

  it("iguardRoles 값이 없으면 이가드팀으로 본다(레거시)", () => {
    expect(resolveMinistryRoles({ isMainAdmin: false, hasRetreatAdmin: false, hasIguardMember: true }))
      .toEqual({ semester: "none", retreat: "iguardTeam" });
  });

  it("새 필드가 있으면 그것을 우선한다", () => {
    expect(resolveMinistryRoles({
      isMainAdmin: false, hasRetreatAdmin: true, retreatAdminRole: "adminTeam", hasIguardMember: false,
      semesterRole: "barnabas", retreatRole: "fieldStaff",
    })).toEqual({ semester: "barnabas", retreat: "fieldStaff" });
  });

  it("새 필드로 통합관리자를 만들 수는 없다(admins 노드만 인정)", () => {
    expect(resolveMinistryRoles({
      isMainAdmin: false, hasRetreatAdmin: false, hasIguardMember: true, iguardRole: "staff",
      semesterRole: "superAdmin", retreatRole: "superAdmin",
    })).toEqual({ semester: "staff", retreat: "fieldStaff" });
  });

  it("망가진 값은 무시하고 레거시 파생을 쓴다", () => {
    expect(resolveMinistryRoles({
      isMainAdmin: false, hasRetreatAdmin: false, hasIguardMember: true, iguardRole: "staff",
      semesterRole: 42, retreatRole: { a: 1 },
    })).toEqual({ semester: "staff", retreat: "fieldStaff" });
  });

  it("아무 노드에도 없으면 권한 없음이다", () => {
    expect(resolveMinistryRoles({ isMainAdmin: false, hasRetreatAdmin: false, hasIguardMember: false }))
      .toEqual({ semester: "none", retreat: "none" });
  });
});

describe("표시·이동", () => {
  it("두 축이 같으면 한 이름으로, 다르면 둘 다 보여준다", () => {
    expect(describeRoles(roles("pastor", "pastor"))).toBe("교역자");
    expect(describeRoles(roles("leader", "adminTeam"))).toBe("학기 스탭팀장 · 방학 행정팀");
    expect(describeRoles(roles("none", "fieldStaff"))).toBe("방학 현장 스탭");
    expect(describeRoles(roles("praise", "none"))).toBe("학기 찬양팀");
  });

  it("행정 권한이 있으면 행정 화면으로, 아니면 현장 화면으로 연결한다", () => {
    expect(retreatEntryHref("summer 2026", roles("none", "adminTeam"))).toBe("/retreat/summer%202026");
    expect(retreatEntryHref("summer 2026", roles("praise", "fieldStaff"))).toBe("/retreat/summer%202026/field");
    // 조회만 가능한 역할은 현장이 주 사용처다
    expect(retreatEntryHref("summer 2026", roles("none", "iguardTeam"))).toBe("/retreat/summer%202026/field");
    expect(retreatEntryHref("summer 2026", roles("none", "leader"))).toBe("/retreat/summer%202026/field");
  });
});
