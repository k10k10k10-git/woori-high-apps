import {
  canAccessSundayTeam,
  type MinistryRoles,
} from "@/features/portal/accessPolicy";
import type {
  PraiseActor,
  PraiseMeeting,
  PraisePermissions,
  PraiseState,
  PraiseView,
} from "./types";

/** 전역 권한과 찬양팀 내부 위임은 별개다. 수련회 관리자 버킷으로 승격하지 않는다. */
export function canAdministerPraise(roles: MinistryRoles): boolean {
  return (
    roles.semester === "superAdmin" ||
    roles.semester === "pastor" ||
    roles.semester === "leader"
  );
}
export function praisePermissions(
  actor: PraiseActor,
  state?: PraiseState | null,
): PraisePermissions {
  const read = canAccessSundayTeam("praise", actor.roles);
  const globalManager = read && canAdministerPraise(actor.roles);
  const access = state?.access[actor.uid];
  const local = read && access?.active ? access : null;
  const manage = globalManager || local?.role === "manager";
  const stageEdit = manage || local?.role === "editor";
  return {
    read,
    manage,
    stageEdit,
    attendanceAll: manage,
    staffId: local?.staffId ?? null,
    role: manage ? "manager" : (local?.role ?? "observer"),
  };
}
export function groupVersionForMeeting(
  state: PraiseState,
  meeting: PraiseMeeting,
) {
  const id = meeting.groupVersionId || state.meta.activeGroupVersionId;
  const version = id ? state.groupVersions[id] : undefined;
  return version?.kind === "CONFIRMED" ? version : null;
}
export function canWritePraiseAttendance(
  actor: PraiseActor,
  state: PraiseState,
  meeting: PraiseMeeting,
  personId: string,
): boolean {
  const permissions = praisePermissions(actor, state);
  if (!permissions.read) return false;
  if (permissions.attendanceAll) return true;
  if (
    !["groupStaff", "editor"].includes(permissions.role) ||
    !permissions.staffId
  )
    return false;
  return Boolean(
    groupVersionForMeeting(state, meeting)?.groups.some(
      (group) =>
        group.staffIds.includes(permissions.staffId!) &&
        group.studentIds.includes(personId),
    ),
  );
}

export function canEditViewAttendance(
  view: PraiseView,
  meetingId: string,
  personId: string,
): boolean {
  if (view.permissions.attendanceAll) return true;
  if (
    !["groupStaff", "editor"].includes(view.permissions.role) ||
    !view.permissions.staffId
  )
    return false;
  const meeting = view.meetings.find((m) => m.id === meetingId);
  const groupId = meeting?.groupVersionId || view.meta.activeGroupVersionId;
  return Boolean(
    view.groups
      .find((g) => g.id === groupId)
      ?.groups.some(
        (g) =>
          g.staffIds.includes(view.permissions.staffId!) &&
          g.studentIds.includes(personId),
      ),
  );
}

export function canReadPraiseStudentAttendance(permissions: PraisePermissions): boolean {
  return permissions.stageEdit || permissions.role === "groupStaff";
}
export function canOpenPraiseAttendance(permissions: PraisePermissions): boolean {
  return permissions.stageEdit || Boolean(permissions.staffId);
}
