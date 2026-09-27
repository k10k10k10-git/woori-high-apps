"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import {
  subscribeAllAttendance,
  subscribeApplications,
  subscribeSemesters,
  subscribeSessions,
  subscribeTeams,
  subscribeTrainingClasses,
} from "@/features/semester/db";
import { sessionDisplayLabel } from "@/features/semester/sessionKind";
import { featuredTerm } from "@/features/semester/termPhase";
import type {
  Application,
  Session,
  SessionAttendance,
  Semester,
  Team,
  TrainingClass,
} from "@/features/semester/types";
import {
  subscribeToGroups,
  subscribeToIguardGroupStaff,
  subscribeToIguardMovements,
  subscribeToIguardPosts,
  subscribeToIguardSchedule,
  subscribeToIguardSegments,
  subscribeToTeacherAttendances,
} from "@/features/iguard/lib/db";
import type {
  Group,
  IguardMovement,
  IguardPost,
  IguardScheduleBlock,
  IguardSegment,
  TeacherAttendance,
} from "@/features/iguard/lib/types";
import { subscribeSundayNewFriends } from "@/features/sundayMinistry/db";
import type { SundayNewFriend } from "@/features/sundayMinistry/model";
import { subscribeToMySiteRequests } from "@/features/suggestions/db";
import type { SiteRequest } from "@/features/suggestions/siteRequest";
import {
  subscribeToAllRetreatPeriods,
  subscribeToConnection,
  subscribeToMilestones,
  subscribeToRetreats,
  type RetreatPeriodWithOwner,
} from "@/lib/db";
import type { Milestone, Retreat } from "@/lib/types";
import { useLoadErrors } from "@/lib/useLoadErrors";
import { canAccessArea, canAccessSundayTeam, iguardScopeOf, retreatEntryHref } from "./accessPolicy";
import { buildHomeActions } from "./homeActions";
import { buildMyRetreatMinistry } from "./myRetreatMinistry";
import { seoulDateKey } from "./dailyMinistryMessage";
import { calendarKindForSourceSite, type SharedCalendarItem } from "./SharedMinistryCalendar";
import { canAccessOperationsCenter, ownTeamKey } from "@/features/teams/teamModel";
import {
  applicationAttendanceSummary,
  canSeeCalendarKind,
  findUniqueApplicationAssignment,
  requestSummary,
  summarizeNewFriends,
} from "./myPageDashboard";

const EMPTY_BASE = {
  connected: null as boolean | null,
  semesters: [] as Semester[],
  retreats: [] as Retreat[],
  milestones: [] as Milestone[],
  requests: [] as SiteRequest[],
  newFriends: [] as SundayNewFriend[],
};
const BASE_LABELS = { connected: "연결 상태", semesters: "학기 목록", retreats: "수련회 목록", milestones: "공유 일정", requests: "내 요청", newFriends: "새친구" };
const EMPTY_PERIODS = { periods: [] as RetreatPeriodWithOwner[] };
const PERIOD_LABELS = { periods: "수련회 기간" };
const EMPTY_SEMESTER = {
  sessions: [] as Session[], applications: [] as Application[], teams: [] as Team[],
  trainingClasses: [] as TrainingClass[], attendance: {} as Record<string, SessionAttendance>,
};
const SEMESTER_LABELS = { sessions: "학기 회차", applications: "학기 신청", teams: "사역팀", trainingClasses: "훈련 반", attendance: "학기 사역팀 출석" };
const EMPTY_RETREAT = {
  groups: [] as Group[], teachers: [] as TeacherAttendance[], groupStaff: {} as Record<string, string[]>,
  schedule: [] as IguardScheduleBlock[], segments: [] as IguardSegment[],
  movements: [] as IguardMovement[], posts: [] as IguardPost[],
};
const RETREAT_LABELS = { groups: "조 편성", teachers: "교사 참석", groupStaff: "조스탭", schedule: "현장 일정", segments: "현장 구간", movements: "현장 동선", posts: "현장 포스트" };

