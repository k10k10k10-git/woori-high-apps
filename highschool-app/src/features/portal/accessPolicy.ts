import type { SundayTeamKey } from "./featureCatalog";

/**
 * 통합 앱의 역할·화면 접근 계약 (단일 원천).
 *
 * 역할은 **두 축**이다. 한 사람이 학기 역할과 방학 역할을 동시에 갖고,
 * 화면이 자기 영역에 맞는 축을 골라 쓴다 — "지금이 학기인가"를 따지지 않는다.
 * (수련회 준비는 학기 중에 시작하고, 개학 후에도 정산이 남는다.)
 *
 *   학기 역할 → 학기 사역·주일 사역 화면
 *   방학 역할 → 수련회 행정·수련회 현장 화면
 *   공통 화면(홈·공유 일정·통합검색) → 두 축 중 높은 쪽
 *
 * DB 저장 형태 (Rules 변경 없음 — 기존 세 노드를 그대로 쓴다):
 *   통합관리자        : admins/{uid} === true
 *   행정 계열·바나바  : retreatAdmins/{uid} = { …, semesterRole, retreatRole }
 *   이가드·사역팀     : iguardMembers/{uid} = { …, semesterRole, retreatRole } + iguardRoles/{uid}
 *
 * ⚠ Rules는 여전히 세 버킷(admins / retreatAdmins / iguardMembers)만 구분한다.
 *   여기서 정의하는 15종 역할은 **화면 게이트**다. 그래서 원칙이 하나 있다 —
 *   **화면에서 막는 것은 언제나 안전하지만, 화면에서 여는 것은 Rules가 허용할 때만 한다.**
 *   (Rules가 막는 걸 화면에서 열면 "눌렀는데 실패"가 된다.)
 */

// ── 역할 ──────────────────────────────────────────────────────

/** 학기 사역·주일 사역 화면에 적용되는 역할 */
export type SemesterRole =
  | "none"
  | "staff"       // 사역팀(팀 미지정) — 레거시 스탭이 여기로 들어온다
  | "worship"     // 예배팀
  | "praise"      // 찬양팀
  | "media"       // 미디어팀
  | "design"      // 기획디자인팀
  | "barnabas"    // 바나바팀
  | "adminTeam"   // 행정팀
  | "leader"      // 스탭팀장
  | "pastor"      // 교역자
  | "superAdmin"; // 통합관리자

/** 수련회 행정·현장 화면에 적용되는 역할 */
export type RetreatRole =
  | "none"
  | "fieldStaff"  // 현장 스탭
  | "iguardTeam"  // 이가드팀
  | "adminTeam"   // 행정팀
  | "leader"      // 스탭팀장
  | "pastor"      // 교역자
  | "superAdmin"; // 통합관리자

export type MinistryRoles = { semester: SemesterRole; retreat: RetreatRole };

export const NO_ROLES: MinistryRoles = { semester: "none", retreat: "none" };

export const SEMESTER_ROLE_LABELS: Record<SemesterRole, string> = {
  superAdmin: "통합관리자",
  pastor: "교역자",
  leader: "스탭팀장",
  adminTeam: "행정팀",
  barnabas: "바나바팀",
  worship: "예배팀",
  praise: "찬양팀",
  media: "미디어팀",
  design: "기획디자인팀",
  staff: "사역팀(미지정)",
  none: "권한 없음",
};

export const RETREAT_ROLE_LABELS: Record<RetreatRole, string> = {
  superAdmin: "통합관리자",
  pastor: "교역자",
  leader: "스탭팀장",
  adminTeam: "행정팀",
  iguardTeam: "이가드팀",
  fieldStaff: "현장 스탭",
  none: "권한 없음",
};

/** 배정 화면의 표시 순서(높은 권한 → 낮은 권한) */
export const ASSIGNABLE_SEMESTER_ROLES = [
  "superAdmin", "pastor", "leader", "adminTeam",
  "barnabas", "worship", "praise", "media", "design", "staff", "none",
] as const satisfies readonly SemesterRole[];

