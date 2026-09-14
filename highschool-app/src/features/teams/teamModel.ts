import {
  SUNDAY_MINISTRY_TEAMS,
  type SundayTeamKey,
} from "@/features/portal/featureCatalog";
import type { MinistryRoles } from "@/features/portal/accessPolicy";
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

/** 모집·배치·전체 출석은 중앙 운영 역할만 연다. 팀이 명시된 팀장은 자기 팀 공간을 쓴다. */
export function canAccessOperationsCenter(roles: MinistryRoles, memberships?: TeamMemberships): boolean {
  if (memberships === undefined) {
    return roles.semester !== "none"
      && !["staff", "barnabas", "worship", "praise", "media", "design"].includes(roles.semester);
  }
  if (["superAdmin", "pastor", "adminTeam"].includes(roles.semester)) return true;
  return roles.semester === "leader" && activeTeamKeys(memberships).length === 0;
}

export function accessibleTeamKeys(roles: MinistryRoles, memberships: TeamMemberships = {}): SundayTeamKey[] {
  if (canAccessEveryTeam(roles)) return SUNDAY_MINISTRY_TEAMS.map((team) => team.key);
  return activeTeamKeys(memberships);
}

export function canAccessTeam(teamKey: SundayTeamKey, roles: MinistryRoles, memberships: TeamMemberships = {}): boolean {
  return canAccessEveryTeam(roles) || activeTeamKeys(memberships).includes(teamKey);
}

export function canEditTeam(teamKey: SundayTeamKey, roles: MinistryRoles, memberships: TeamMemberships = {}): boolean {
  if (canAccessEveryTeam(roles)) return true;
  const membership = memberships[teamKey];
  return membership?.active === true && membership.role !== "viewer";
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
