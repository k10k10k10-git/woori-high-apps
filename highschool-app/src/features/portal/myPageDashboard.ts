import { normalizeStaffIdentityName } from "@/features/iguard/lib/staffIdentity";
import { deriveNewFriendStage } from "@/features/semester/newFriend";
import type { Application, NewFriend, Session, SessionAttendance, Team, TrainingClass } from "@/features/semester/types";
import type { SiteRequest } from "@/features/suggestions/siteRequest";
import {
  canAccessArea,
  canEditArea,
  describeRoles,
  iguardScopeOf,
  ownSundayTeam,
  type MinistryRoles,
} from "./accessPolicy";
import { sundayTeamOf, type SundayTeamKey } from "./featureCatalog";
import type { SharedCalendarItem } from "./SharedMinistryCalendar";
import { accessibleTeamKeys, canAccessOperationsCenter, canEditTeam, ownTeamKey, type TeamMemberships } from "@/features/teams/teamModel";

export type MinistryModuleTone = "semester" | "sunday" | "retreat" | "field" | "guide";

export interface MinistryModule {
  id: string;
  title: string;
  description: string;
  href: string;
  accessLabel: string;
  tone: MinistryModuleTone;
}

export interface ApplicationAssignment {
  application: Application;
  team: Team | null;
  trainingClass: TrainingClass | null;
}

export interface ApplicationAttendanceSummary {
  /** 출석 회차 수. 남아 있는 레거시 `지각`도 사용자 결정에 따라 출석으로 계산한다. */
  actualAttended: number;
  /** @deprecated `actualAttended`를 사용한다. */
  attended: number;
  late: number;
  absent: number;
  /** 출석·지각·결석 중 하나가 입력된 회차 수. */
  recorded: number;
  /** 아직 어떤 상태도 입력되지 않은 회차 수. */
  unrecorded: number;
  /** 휴강을 제외한 정규·행사 전체 회차 수. 수료 판정의 정규 회차 분모와 다르다. */
  total: number;
  /** 휴강을 제외한 정규·행사 전체 회차의 출석 비율. */
  rate: number;
}

export interface NewFriendSummary {
  total: number;
  active: number;
  classPending: number;
  rosterPending: number;
  completed: number;
}

export function roleDashboardTitle(roles: MinistryRoles): string {
  if (roles.semester === "superAdmin" || roles.retreat === "superAdmin") return "전체 운영을 한눈에 확인하세요";
  if (roles.semester === "pastor" || roles.retreat === "pastor") return "사역 흐름과 준비 상태를 확인하세요";
  if (roles.semester === "leader" || roles.retreat === "leader") return "팀의 다음 실행을 먼저 확인하세요";
  if (roles.semester === "adminTeam" || roles.retreat === "adminTeam") return "처리할 행정 업무를 먼저 확인하세요";
  if (roles.semester === "barnabas") return "새친구 정착 흐름을 이어가세요";
  if (roles.semester === "worship") return "이번 주 예배 준비를 확인하세요";
  if (["praise", "media", "design"].includes(roles.semester)) return "맡은 팀·주일 운영을 확인하세요";
  if (roles.retreat === "iguardTeam") return "수련회 현장 준비를 확인하세요";
  if (roles.retreat === "fieldStaff") return "내 현장 배정과 다음 동선을 확인하세요";
  if (roles.semester === "staff") return "배정된 학기 사역을 확인하세요";
  return "배정된 사역과 요청 상태를 확인하세요";
}

function sundayModule(roles: MinistryRoles, memberships?: TeamMemberships): MinistryModule | null {
  const teamKeys = memberships === undefined ? undefined : accessibleTeamKeys(roles, memberships);
  if (teamKeys ? teamKeys.length === 0 : !canAccessArea("sunday", roles)) return null;
  const ownTeam = memberships === undefined ? ownSundayTeam(roles) : ownTeamKey(roles, memberships);
  if (ownTeam) {
    const team = sundayTeamOf(ownTeam);
    return {
      id: `sunday-${ownTeam}`,
      title: team?.label ?? "담당 사역팀",
      description: team?.tabs.length ? team.tabs.join(" · ") : "팀 기능 준비 중",
      href: `/teams/${ownTeam}`,
      accessLabel: memberships === undefined || canEditTeam(ownTeam, roles, memberships) ? "담당" : "조회",
      tone: "sunday",
    };
  }
  return {
    id: "sunday-all",
    title: "팀·주일 운영",
    description: "팀별 학기 기록·주간 업무",
    href: "/teams",
    accessLabel: (teamKeys === undefined ? canEditArea("sunday", roles) : teamKeys.some((key) => canEditTeam(key, roles, memberships))) ? "운영" : "조회",
    tone: "sunday",
  };
}