export const ASSIGNABLE_RETREAT_ROLES = [
  "superAdmin", "pastor", "leader", "adminTeam", "iguardTeam", "fieldStaff", "none",
] as const satisfies readonly RetreatRole[];

export const SEMESTER_ROLE_HINTS: Record<SemesterRole, string> = {
  superAdmin: "학기·주일 전체 + 출석부 반영",
  pastor: "학기·주일 전체 (출석부 반영 제외)",
  leader: "학기·주일 수정 (학기 삭제 제외)",
  adminTeam: "학기·주일 행정팀 수정, 다른 주일팀 조회",
  barnabas: "주일 바나바팀 수정, 학기는 조회",
  worship: "주일 예배팀 수정, 학기는 조회",
  praise: "주일 찬양팀 수정(기능 준비 중), 학기는 조회",
  media: "주일 미디어팀 수정(기능 준비 중), 학기는 조회",
  design: "주일 기획디자인팀 수정(기능 준비 중), 학기는 조회",
  staff: "학기 조회만 · 주일 팀 미배정",
  none: "접근 불가",
};

export const RETREAT_ROLE_HINTS: Record<RetreatRole, string> = {
  superAdmin: "행정·현장 전체 + 삭제·복구",
  pastor: "행정·현장 전체 + 삭제·복구",
  leader: "행정 조회, 현장 전체",
  adminTeam: "행정 전체 + 민감정보, 현장 실행",
  iguardTeam: "현장 실행·기획 (행정 제외)",
  fieldStaff: "현장 실행탭만",
  none: "접근 불가",
};

// ── 능력표 ────────────────────────────────────────────────────

export type PortalArea = "home" | "semester" | "sunday" | "retreat-admin" | "retreat-field";
export type AreaPermission = "none" | "read" | "write";
/** execution은 이가드 "실행" 탭만 허용하는 부분 접근이다. */
export type IguardScope = "none" | "execution" | "all";

type SemesterCapability = {
  semester: AreaPermission;
  /**
   * **다른 팀까지 포함한** 주일 사역 권한.
   * 사역팀은 여기가 "none"이고 아래 `sundayTeam`으로 자기 팀만 연다 — 옆 팀 화면은
   * 보이지도 않는다. 남의 팀 명단·자리표가 서로 보일 이유가 없다.
   */
  sunday: AreaPermission;
  /** 자기 팀 하나만 쓰기로 여는 경우의 팀 키. 전체 권한이면 null. */
  sundayTeam: SundayTeamKey | null;
  /** 팀·훈련 반·회차 생성 등 학기 설정 */
  settings: boolean;
  /** 학기 삭제·아카이브 (되돌릴 수 없음) */
  destructive: boolean;
  /** 새친구 → 학생 원장 반영·등반 취소 */
  rosterWrite: boolean;
  /** 인물 통합검색 */
  search: AreaPermission;
  /** 다른 사람의 역할을 바꿀 수 있는가 */
  manageRoles: boolean;
};

type RetreatCapability = {
  admin: AreaPermission;
  /** 취소환불 계좌·의료 일지·주민번호(retreatsPrivate 계열) */
  sensitive: boolean;
  field: IguardScope;
  createRetreat: boolean;
  /** 수련회 삭제·백업 복구 */
  destructive: boolean;
  managePin: boolean;
  manageRoles: boolean;
};

