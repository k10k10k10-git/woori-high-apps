import {
  SUNDAY_MINISTRY_TEAMS,
  sundayTeamOf,
  type SundayTeamKey,
} from "@/features/portal/featureCatalog";
import { canManageAnnualFinance, describeRoles, RETREAT_ROLE_LABELS, type MinistryRoles } from "@/features/portal/accessPolicy";
import type { Team } from "@/features/semester/types";

export type TeamMembershipRole = "leader" | "operator" | "staff" | "viewer";

export type TeamMembership = {
  role: TeamMembershipRole;
  active: boolean;
  semesters?: Record<string, true>;
};

export type TeamMemberships = Partial<Record<SundayTeamKey, TeamMembership>>;

export const TEAM_MEMBERSHIP_ROLE_LABELS: Record<TeamMembershipRole, string> = {
  leader: "팀장",
  operator: "운영자",
  staff: "스탭",
  viewer: "조회자",
};

const TEAM_KEYS = new Set<SundayTeamKey>(SUNDAY_MINISTRY_TEAMS.map((team) => team.key));
const MEMBERSHIP_ROLES = new Set<TeamMembershipRole>(["leader", "operator", "staff", "viewer"]);

export function normalizeTeamMemberships(value: unknown): TeamMemberships {
  if (!value || typeof value !== "object") return {};
  const result: TeamMemberships = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (!TEAM_KEYS.has(key as SundayTeamKey) || !raw || typeof raw !== "object") continue;
    const record = raw as Partial<TeamMembership>;
    if (!MEMBERSHIP_ROLES.has(record.role as TeamMembershipRole) || record.active === false) continue;
    result[key as SundayTeamKey] = {
      role: record.role as TeamMembershipRole,
      active: true,
      ...(record.semesters && typeof record.semesters === "object"
        ? { semesters: Object.fromEntries(Object.entries(record.semesters).filter(([, enabled]) => enabled === true)) }
        : {}),
    };
  }
  return result;
}

/** 권한 원장이 두 버킷에 나뉜 레거시 계정도 담당 팀을 잃지 않게 한 번만 합친다. */
export function mergeTeamMemberships(...values: unknown[]): TeamMemberships {
  return Object.assign({}, ...values.map(normalizeTeamMemberships));
}

export function activeTeamKeys(memberships: TeamMemberships = {}, semesterId?: string): SundayTeamKey[] {
  return SUNDAY_MINISTRY_TEAMS
    .filter(({ key }) => {
      const membership = memberships[key];
      if (!membership?.active) return false;
      return !semesterId || !membership.semesters || membership.semesters[semesterId] === true;
    })
    .map(({ key }) => key);
}

export function canAccessEveryTeam(roles: MinistryRoles): boolean {
  return roles.semester === "superAdmin" || roles.semester === "pastor";
}

/** 팀 디렉터리와 공개 학기 기록의 조회 범위. 저장·찬양 서버 권한과 분리한다. */
export function canBrowseEveryTeam(roles: MinistryRoles): boolean {
  return canAccessEveryTeam(roles) || roles.semester === "leader";
}

/** 모집·배치·전체 출석은 중앙 운영 역할만 연다. 팀이 명시된 팀장은 자기 팀 공간을 쓴다. */
export function canAccessOperationsCenter(roles: MinistryRoles, memberships?: TeamMemberships): boolean {
  if (memberships === undefined) {
    return roles.semester !== "none"
      && !["staff", "barnabas", "worship", "praise", "media", "design"].includes(roles.semester);
  }
  if (["superAdmin", "pastor", "adminTeam"].includes(roles.semester)) return true;
  return roles.semester === "leader" && activeTeamKeys(memberships).length === 0;
}

/** semestersPrivate Rules와 같은 판정. 팀 화면에서 연락처를 구독하기 전에 반드시 확인한다. */
export function canReadSemesterPrivate(roles: MinistryRoles, memberships?: TeamMemberships): boolean {
  if (["superAdmin", "pastor", "adminTeam"].includes(roles.semester)) return true;
  return roles.semester === "leader" && (memberships === undefined || activeTeamKeys(memberships).length === 0);
}

