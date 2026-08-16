import { describe, expect, it } from "vitest";
import {
  ASSIGNABLE_RETREAT_ROLES,
  ASSIGNABLE_SEMESTER_ROLES,
  canAccessArea,
  canAccessSundayTeam,
  canCreateRetreat,
  canDestroyRetreat,
  canDestroySemester,
  canEditArea,
  canEditSundayTeam,
  canManageRolesOf,
  canManageSiteRequests,
  canSeeSensitiveRetreat,
  ownSundayTeam,
  canWriteStudentRoster,
  describeRoles,
  iguardScopeOf,
  roleBadgeLabel,
  resolveMinistryRoles,
  retreatEntryHref,
  type MinistryRoles,
  type RetreatRole,
  type SemesterRole,
} from "./accessPolicy";
import { SUNDAY_MINISTRY_TEAMS } from "./featureCatalog";

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
    // 사역팀은 자기 팀 하나만 열린다 — canAccessArea("sunday")는 "어느 팀이든 있는가"다.
    // 어느 팀인지는 아래 "주일 사역 - 팀 경계"가 검사한다.
    ["barnabas", { semester: "read", sunday: "write" }],
    ["worship", { semester: "read", sunday: "write" }],
    ["praise", { semester: "read", sunday: "write" }],
    ["media", { semester: "read", sunday: "write" }],
    ["design", { semester: "read", sunday: "write" }],
    // 팀 미배정은 주일에 들어갈 곳이 없다.
    ["staff", { semester: "read", sunday: "none" }],
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

  it("바나바팀은 주일 자기 팀을 편집하지만 학기는 조회만 한다", () => {
    const r = roles("barnabas", "fieldStaff");
    expect(canEditSundayTeam("barnabas", r)).toBe(true);
    expect(canEditArea("semester", r)).toBe(false);
  });

  it("사역팀 4개는 자기 팀만 편집하고 남의 팀은 열지 못한다", () => {
    for (const team of ["worship", "praise", "media", "design"] as const) {
      const r = roles(team, "fieldStaff");
      expect(canEditSundayTeam(team, r)).toBe(true);
      expect(canAccessSundayTeam("barnabas", r)).toBe(false);
    }
  });

  it("학기 삭제·아카이브는 통합관리자와 교역자만 가능하다", () => {
    const allowed = ASSIGNABLE_SEMESTER_ROLES.filter((role) => canDestroySemester(roles(role, "none")));
    expect(allowed).toEqual(["superAdmin", "pastor"]);
  });

  it("출석부 원장 반영은 통합관리자와 행정팀만 가능하다 (2026-08-12 Rules 보강)", () => {
    const allowed = ASSIGNABLE_SEMESTER_ROLES.filter((role) => canWriteStudentRoster(roles(role, "none")));
    expect(allowed).toEqual(["superAdmin", "adminTeam"]);
  });

  it("교역자·스탭팀장·바나바팀은 출석부 원장을 쓰지 못한다", () => {
    for (const role of ["pastor", "leader", "barnabas", "worship", "staff"] as const) {
      expect(canWriteStudentRoster(roles(role, "none"))).toBe(false);
    }
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
  it("사이트 요청함은 통합관리자에게만 열린다", () => {
    expect(canManageSiteRequests(roles("superAdmin", "superAdmin"))).toBe(true);
    expect(canManageSiteRequests(roles("pastor", "pastor"))).toBe(false);
    expect(canManageSiteRequests(roles("adminTeam", "adminTeam"))).toBe(false);
  });

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

  it("이름 옆 배지는 학기·방학 구분 없이 역할 이름만 보여준다", () => {
    expect(roleBadgeLabel(roles("leader", "adminTeam"))).toBe("스탭팀장 및 행정팀");
    expect(roleBadgeLabel(roles("adminTeam", "adminTeam"))).toBe("행정팀");
    expect(roleBadgeLabel(roles("praise", "fieldStaff"))).toBe("찬양팀 및 현장 스탭");
    expect(roleBadgeLabel(roles("none", "iguardTeam"))).toBe("이가드팀");
    expect(roleBadgeLabel(roles("barnabas", "none"))).toBe("바나바팀");
    expect(roleBadgeLabel(roles("none", "none"))).toBe("권한 없음");
  });

  it("행정 권한이 있으면 행정 화면으로, 아니면 현장 화면으로 연결한다", () => {
    expect(retreatEntryHref("summer 2026", roles("none", "adminTeam"))).toBe("/retreat/summer%202026");
    expect(retreatEntryHref("summer 2026", roles("praise", "fieldStaff"))).toBe("/retreat/summer%202026/field");
    // 조회만 가능한 역할은 현장이 주 사용처다
    expect(retreatEntryHref("summer 2026", roles("none", "iguardTeam"))).toBe("/retreat/summer%202026/field");
    expect(retreatEntryHref("summer 2026", roles("none", "leader"))).toBe("/retreat/summer%202026/field");
  });
});