const SEMESTER_CAPS: Record<SemesterRole, SemesterCapability> = {
  superAdmin: { semester: "write", sunday: "write", sundayTeam: null, settings: true, destructive: true, rosterWrite: true, search: "write", manageRoles: true },
  pastor:     { semester: "write", sunday: "write", sundayTeam: null, settings: true, destructive: true, rosterWrite: false, search: "write", manageRoles: false },
  leader:     { semester: "write", sunday: "write", sundayTeam: null, settings: true, destructive: false, rosterWrite: false, search: "read", manageRoles: false },
  // 행정팀의 출석부 반영은 2026-08-12 Rules 보강으로 열렸다 —
  // classes/attendance/trash의 **학생 1명 경로**만 `semesterRole === "adminTeam"`에게 허용된다.
  // 반 노드 전체(students 통째·teacher)는 여전히 통합관리자·담임만 쓴다.
  // 주일은 모든 팀을 조회하되 행정팀 화면만 수정한다. 다른 팀의 실무 데이터까지
  // 행정팀이 바꾸는 권한은 운영상 필요하지 않으므로 최소 권한으로 닫는다.
  adminTeam:  { semester: "write", sunday: "read", sundayTeam: "admin", settings: true, destructive: false, rosterWrite: true, search: "read", manageRoles: false },
  // ── 사역팀 계열: 주일은 자기 팀 하나만 쓰고, 옆 팀은 보이지도 않는다 ──
  // 팀마다 저장 노드가 달라 Rules 근거도 다르다.
  //   바나바팀 → semesters      : retreatAdmins 버킷이라 이미 쓰기 가능
  //   예배팀   → prepMilestones : iguardMembers/{uid}/sundayWrite === true 로 열린다
  //   찬양·미디어·기획디자인     : 아직 탭이 없어 쓸 노드도 없다
  barnabas:   { semester: "read", sunday: "none", sundayTeam: "barnabas", settings: false, destructive: false, rosterWrite: false, search: "none", manageRoles: false },
  worship:    { semester: "read", sunday: "none", sundayTeam: "worship", settings: false, destructive: false, rosterWrite: false, search: "none", manageRoles: false },
  praise:     { semester: "read", sunday: "none", sundayTeam: "praise", settings: false, destructive: false, rosterWrite: false, search: "none", manageRoles: false },
  media:      { semester: "read", sunday: "none", sundayTeam: "media", settings: false, destructive: false, rosterWrite: false, search: "none", manageRoles: false },
  design:     { semester: "read", sunday: "none", sundayTeam: "design", settings: false, destructive: false, rosterWrite: false, search: "none", manageRoles: false },
  // 팀이 정해지지 않았으면 주일에서 볼 화면이 없다 — 메뉴 자체를 닫는다.
  staff:      { semester: "read", sunday: "none", sundayTeam: null, settings: false, destructive: false, rosterWrite: false, search: "none", manageRoles: false },
  none:       { semester: "none", sunday: "none", sundayTeam: null, settings: false, destructive: false, rosterWrite: false, search: "none", manageRoles: false },
};

const RETREAT_CAPS: Record<RetreatRole, RetreatCapability> = {
  superAdmin: { admin: "write", sensitive: true, field: "all", createRetreat: true, destructive: true, managePin: true, manageRoles: true },
  pastor:     { admin: "write", sensitive: true, field: "all", createRetreat: true, destructive: true, managePin: true, manageRoles: false },
  // 조회 전용 — RetreatEditProvider + <fieldset disabled>가 화면에서 저장을 잠근다.
  leader:     { admin: "read", sensitive: false, field: "all", createRetreat: false, destructive: false, managePin: false, manageRoles: false },
  adminTeam:  { admin: "write", sensitive: true, field: "execution", createRetreat: true, destructive: false, managePin: true, manageRoles: false },
  // 이가드팀도 행정 명단을 조회한다. 민감 탭(retreatsPrivate)은 Rules가 막으므로
  // sensitive:false로 탭 자체를 감춰야 권한 오류가 나지 않는다.
  iguardTeam: { admin: "read", sensitive: false, field: "all", createRetreat: false, destructive: false, managePin: true, manageRoles: false },
  fieldStaff: { admin: "none", sensitive: false, field: "execution", createRetreat: false, destructive: false, managePin: false, manageRoles: false },
  none:       { admin: "none", sensitive: false, field: "none", createRetreat: false, destructive: false, managePin: false, manageRoles: false },
};

