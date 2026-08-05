/**
 * 통합 앱의 역할·화면 접근 계약 (단일 원천).
 *
 * 역할은 6단계다. 행정 권한과 이가드 권한을 "합쳐서" 판정하지 않고,
 * 하나의 역할이 영역별 권한(없음/읽기/쓰기)을 각각 갖는 형태로 표현한다.
 * Firebase Rules가 최종 보안 경계지만, 화면 진입 단계에서도 같은 계약을 지켜야 한다.
 *
 * DB 저장 형태 (Rules 변경 없이 기존 노드를 그대로 사용):
 *   통합관리자 : admins/{uid} === true
 *   교역자·팀장·행정팀 : retreatAdmins/{uid}.role = "pastor" | "leader" | "adminTeam"
 *                        (role 없는 레거시 항목은 행정팀으로 간주)
 *   이가드팀   : iguardMembers/{uid} + iguardRoles/{uid} = "team"
 *   스탭       : iguardMembers/{uid} + iguardRoles/{uid} = "staff"
 */

export type MinistryRole =
  | "none"
  | "staff"       // 스탭
  | "iguardTeam"  // 이가드팀
  | "adminTeam"   // 행정팀
  | "leader"      // 팀장
  | "pastor"      // 교역자
  | "superAdmin"; // 통합관리자

export type PortalArea = "home" | "semester" | "retreat-admin" | "retreat-field";

/** 영역별 권한 등급. execution은 이가드 "실행" 탭만 허용하는 부분 접근이다. */
export type AreaPermission = "none" | "read" | "write";
export type IguardScope = "none" | "execution" | "all";

export const MINISTRY_ROLE_LABELS: Record<MinistryRole, string> = {
  superAdmin: "통합관리자",
  pastor: "교역자",
  leader: "팀장",
  adminTeam: "행정팀",
  iguardTeam: "이가드팀",
  staff: "스탭",
  none: "권한 없음",
};

/** 팀원 관리 화면에서 배정 가능한 순서(높은 권한 → 낮은 권한). */
export const ASSIGNABLE_ROLES = [
  "superAdmin",
  "pastor",
  "leader",
  "adminTeam",
  "iguardTeam",
  "staff",
  "none",
] as const satisfies readonly MinistryRole[];

export const MINISTRY_ROLE_HINTS: Record<MinistryRole, string> = {
  superAdmin: "모든 탭 + 역할 배정",
  pastor: "모든 탭 접근·수정",
  leader: "모든 탭 접근·수정",
  adminTeam: "행정·학기 수정, 이가드 실행탭",
  iguardTeam: "이가드 전체 수정 (행정 불가)",
  staff: "이가드 실행탭, 학기 조회만",
  none: "접근 불가",
};

type RoleCapability = {
  semester: AreaPermission;
  retreatAdmin: AreaPermission;
  field: IguardScope;
  /** 다른 사람의 역할을 바꿀 수 있는가 */
  manageRoles: boolean;
};

const CAPABILITIES: Record<MinistryRole, RoleCapability> = {
  superAdmin: { semester: "write", retreatAdmin: "write", field: "all", manageRoles: true },
  pastor: { semester: "write", retreatAdmin: "write", field: "all", manageRoles: false },
  leader: { semester: "write", retreatAdmin: "write", field: "all", manageRoles: false },
  adminTeam: { semester: "write", retreatAdmin: "write", field: "execution", manageRoles: false },
  iguardTeam: { semester: "none", retreatAdmin: "none", field: "all", manageRoles: false },
  staff: { semester: "read", retreatAdmin: "none", field: "execution", manageRoles: false },
  none: { semester: "none", retreatAdmin: "none", field: "none", manageRoles: false },
};

function permissionFor(area: PortalArea, role: MinistryRole): AreaPermission {
  const cap = CAPABILITIES[role];
  if (area === "semester") return cap.semester;
  if (area === "retreat-admin") return cap.retreatAdmin;
  if (area === "retreat-field") return cap.field === "none" ? "none" : "write";
  // home — 세 영역 중 하나라도 열려 있으면 진입 가능
  const anyArea = cap.semester !== "none" || cap.retreatAdmin !== "none" || cap.field !== "none";
  return anyArea ? "write" : "none";
}

export function canAccessPortalArea(area: PortalArea, role: MinistryRole): boolean {
  return permissionFor(area, role) !== "none";
}

/** 저장·수정 가능 여부. 스탭의 학기 화면처럼 "보기만" 되는 조합을 구분한다. */
export function canEditPortalArea(area: PortalArea, role: MinistryRole): boolean {
  return permissionFor(area, role) === "write";
}

export function iguardScope(role: MinistryRole): IguardScope {
  return CAPABILITIES[role].field;
}

export function canManageRoles(role: MinistryRole): boolean {
  return CAPABILITIES[role].manageRoles;
}

export function retreatEntryHref(retreatId: string, role: MinistryRole): string {
  const encodedId = encodeURIComponent(retreatId);
  return canAccessPortalArea("retreat-admin", role)
    ? `/retreat/${encodedId}`
    : `/retreat/${encodedId}/field`;
}

/** retreatAdmins/{uid}.role 에 저장되는 행정 계열 역할 */
export type AdminSideRole = "pastor" | "leader" | "adminTeam";

export function isAdminSideRole(value: unknown): value is AdminSideRole {
  return value === "pastor" || value === "leader" || value === "adminTeam";
}

/**
 * 원시 DB 값 → 역할. 문자열 판정을 화면마다 재구현하지 않기 위한 단일 지점이다.
 * 레거시 데이터(role 필드 없는 retreatAdmins, iguardRoles 없는 iguardMembers)를 그대로 흡수한다.
 */
export function resolveMinistryRole(input: {
  isMainAdmin: boolean;
  hasRetreatAdmin: boolean;
  retreatAdminRole?: unknown;
  hasIguardMember: boolean;
  iguardRole?: unknown;
}): MinistryRole {
  if (input.isMainAdmin) return "superAdmin";
  if (input.hasRetreatAdmin) {
    return isAdminSideRole(input.retreatAdminRole) ? input.retreatAdminRole : "adminTeam";
  }
  if (input.hasIguardMember) return input.iguardRole === "staff" ? "staff" : "iguardTeam";
  return "none";
}