describe("주일 사역 - 팀 경계", () => {
  const semester = (role: SemesterRole): MinistryRoles => ({ semester: role, retreat: "none" });

  it("사역팀은 자기 팀만 열리고 옆 팀은 조회도 안 된다", () => {
    const worship = semester("worship");
    expect(canAccessSundayTeam("worship", worship)).toBe(true);
    expect(canEditSundayTeam("worship", worship)).toBe(true);
    for (const other of ["barnabas", "praise", "media", "design", "admin"] as const) {
      expect(canAccessSundayTeam(other, worship)).toBe(false);
      expect(canEditSundayTeam(other, worship)).toBe(false);
    }
  });

  it("바나바팀도 같은 규칙을 받는다 - 예배팀 자리 배치가 보이지 않는다", () => {
    const barnabas = semester("barnabas");
    expect(canEditSundayTeam("barnabas", barnabas)).toBe(true);
    expect(canAccessSundayTeam("worship", barnabas)).toBe(false);
  });

  it("행정팀·스탭팀장·교역자·통합관리자는 팀 경계 없이 전부 쓴다", () => {
    for (const role of ["adminTeam", "leader", "pastor", "superAdmin"] as const) {
      const roles = semester(role);
      expect(ownSundayTeam(roles)).toBeNull();
      for (const team of ["admin", "barnabas", "worship", "praise", "media", "design"] as const) {
        expect(canAccessSundayTeam(team, roles)).toBe(true);
        expect(canEditSundayTeam(team, roles)).toBe(true);
      }
    }
  });

  it("팀이 배정되지 않으면 주일에 들어가지 못한다", () => {
    for (const role of ["staff", "none"] as const) {
      const roles = semester(role);
      expect(canAccessArea("sunday", roles)).toBe(false);
      expect(ownSundayTeam(roles)).toBeNull();
      expect(canAccessSundayTeam("worship", roles)).toBe(false);
    }
    // 방학 역할만 있는 사람(이가드팀)도 주일은 닫힌다.
    expect(canAccessArea("sunday", { semester: "none", retreat: "iguardTeam" })).toBe(false);
  });

  it("사역팀도 주일 하나로 홈에는 들어간다 - 로그인은 되는데 갈 곳이 없으면 안 된다", () => {
    expect(canAccessArea("home", semester("worship"))).toBe(true);
  });

  it("팀 키는 카탈로그와 일치한다", () => {
    // 여기가 어긋나면 메뉴에서 팀이 통째로 사라진다.
    const owned = ASSIGNABLE_SEMESTER_ROLES.map((role) => ownSundayTeam({ semester: role, retreat: "none" }))
      .filter((team): team is NonNullable<typeof team> => team !== null);
    const catalog = SUNDAY_MINISTRY_TEAMS.map((team) => team.key);
    for (const team of owned) expect(catalog).toContain(team);
  });
});