// ── 판정 ──────────────────────────────────────────────────────

function permissionFor(area: PortalArea, roles: MinistryRoles): AreaPermission {
  const sem = SEMESTER_CAPS[roles.semester];
  const ret = RETREAT_CAPS[roles.retreat];
  if (area === "semester") return sem.semester;
  // 사역팀은 sunday가 "none"이어도 자기 팀이 있으면 주일에 들어간다.
  if (area === "sunday") return sem.sunday !== "none" ? sem.sunday : sem.sundayTeam ? "write" : "none";
  if (area === "retreat-admin") return ret.admin;
  if (area === "retreat-field") return ret.field === "none" ? "none" : "write";
  // home — 어느 한 영역이라도 열려 있으면 진입 가능
  const anyArea = sem.semester !== "none" || sem.sunday !== "none" || sem.sundayTeam !== null
    || ret.admin !== "none" || ret.field !== "none";
  return anyArea ? "write" : "none";
}

export function canAccessArea(area: PortalArea, roles: MinistryRoles): boolean {
  return permissionFor(area, roles) !== "none";
}

/** 저장·수정 가능 여부. 사역팀의 학기 화면처럼 "보기만" 되는 조합을 구분한다. */
export function canEditArea(area: PortalArea, roles: MinistryRoles): boolean {
  return permissionFor(area, roles) === "write";
}

/**
 * 주일 사역에서 이 사람이 들어갈 수 있는 팀인가.
 * 사역팀은 자기 팀 하나만 참이다 — 옆 팀은 메뉴에서도 빠지고 주소를 직접 쳐도 막힌다.
 */
export function canAccessSundayTeam(team: SundayTeamKey, roles: MinistryRoles): boolean {
  const sem = SEMESTER_CAPS[roles.semester];
  return sem.sunday !== "none" || sem.sundayTeam === team;
}

/** 그 팀 화면을 저장까지 할 수 있는가. */
export function canEditSundayTeam(team: SundayTeamKey, roles: MinistryRoles): boolean {
  const sem = SEMESTER_CAPS[roles.semester];
  return sem.sunday === "write" || sem.sundayTeam === team;
}

/** 자기 팀 하나만 여는 역할이면 그 팀 키, 전체 권한이거나 접근 불가면 null. */
export function ownSundayTeam(roles: MinistryRoles): SundayTeamKey | null {
  return SEMESTER_CAPS[roles.semester].sundayTeam;
}

export function iguardScopeOf(roles: MinistryRoles): IguardScope {
  return RETREAT_CAPS[roles.retreat].field;
}

export function canManageRolesOf(roles: MinistryRoles): boolean {
  return SEMESTER_CAPS[roles.semester].manageRoles || RETREAT_CAPS[roles.retreat].manageRoles;
}

/** 승인 대기 요청에 실제 역할이 하나 이상 골라졌는지 확인한다. */
export function hasAnyMinistryRole(roles: MinistryRoles): boolean {
  return roles.semester !== "none" || roles.retreat !== "none";
}

/** 마이페이지 요청함은 모든 사용자 UID·첨부를 읽으므로 통합관리자에게만 연다. */
export function canManageSiteRequests(roles: MinistryRoles): boolean {
  return roles.semester === "superAdmin" || roles.retreat === "superAdmin";
}

/** 타 사용자의 변경 이력은 통합관리자만 조회한다. 실제 읽기는 Rules도 검사한다. */
export function canViewActivityLogs(roles: MinistryRoles): boolean {
  return roles.semester === "superAdmin" || roles.retreat === "superAdmin";
}

/** classes/{year} Rules와 일치하는 새친구 원장 반영·등반 취소 권한. */
export function canWriteStudentRoster(roles: MinistryRoles): boolean {
  return SEMESTER_CAPS[roles.semester].rosterWrite;
}