/** 계정·권한·행사 전환 직후에는 이전 응답을 표시하지 않는다. */
function useMyPageSnapshot<T extends object>(scope: string, initial: T, labels: Record<keyof T, string>) {
  const [state, setState] = useState<{ scope: string; revision: number; values: T; settled: Partial<Record<keyof T, boolean>>; failed: Partial<Record<keyof T, boolean>> }>({ scope, revision: 0, values: initial, settled: {}, failed: {} });
  // 다른 계정을 거쳤다가 돌아와도 첫 계정의 스냅샷이 다시 드러나지 않게 폐기한다.
  const revision = state.scope === scope ? state.revision : state.revision + 1;
  if (state.scope !== scope) setState({ scope, revision, values: initial, settled: {}, failed: {} });
  const { fail, ok, message } = useLoadErrors(`${scope}|${revision}`);
  const receive = useCallback(<K extends keyof T>(key: K, value: T[K]) => {
    setState((previous) => {
      const current = previous.scope === scope ? previous : { values: initial, settled: {}, failed: {} };
      return { scope, revision, values: { ...current.values, [key]: value }, settled: { ...current.settled, [key]: true }, failed: { ...current.failed, [key]: false } };
    });
    ok(labels[key]);
  }, [initial, labels, ok, revision, scope]);
  const reject = useCallback((key: keyof T, error: Error) => {
    setState((previous) => {
      const current = previous.scope === scope ? previous : { values: initial, settled: {}, failed: {} };
      return { scope, revision, values: { ...current.values, [key]: initial[key] }, settled: { ...current.settled, [key]: true }, failed: { ...current.failed, [key]: true } };
    });
    fail(labels[key])(error);
  }, [fail, initial, labels, revision, scope]);
  const settled: Partial<Record<keyof T, boolean>> = state.scope === scope ? state.settled : {};
  const failed: Partial<Record<keyof T, boolean>> = state.scope === scope ? state.failed : {};
  return {
    values: state.scope === scope ? state.values : initial,
    settled,
    failed,
    receive,
    reject,
    loadError: message,
  };
}

/** 해제된 구독의 늦은 성공·실패가 다음 계정/기간의 상태를 덮지 않게 한다. */
function subscriptionGroup<T extends object>(
  receive: <K extends keyof T>(key: K, value: T[K]) => void,
  reject: (key: keyof T, error: Error) => void,
) {
  let active = true;
  const unsubs: (() => void)[] = [];
  return {
    add<K extends keyof T>(key: K, connect: (success: (value: T[K]) => void, failure: (error: Error) => void) => () => void) {
      unsubs.push(connect(
        (value) => { if (active) receive(key, value); },
        (error) => { if (active) reject(key, error); },
      ));
    },
    close() {
      active = false;
      unsubs.forEach((unsubscribe) => unsubscribe());
    },
  };
}