export function accessibleTeamKeys(roles: MinistryRoles, memberships: TeamMemberships = {}): SundayTeamKey[] {
  if (canBrowseEveryTeam(roles)) return SUNDAY_MINISTRY_TEAMS.map((team) => team.key);
  const keys = activeTeamKeys(memberships);
  return canManageAnnualFinance(roles) ? [...new Set<SundayTeamKey>(["admin", ...keys])] : keys;
}

export function canBrowseTeam(teamKey: SundayTeamKey, roles: MinistryRoles, memberships: TeamMemberships = {}, semesterId?: string): boolean {
  return canBrowseEveryTeam(roles) || (teamKey === "admin" && canManageAnnualFinance(roles)) || activeTeamKeys(memberships, semesterId).includes(teamKey);
}

/** 팀 명단의 공식 원장 연락처는 그 팀을 조회할 수 있는 구성원에게만 연다. */
export function canReadTeamContacts(teamKey: SundayTeamKey, roles: MinistryRoles, memberships: TeamMemberships = {}, semesterId?: string): boolean {
  return canBrowseTeam(teamKey, roles, memberships, semesterId);
}

export function canAccessTeam(teamKey: SundayTeamKey, roles: MinistryRoles, memberships: TeamMemberships = {}, semesterId?: string): boolean {
  return canAccessEveryTeam(roles) || (teamKey === "admin" && canManageAnnualFinance(roles)) || activeTeamKeys(memberships, semesterId).includes(teamKey);
}

export function canEditTeam(teamKey: SundayTeamKey, roles: MinistryRoles, memberships: TeamMemberships = {}, semesterId?: string): boolean {
  if (roles.semester === "superAdmin" || roles.semester === "pastor") return true;
  if (roles.semester === "leader" && activeTeamKeys(memberships).length === 0) return true;
  const membership = memberships[teamKey];
  return membership?.active === true
    && membership.role !== "viewer"
    && (!semesterId || !membership.semesters || membership.semesters[semesterId] === true);
}

export function ownTeamKey(roles: MinistryRoles, memberships: TeamMemberships = {}): SundayTeamKey | null {
  if (canAccessEveryTeam(roles)) return null;
  const keys = activeTeamKeys(memberships);
  return keys.length === 1 ? keys[0] : null;
}

function compactTeamName(value: string): string {
  return value.normalize("NFC").replace(/\s+/g, "").replace(/팀$/, "");
}

export function teamKeyFromName(name: string): SundayTeamKey | null {
  const normalized = compactTeamName(name);
  return SUNDAY_MINISTRY_TEAMS.find((team) => compactTeamName(team.label) === normalized)?.key ?? null;
}

/** 학기별 동적 ID와 영구 teamKey를 잇는다. 저장된 teamKey를 우선하고, 이전 기록은 이름으로 읽는다. */
export function semesterTeamForKey(teams: readonly Team[], teamKey: SundayTeamKey): Team | null {
  return teams.find((team) => team.teamKey === teamKey)
    ?? teams.find((team) => teamKeyFromName(team.name) === teamKey)
    ?? null;
}

export function membershipLabel(membership: TeamMembership | undefined): string {
  return membership ? TEAM_MEMBERSHIP_ROLE_LABELS[membership.role] : "전체 운영";
}

/** 표시만 소속에 맞춘다. 접근·편집 권한은 기존 capability 판정을 사용한다. */
export function describeTeamRoles(roles: MinistryRoles, memberships: TeamMemberships = {}): string {
  const keys = activeTeamKeys(memberships);
  if (!keys.length || ["superAdmin", "pastor", "adminTeam"].includes(roles.semester)) return describeRoles(roles);
  const teams = keys.map((key) => `${sundayTeamOf(key)!.label} ${membershipLabel(memberships[key])}`).join(" · ");
  return `학기 ${teams}${roles.retreat === "none" ? "" : ` · 방학 ${RETREAT_ROLE_LABELS[roles.retreat]}`}`;
}