/** 팀·훈련 반·회차 등 학기 설정 */
export function canEditSemesterSettings(roles: MinistryRoles): boolean {
  return SEMESTER_CAPS[roles.semester].settings;
}

/** 학기 삭제·아카이브 */
export function canDestroySemester(roles: MinistryRoles): boolean {
  return SEMESTER_CAPS[roles.semester].destructive;
}

/** 취소환불 계좌·의료 일지·주민번호 등 민감 탭 */
export function canSeeSensitiveRetreat(roles: MinistryRoles): boolean {
  return RETREAT_CAPS[roles.retreat].sensitive;
}

export function canCreateRetreat(roles: MinistryRoles): boolean {
  return RETREAT_CAPS[roles.retreat].createRetreat;
}

/** 수련회 삭제·백업 복구 */
export function canDestroyRetreat(roles: MinistryRoles): boolean {
  return RETREAT_CAPS[roles.retreat].destructive;
}

export function canManageRetreatPin(roles: MinistryRoles): boolean {
  return RETREAT_CAPS[roles.retreat].managePin;
}

export function searchScope(roles: MinistryRoles): AreaPermission {
  return SEMESTER_CAPS[roles.semester].search;
}

/**
 * 수련회를 눌렀을 때의 기본 목적지.
 * 조회만 가능한 역할(스탭팀장·이가드팀)의 주 사용처는 현장이므로, **편집 가능 여부**로 가른다.
 * 행정 조회는 상단 메뉴의 "수련회 행정팀"으로 따로 들어간다.
 */
export function retreatEntryHref(retreatId: string, roles: MinistryRoles): string {
  const encodedId = encodeURIComponent(retreatId);
  return canEditArea("retreat-admin", roles)
    ? `/retreat/${encodedId}`
    : `/retreat/${encodedId}/field`;
}

// ── DB 값 → 역할 ──────────────────────────────────────────────

/** retreatAdmins/{uid}.role 에 저장되는 행정 계열 역할 (레거시 단일 축) */
export type AdminSideRole = "pastor" | "leader" | "adminTeam";

export function isAdminSideRole(value: unknown): value is AdminSideRole {
  return value === "pastor" || value === "leader" || value === "adminTeam";
}

export function isSemesterRole(value: unknown): value is SemesterRole {
  return typeof value === "string" && value in SEMESTER_CAPS;
}

export function isRetreatRole(value: unknown): value is RetreatRole {
  return typeof value === "string" && value in RETREAT_CAPS;
}

export type RoleSource = {
  isMainAdmin: boolean;
  hasRetreatAdmin: boolean;
  /** 레거시 단일 역할 (retreatAdmins/{uid}.role) */
  retreatAdminRole?: unknown;
  hasIguardMember: boolean;
  iguardRole?: unknown;
  /** 두 축 역할 — 없으면 레거시에서 파생한다 */
  semesterRole?: unknown;
  retreatRole?: unknown;
};

/**
 * 원시 DB 값 → 두 축 역할.
 *
 * 하위호환이 이 함수의 핵심이다. 새 필드(semesterRole·retreatRole)가 아직 없는
 * 기존 구성원도 **지금과 똑같은 권한**을 받아야 한다 — 여기서 어긋나면 로그인은 되는데
 * 화면이 비는 사고가 난다.
 */
export function resolveMinistryRoles(input: RoleSource): MinistryRoles {
  if (input.isMainAdmin) return { semester: "superAdmin", retreat: "superAdmin" };

  const legacy = legacyRolesFrom(input);
  return {
    semester: isSemesterRole(input.semesterRole) && input.semesterRole !== "superAdmin"
      ? input.semesterRole : legacy.semester,
    retreat: isRetreatRole(input.retreatRole) && input.retreatRole !== "superAdmin"
      ? input.retreatRole : legacy.retreat,
  };
}

