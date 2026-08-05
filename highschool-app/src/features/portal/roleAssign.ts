/**
 * 역할 배정의 쓰기 계획 — 순수 함수.
 *
 * 6단계 역할은 기존 세 노드의 조합으로 저장된다(Rules 변경 없음).
 *   통합관리자 : admins/{uid} = true
 *   교역자·팀장·행정팀 : retreatAdmins/{uid} = { email, name, role }
 *   이가드팀·스탭 : iguardMembers/{uid} + iguardRoles/{uid}
 *
 * 여기서 "필요한 변경만" 계산해 부여 → 해제 순서로 내보낸다.
 * (해제를 먼저 하면 중간 상태에서 권한이 완전히 없어지는 순간이 생긴다.)
 */

import type { AdminSideRole, MinistryRole } from "./accessPolicy";

export type MemberPresence = {
  mainAdmin: boolean;
  /** retreatAdmins/{uid} 존재 시의 role (레거시는 undefined → 행정팀) */
  retreatAdminRole?: AdminSideRole | null;
  hasRetreatAdmin: boolean;
  hasIguardMember: boolean;
  iguardRole?: "team" | "staff" | null;
};

export type RoleAssignStep =
  | { kind: "setMainAdmin"; enabled: boolean }
  | { kind: "setRetreatAdmin"; role: AdminSideRole }
  | { kind: "removeRetreatAdmin" }
  | { kind: "setIguardMember"; role: "team" | "staff" }
  | { kind: "removeIguardMember" };

type DesiredState = {
  mainAdmin: boolean;
  retreatAdmin: AdminSideRole | null;
  iguard: "team" | "staff" | null;
};

const DESIRED: Record<MinistryRole, DesiredState> = {
  superAdmin: { mainAdmin: true, retreatAdmin: null, iguard: null },
  pastor: { mainAdmin: false, retreatAdmin: "pastor", iguard: null },
  leader: { mainAdmin: false, retreatAdmin: "leader", iguard: null },
  adminTeam: { mainAdmin: false, retreatAdmin: "adminTeam", iguard: null },
  iguardTeam: { mainAdmin: false, retreatAdmin: null, iguard: "team" },
  staff: { mainAdmin: false, retreatAdmin: null, iguard: "staff" },
  none: { mainAdmin: false, retreatAdmin: null, iguard: null },
};

export function planRoleAssignment(target: MinistryRole, present: MemberPresence): RoleAssignStep[] {
  const desired = DESIRED[target];
  const grants: RoleAssignStep[] = [];
  const revokes: RoleAssignStep[] = [];

  if (desired.mainAdmin && !present.mainAdmin) grants.push({ kind: "setMainAdmin", enabled: true });
  if (!desired.mainAdmin && present.mainAdmin) revokes.push({ kind: "setMainAdmin", enabled: false });

  const currentAdminRole = present.hasRetreatAdmin ? (present.retreatAdminRole ?? "adminTeam") : null;
  if (desired.retreatAdmin && desired.retreatAdmin !== currentAdminRole) {
    grants.push({ kind: "setRetreatAdmin", role: desired.retreatAdmin });
  }
  if (!desired.retreatAdmin && present.hasRetreatAdmin) revokes.push({ kind: "removeRetreatAdmin" });

  const currentIguard = present.hasIguardMember ? (present.iguardRole ?? "team") : null;
  if (desired.iguard && desired.iguard !== currentIguard) {
    grants.push({ kind: "setIguardMember", role: desired.iguard });
  }
  if (!desired.iguard && present.hasIguardMember) revokes.push({ kind: "removeIguardMember" });

  return [...grants, ...revokes];
}

/** 확인 문구용 — 되돌리기 어려운 강등을 사용자에게 먼저 보여준다. */
export function isDowngrade(from: MinistryRole, to: MinistryRole): boolean {
  const rank: Record<MinistryRole, number> = {
    superAdmin: 6, pastor: 5, leader: 4, adminTeam: 3, iguardTeam: 2, staff: 1, none: 0,
  };
  return rank[to] < rank[from];
}
