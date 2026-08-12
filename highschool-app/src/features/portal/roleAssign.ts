/**
 * 역할 배정의 쓰기 계획 — 순수 함수.
 *
 * 두 축 역할(학기·방학)은 기존 세 노드의 조합으로 저장한다(Rules 변경 없음).
 *   통합관리자        : admins/{uid} = true
 *   행정 계열·바나바  : retreatAdmins/{uid} = { email, name, role, semesterRole, retreatRole }
 *   이가드·사역팀     : iguardMembers/{uid} + iguardRoles/{uid}
 *
 * 버킷은 **두 축의 합집합**으로 정해진다. 예를 들어 "학기=찬양팀 / 방학=행정팀"이면
 * 행정 쓰기가 필요하므로 retreatAdmins에 들어가고, 학기 화면 제한은 화면이 담당한다.
 *
 * "필요한 변경만" 계산해 부여 → 해제 순서로 내보낸다.
 * (해제를 먼저 하면 중간 상태에서 권한이 완전히 없어지는 순간이 생긴다.)
 */

import type { AdminSideRole, MinistryRoles, RetreatRole, SemesterRole } from "./accessPolicy";

export type MemberPresence = {
  mainAdmin: boolean;
  /** retreatAdmins/{uid} 존재 시의 role (레거시는 undefined → 행정팀) */
  retreatAdminRole?: AdminSideRole | null;
  hasRetreatAdmin: boolean;
  hasIguardMember: boolean;
  iguardRole?: "team" | "staff" | null;
  /** 이미 저장된 두 축 역할 (없으면 레거시) */
  roles?: MinistryRoles;
};

export type RoleAssignStep =
  | { kind: "setMainAdmin"; enabled: boolean }
  | { kind: "setRetreatAdmin"; role: AdminSideRole; roles: MinistryRoles }
  | { kind: "removeRetreatAdmin" }
  | { kind: "setIguardMember"; role: "team" | "staff"; roles: MinistryRoles }
  | { kind: "removeIguardMember" };

/** 학기 역할 중 semesters 쓰기가 필요한 것 — 이들은 retreatAdmins 버킷이어야 한다. */
const SEMESTER_NEEDS_ADMIN: readonly SemesterRole[] = ["pastor", "leader", "adminTeam", "barnabas"];
/** 방학 역할 중 retreats 쓰기가 필요한 것 */
const RETREAT_NEEDS_ADMIN: readonly RetreatRole[] = ["pastor", "leader", "adminTeam"];

/** 레거시 단일 필드(role)에 남길 값 — 두 축에서 가장 높은 행정 계열. */
function adminSideRoleFor(roles: MinistryRoles): AdminSideRole {
  if (roles.semester === "pastor" || roles.retreat === "pastor") return "pastor";
  if (roles.semester === "leader" || roles.retreat === "leader") return "leader";
  return "adminTeam"; // 행정팀·바나바팀
}

type DesiredState = {
  mainAdmin: boolean;
  retreatAdmin: AdminSideRole | null;
  iguard: "team" | "staff" | null;
};

export function desiredStateFor(roles: MinistryRoles): DesiredState {
  if (roles.semester === "superAdmin" || roles.retreat === "superAdmin") {
    return { mainAdmin: true, retreatAdmin: null, iguard: null };
  }
  const needsAdmin = SEMESTER_NEEDS_ADMIN.includes(roles.semester) || RETREAT_NEEDS_ADMIN.includes(roles.retreat);
  if (needsAdmin) return { mainAdmin: false, retreatAdmin: adminSideRoleFor(roles), iguard: null };

  // 현장 계열만 필요한 경우 — 이가드팀은 기획까지, 나머지는 실행탭만
  const needsIguard = roles.retreat === "iguardTeam" || roles.retreat === "fieldStaff"
    || roles.semester !== "none";
  if (!needsIguard) return { mainAdmin: false, retreatAdmin: null, iguard: null };
  return { mainAdmin: false, retreatAdmin: null, iguard: roles.retreat === "iguardTeam" ? "team" : "staff" };
}

export function planRoleAssignment(target: MinistryRoles, present: MemberPresence): RoleAssignStep[] {
  const desired = desiredStateFor(target);
  const grants: RoleAssignStep[] = [];
  const revokes: RoleAssignStep[] = [];

  if (desired.mainAdmin && !present.mainAdmin) grants.push({ kind: "setMainAdmin", enabled: true });
  if (!desired.mainAdmin && present.mainAdmin) revokes.push({ kind: "setMainAdmin", enabled: false });

  const currentAdminRole = present.hasRetreatAdmin ? (present.retreatAdminRole ?? "adminTeam") : null;
  const rolesChanged = present.roles?.semester !== target.semester || present.roles?.retreat !== target.retreat;
  if (desired.retreatAdmin && (desired.retreatAdmin !== currentAdminRole || rolesChanged)) {
    grants.push({ kind: "setRetreatAdmin", role: desired.retreatAdmin, roles: target });
  }
  if (!desired.retreatAdmin && present.hasRetreatAdmin) revokes.push({ kind: "removeRetreatAdmin" });

  const currentIguard = present.hasIguardMember ? (present.iguardRole ?? "team") : null;
  if (desired.iguard && (desired.iguard !== currentIguard || rolesChanged)) {
    grants.push({ kind: "setIguardMember", role: desired.iguard, roles: target });
  }
  if (!desired.iguard && present.hasIguardMember) revokes.push({ kind: "removeIguardMember" });

  return [...grants, ...revokes];
}