/** 새 필드가 없을 때의 파생 — 기존 6단계 역할의 권한을 그대로 재현한다. */
function legacyRolesFrom(input: RoleSource): MinistryRoles {
  if (input.hasRetreatAdmin) {
    const role = isAdminSideRole(input.retreatAdminRole) ? input.retreatAdminRole : "adminTeam";
    return { semester: role, retreat: role };
  }
  if (input.hasIguardMember) {
    // 이가드팀은 학기 화면을 쓰지 않았고, 스탭은 조회만 했다.
    return input.iguardRole === "staff"
      ? { semester: "staff", retreat: "fieldStaff" }
      : { semester: "none", retreat: "iguardTeam" };
  }
  return NO_ROLES;
}

/** 화면 표시용 — 두 축이 같으면 한 이름, 다르면 "학기 X · 방학 Y" */
export function describeRoles(roles: MinistryRoles): string {
  const semester = SEMESTER_ROLE_LABELS[roles.semester];
  const retreat = RETREAT_ROLE_LABELS[roles.retreat];
  if (semester === retreat) return semester;
  if (roles.semester === "none") return `방학 ${retreat}`;
  if (roles.retreat === "none") return `학기 ${semester}`;
  return `학기 ${semester} · 방학 ${retreat}`;
}

/** 이름 옆 배지 — 학기·방학 구분 없이 역할 이름만. 두 축이 다르면 "A 및 B". */
export function roleBadgeLabel(roles: MinistryRoles): string {
  const semester = SEMESTER_ROLE_LABELS[roles.semester];
  const retreat = RETREAT_ROLE_LABELS[roles.retreat];
  if (roles.semester === "none") return retreat;
  if (roles.retreat === "none") return semester;
  return semester === retreat ? semester : `${semester} 및 ${retreat}`;
}

export function describeRolesHint(roles: MinistryRoles): string {
  const semester = SEMESTER_ROLE_HINTS[roles.semester];
  const retreat = RETREAT_ROLE_HINTS[roles.retreat];
  return semester === retreat ? semester : `학기: ${semester} / 방학: ${retreat}`;
}

/** 목록 정렬·표시용 — 두 축 중 높은 쪽의 등급 (클수록 높다) */
export function roleRank(roles: MinistryRoles): number {
  const semRank = ASSIGNABLE_SEMESTER_ROLES.length - ASSIGNABLE_SEMESTER_ROLES.indexOf(roles.semester);
  const retRank = ASSIGNABLE_RETREAT_ROLES.length - ASSIGNABLE_RETREAT_ROLES.indexOf(roles.retreat);
  return Math.max(semRank, retRank);
}

/** 확인 문구용 — 되돌리기 어려운 강등을 사용자에게 먼저 보여준다. */
export function isSemesterDowngrade(from: SemesterRole, to: SemesterRole): boolean {
  return ASSIGNABLE_SEMESTER_ROLES.indexOf(to) > ASSIGNABLE_SEMESTER_ROLES.indexOf(from);
}

export function isRetreatDowngrade(from: RetreatRole, to: RetreatRole): boolean {
  return ASSIGNABLE_RETREAT_ROLES.indexOf(to) > ASSIGNABLE_RETREAT_ROLES.indexOf(from);
}

/** 낮은 역할에서 높은 역할로 바뀌는지 판정한다. 권한 상승 확인창에 사용한다. */
export function isSemesterUpgrade(from: SemesterRole, to: SemesterRole): boolean {
  return ASSIGNABLE_SEMESTER_ROLES.indexOf(to) < ASSIGNABLE_SEMESTER_ROLES.indexOf(from);
}

export function isRetreatUpgrade(from: RetreatRole, to: RetreatRole): boolean {
  return ASSIGNABLE_RETREAT_ROLES.indexOf(to) < ASSIGNABLE_RETREAT_ROLES.indexOf(from);
}