export function ministryModulesFor(roles: MinistryRoles, memberships?: TeamMemberships): MinistryModule[] {
  const modules: MinistryModule[] = [];
  if (canAccessOperationsCenter(roles, memberships)) {
    modules.push({
      id: "semester",
      title: canEditArea("semester", roles) ? "학기 운영" : "학기 사역 조회",
      description: "신청·배치·출석·커리큘럼",
      href: "/operations/semesters",
      accessLabel: canEditArea("semester", roles) ? "수정" : "조회",
      tone: "semester",
    });
  }
  const sunday = sundayModule(roles, memberships);
  if (sunday) modules.push(sunday);
  if (canAccessArea("retreat-admin", roles)) {
    modules.push({
      id: "retreat-admin",
      title: "수련회 행정",
      description: "신청·편성·물품·정산",
      href: "/events",
      accessLabel: canEditArea("retreat-admin", roles) ? "수정" : "조회",
      tone: "retreat",
    });
  }
  if (canAccessArea("retreat-field", roles)) {
    modules.push({
      id: "retreat-field",
      title: "수련회 현장 업무(이가드)",
      description: iguardScopeOf(roles) === "all" ? "실행·기획·정보" : "개인 큐카드·조별 정보·인원체크",
      href: "/events",
      accessLabel: iguardScopeOf(roles) === "all" ? "전체" : "실행",
      tone: "field",
    });
  }
  modules.push({
    id: "guide",
    title: "사역 가이드",
    description: "월별 흐름과 부서 운영 기준",
    href: "/ministry-guide",
    accessLabel: "공통",
    tone: "guide",
  });
  return modules;
}

export function findUniqueApplicationAssignment(
  applications: Application[],
  teams: Team[],
  trainingClasses: TrainingClass[],
  preferredNames: Array<string | null | undefined>,
): ApplicationAssignment | null {
  const names = new Set(preferredNames.map((name) => normalizeStaffIdentityName(name ?? "")).filter(Boolean));
  if (names.size === 0) return null;
  const matches = applications.filter((application) => (
    application.status !== "취소" && names.has(normalizeStaffIdentityName(application.name))
  ));
  if (matches.length !== 1) return null;
  const application = matches[0];
  return {
    application,
    team: teams.find((team) => team.id === application.teamId) ?? null,
    trainingClass: trainingClasses.find((trainingClass) => trainingClass.id === application.trainingClassId) ?? null,
  };
}

export function applicationAttendanceSummary(
  applicationId: string,
  sessions: Session[],
  attendance: Record<string, SessionAttendance>,
): ApplicationAttendanceSummary {
  const countedSessions = sessions.filter((session) => session.type !== "휴강");
  const statuses = countedSessions
    .map((session) => attendance[session.id]?.[applicationId]?.s)
    .filter((status): status is "출석" | "지각" | "결석" => !!status);
  const attended = statuses.filter((status) => status === "출석").length;
  const late = statuses.filter((status) => status === "지각").length;
  const absent = statuses.filter((status) => status === "결석").length;
  const total = countedSessions.length;
  const recorded = statuses.length;
  return {
    actualAttended: attended + late,
    attended,
    late,
    absent,
    recorded,
    unrecorded: total - recorded,
    total,
    rate: total > 0 ? Math.round(((attended + late) / total) * 100) : 0,
  };
}

export function summarizeNewFriends(friends: NewFriend[], year: number): NewFriendSummary {
  const scoped = friends.filter((friend) => !((friend as NewFriend & { storageSid?: string }).storageSid)
    || (friend as NewFriend & { storageSid?: string }).storageSid?.startsWith(String(year)));
  const stages = scoped.map(deriveNewFriendStage);
  return {
    total: scoped.length,
    active: stages.filter((stage) => !["완료", "종료", "보류"].includes(stage)).length,
    classPending: stages.filter((stage) => stage === "반배정").length,
    rosterPending: stages.filter((stage) => stage === "출석부 반영").length,
    completed: stages.filter((stage) => stage === "완료").length,
  };
}

export function requestSummary(requests: SiteRequest[]) {
  return {
    total: requests.length,
    received: requests.filter((request) => request.status === "received").length,
    resolved: requests.filter((request) => request.status === "resolved").length,
  };
}

export function roleContextLabel(roles: MinistryRoles) {
  return describeRoles(roles);
}

export function canSeeCalendarKind(kind: SharedCalendarItem["kind"], roles: MinistryRoles): boolean {
  if (kind === "main") return canAccessArea("home", roles);
  if (kind === "semester") return canAccessArea("semester", roles);
  if (kind === "sunday") return canAccessArea("sunday", roles);
  if (kind === "retreat") return canAccessArea("retreat-admin", roles);
  return canAccessArea("retreat-field", roles);
}

export function sundayTeamKeyForRoles(roles: MinistryRoles): SundayTeamKey | null {
  return ownSundayTeam(roles);
}