export function useMyPageData() {
  const { user, roles, teamMemberships, memberName } = useAuth();
  const [today] = useState(seoulDateKey);
  const uid = user?.uid;
  const accountScope = JSON.stringify([uid ?? "signed-out", roles.semester, roles.retreat]);
  const hasPortalAccess = canAccessArea("home", roles);
  const hasSemesterAccess = canAccessArea("semester", roles);
  const hasNewFriendsAccess = canAccessArea("sunday", roles) && canAccessSundayTeam("barnabas", roles);
  const hasFieldAccess = iguardScopeOf(roles) !== "none";
  const base = useMyPageSnapshot(accountScope, EMPTY_BASE, BASE_LABELS);
  const { connected, semesters, retreats, milestones, requests, newFriends } = base.values;
  const { receive: receiveBase, reject: rejectBase } = base;

  useEffect(() => {
    if (!uid) return;
    const subscriptions = subscriptionGroup<typeof EMPTY_BASE>(receiveBase, rejectBase);
    subscriptions.add("connected", subscribeToConnection);
    subscriptions.add("requests", (success, failure) => subscribeToMySiteRequests(uid, success, failure));
    if (hasPortalAccess) {
      subscriptions.add("retreats", (success, failure) => subscribeToRetreats(
        (values) => success([...values].sort((a, b) => b.year - a.year || b.createdAt - a.createdAt)), failure,
      ));
      subscriptions.add("milestones", subscribeToMilestones);
    }
    if (hasSemesterAccess) subscriptions.add("semesters", subscribeSemesters);
    if (hasNewFriendsAccess) subscriptions.add("newFriends", subscribeSundayNewFriends);
    return subscriptions.close;
  }, [hasNewFriendsAccess, hasPortalAccess, hasSemesterAccess, receiveBase, rejectBase, uid]);

  // 기간 시작일이 같으면 수련회 목록의 순서로 선택하므로 ID 순서를 보존한다.
  const retreatIdsKey = JSON.stringify(retreats.map((retreat) => retreat.id));
  const periodData = useMyPageSnapshot(`${accountScope}|periods|${retreatIdsKey}`, EMPTY_PERIODS, PERIOD_LABELS);
  const { periods } = periodData.values;
  const { receive: receivePeriods, reject: rejectPeriods } = periodData;
  useEffect(() => {
    if (!uid || !hasPortalAccess) return;
    const subscriptions = subscriptionGroup<typeof EMPTY_PERIODS>(receivePeriods, rejectPeriods);
    subscriptions.add("periods", (success, failure) => subscribeToAllRetreatPeriods(JSON.parse(retreatIdsKey) as string[], success, failure));
    return subscriptions.close;
  }, [hasPortalAccess, receivePeriods, rejectPeriods, retreatIdsKey, uid]);

  const featuredSemester = useMemo(() => featuredTerm(semesters, today), [semesters, today]);
  const currentSemester = featuredSemester?.semester ?? null;
  const currentSemesterId = currentSemester?.id;
  const semesterData = useMyPageSnapshot(`${accountScope}|semester|${currentSemesterId ?? ""}`, EMPTY_SEMESTER, SEMESTER_LABELS);
  const { sessions, applications, teams, trainingClasses, attendance } = semesterData.values;
  const { receive: receiveSemester, reject: rejectSemester } = semesterData;
  useEffect(() => {
    if (!uid || !currentSemesterId || !hasSemesterAccess) return;
    const subscriptions = subscriptionGroup<typeof EMPTY_SEMESTER>(receiveSemester, rejectSemester);
    subscriptions.add("sessions", (success, failure) => subscribeSessions(currentSemesterId, success, failure));
    subscriptions.add("applications", (success, failure) => subscribeApplications(currentSemesterId, success, failure));
    subscriptions.add("teams", (success, failure) => subscribeTeams(currentSemesterId, success, failure));
    subscriptions.add("trainingClasses", (success, failure) => subscribeTrainingClasses(currentSemesterId, success, failure));
    subscriptions.add("attendance", (success, failure) => subscribeAllAttendance(currentSemesterId, "team", success, failure));
    return subscriptions.close;
  }, [currentSemesterId, hasSemesterAccess, receiveSemester, rejectSemester, uid]);

  const currentRetreat = useMemo<Retreat | null>(() => {
    const active = periods.find((period) => period.startDate <= today && today <= period.endDate);
    if (active) return retreats.find((retreat) => retreat.id === active.retreatId) ?? null;
    const next = periods.find((period) => period.startDate >= today);
    return retreats.find((retreat) => retreat.id === next?.retreatId) ?? retreats[0] ?? null;
  }, [periods, retreats, today]);
  const currentRetreatId = currentRetreat?.id;
  const retreatData = useMyPageSnapshot(`${accountScope}|retreat|${currentRetreatId ?? ""}`, EMPTY_RETREAT, RETREAT_LABELS);
  const { groups, teachers, groupStaff, schedule, segments, movements, posts } = retreatData.values;
  const { receive: receiveRetreat, reject: rejectRetreat } = retreatData;
  useEffect(() => {
    if (!uid || !currentRetreatId || !hasFieldAccess) return;
    const subscriptions = subscriptionGroup<typeof EMPTY_RETREAT>(receiveRetreat, rejectRetreat);
    subscriptions.add("groups", (success, failure) => subscribeToGroups(currentRetreatId, success, failure));
    subscriptions.add("teachers", (success, failure) => subscribeToTeacherAttendances(currentRetreatId, success, failure));
    subscriptions.add("groupStaff", (success, failure) => subscribeToIguardGroupStaff(currentRetreatId, success, failure));
    subscriptions.add("schedule", (success, failure) => subscribeToIguardSchedule(currentRetreatId, success, failure));
    subscriptions.add("segments", (success, failure) => subscribeToIguardSegments(currentRetreatId, success, failure));
    subscriptions.add("movements", (success, failure) => subscribeToIguardMovements(currentRetreatId, success, failure));
    subscriptions.add("posts", (success, failure) => subscribeToIguardPosts(currentRetreatId, success, failure));
    return subscriptions.close;
  }, [currentRetreatId, hasFieldAccess, receiveRetreat, rejectRetreat, uid]);

  const baseLoaded = !!base.settled.requests
    && (!hasPortalAccess || !!base.settled.retreats && !!base.settled.milestones)
    && (!hasSemesterAccess || !!base.settled.semesters)
    && (!hasNewFriendsAccess || !!base.settled.newFriends);
  const loaded = !uid || baseLoaded
    && (!hasPortalAccess || !!periodData.settled.periods)
    && (!currentSemesterId || !hasSemesterAccess || Object.keys(EMPTY_SEMESTER).every((key) => semesterData.settled[key as keyof typeof EMPTY_SEMESTER]))
    && (!currentRetreatId || !hasFieldAccess || Object.keys(EMPTY_RETREAT).every((key) => retreatData.settled[key as keyof typeof EMPTY_RETREAT]));
  const semesterLoaded = !uid || !hasSemesterAccess || !!base.settled.semesters
    && (!currentSemesterId || Object.keys(EMPTY_SEMESTER).every((key) => semesterData.settled[key as keyof typeof EMPTY_SEMESTER]));
  const semesterError = !!base.failed.semesters || Object.values(semesterData.failed).some(Boolean);
  const semesterAssignmentLoaded = !uid || !hasSemesterAccess || !!base.settled.semesters
    && (!currentSemesterId || (["applications", "teams", "trainingClasses"] as const).every((key) => semesterData.settled[key]));
  const semesterAssignmentError = !!base.failed.semesters
    || (["applications", "teams", "trainingClasses"] as const).some((key) => semesterData.failed[key]);
  const semesterAttendanceLoaded = !uid || !hasSemesterAccess || !!base.settled.semesters
    && (!currentSemesterId || !!semesterData.settled.sessions && !!semesterData.settled.attendance);
  const semesterAttendanceError = !!base.failed.semesters || !!semesterData.failed.sessions || !!semesterData.failed.attendance;
  const retreatLoaded = !uid || !!base.settled.retreats && !!periodData.settled.periods
    && (!currentRetreatId || !hasFieldAccess || Object.keys(EMPTY_RETREAT).every((key) => retreatData.settled[key as keyof typeof EMPTY_RETREAT]));
  const retreatError = !!base.failed.retreats || !!periodData.failed.periods || Object.values(retreatData.failed).some(Boolean);
  const retreatAssignmentLoaded = !uid || !!base.settled.retreats && !!periodData.settled.periods
    && (!currentRetreatId || !hasFieldAccess || (["teachers", "groups", "groupStaff"] as const).every((key) => retreatData.settled[key]));
  const retreatAssignmentError = !!base.failed.retreats || !!periodData.failed.periods
    || (["teachers", "groups", "groupStaff"] as const).some((key) => retreatData.failed[key]);
  const retreatDutiesLoaded = retreatAssignmentLoaded
    && (!currentRetreatId || !hasFieldAccess || (["schedule", "segments", "movements", "posts"] as const).every((key) => retreatData.settled[key]));
  const retreatDutiesError = retreatAssignmentError
    || (["schedule", "segments", "movements", "posts"] as const).some((key) => retreatData.failed[key]);
  const calendarLoaded = !uid || !!base.settled.retreats && !!periodData.settled.periods && !!base.settled.milestones
    && (!hasSemesterAccess || !!base.settled.semesters && (!currentSemesterId || !!semesterData.settled.sessions));
  const calendarError = !!base.failed.retreats || !!periodData.failed.periods || !!base.failed.milestones
    || !!base.failed.semesters || !!semesterData.failed.sessions;
  const requestsLoaded = !uid || !!base.settled.requests;
  const requestsError = !!base.failed.requests;
  const newFriendsLoaded = !uid || !hasNewFriendsAccess || !!base.settled.newFriends;
  const newFriendsError = !!base.failed.newFriends;
  const semesterContextLoaded = !uid || !hasSemesterAccess || !!base.settled.semesters;
  const semesterContextError = !!base.failed.semesters;
  const retreatContextLoaded = !uid || !!base.settled.retreats && !!periodData.settled.periods;
  const retreatContextError = !!base.failed.retreats || !!periodData.failed.periods;
  const loadError = [base.loadError, periodData.loadError, semesterData.loadError, retreatData.loadError].filter(Boolean).join(" · ") || null;

  const calendarItems = useMemo<SharedCalendarItem[]>(() => {
    const assignedTeam = ownTeamKey(roles, teamMemberships);
    const semesterHref = currentSemester
      ? canAccessOperationsCenter(roles, teamMemberships)
        ? `/operations/semesters/${encodeURIComponent(currentSemester.id)}/overview`
        : assignedTeam ? `/teams/${assignedTeam}/terms/${encodeURIComponent(currentSemester.id)}/overview` : "/teams"
      : canAccessOperationsCenter(roles, teamMemberships) ? "/operations/semesters" : "/teams";
    const semesterItems = currentSemester ? sessions.map((session) => ({
      id: `semester-${session.id}`,
      date: session.date,
      ...(session.endDate ? { endDate: session.endDate } : {}),
      title: sessionDisplayLabel(session),
      kind: "semester" as const,
      href: semesterHref,
    })) : [];
    const retreatItems = periods.map((period) => {
      const retreat = retreats.find((item) => item.id === period.retreatId);
      return {
        id: `retreat-${period.retreatId}-${period.id}`,
        date: period.startDate,
        endDate: period.endDate,
        title: `${retreat?.name ?? "수련회"}${period.label ? ` · ${period.label}` : ""}`,
        kind: "retreat" as const,
        href: retreatEntryHref(period.retreatId, roles),
      };
    });
    const sharedItems = milestones.map((milestone) => ({
      id: `shared-${milestone.id}`,
      date: milestone.targetDate,
      title: milestone.title,
      kind: calendarKindForSourceSite(milestone.sourceSite),
      done: milestone.done,
      editable: true,
    }));
    return [...semesterItems, ...retreatItems, ...sharedItems]
      .filter((item) => canSeeCalendarKind(item.kind, roles))
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [currentSemester, milestones, periods, retreats, roles, sessions, teamMemberships]);

  const homeActions = useMemo(() => buildHomeActions(calendarItems, today), [calendarItems, today]);
  const personalApplication = useMemo(() => currentSemester ? findUniqueApplicationAssignment(
    applications,
    teams,
    trainingClasses,
    [memberName, user?.displayName],
  ) : null, [applications, currentSemester, memberName, teams, trainingClasses, user?.displayName]);
  const personalAttendance = useMemo(() => personalApplication
    ? applicationAttendanceSummary(personalApplication.application.id, sessions, attendance)
    : null, [attendance, personalApplication, sessions]);
  const personalRetreat = useMemo(() => currentRetreat && iguardScopeOf(roles) !== "none" ? buildMyRetreatMinistry({
    teachers,
    groups,
    groupStaff,
    schedule,
    segments,
    movements,
    posts,
    preferredNames: [memberName, user?.displayName],
  }) : { matchedStaffId: null, matchedName: null, groups: [], duties: [] }, [currentRetreat, groupStaff, groups, memberName, movements, posts, roles, schedule, segments, teachers, user?.displayName]);

  return {
    user,
    roles,
    teamMemberships,
    memberName,
    today,
    connected,
    loaded,
    loadError,
    semesterLoaded,
    semesterError,
    semesterAssignmentLoaded,
    semesterAssignmentError,
    semesterAttendanceLoaded,
    semesterAttendanceError,
    retreatLoaded,
    retreatError,
    retreatAssignmentLoaded,
    retreatAssignmentError,
    retreatDutiesLoaded,
    retreatDutiesError,
    calendarLoaded,
    calendarError,
    requestsLoaded,
    requestsError,
    newFriendsLoaded,
    newFriendsError,
    semesterContextLoaded,
    semesterContextError,
    retreatContextLoaded,
    retreatContextError,
    currentSemester,
    semesterPhase: featuredSemester?.phase ?? null,
    currentRetreat,
    homeActions,
    requests,
    requestSummary: requestSummary(requests),
    newFriends,
    newFriendSummary: summarizeNewFriends(newFriends, Number(today.slice(0, 4))),
    personalApplication,
    personalAttendance,
    personalRetreat,
  };
}
