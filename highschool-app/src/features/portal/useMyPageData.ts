"use client";

import { useEffect, useMemo, useState } from "react";
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
import {
  applicationAttendanceSummary,
  canSeeCalendarKind,
  findUniqueApplicationAssignment,
  requestSummary,
  summarizeNewFriends,
} from "./myPageDashboard";

const EMPTY_ATTENDANCE: Record<string, SessionAttendance> = {};

export function useMyPageData() {
  const { user, roles, memberName } = useAuth();
  const [today] = useState(seoulDateKey);
  const [connected, setConnected] = useState<boolean | null>(null);
  const [semesters, setSemesters] = useState<Semester[]>([]);
  const [retreats, setRetreats] = useState<Retreat[]>([]);
  const [periods, setPeriods] = useState<RetreatPeriodWithOwner[]>([]);
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [requests, setRequests] = useState<SiteRequest[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [applications, setApplications] = useState<Application[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [trainingClasses, setTrainingClasses] = useState<TrainingClass[]>([]);
  const [attendance, setAttendance] = useState<Record<string, SessionAttendance>>(EMPTY_ATTENDANCE);
  const [newFriends, setNewFriends] = useState<SundayNewFriend[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [teachers, setTeachers] = useState<TeacherAttendance[]>([]);
  const [groupStaff, setGroupStaff] = useState<Record<string, string[]>>({});
  const [schedule, setSchedule] = useState<IguardScheduleBlock[]>([]);
  const [segments, setSegments] = useState<IguardSegment[]>([]);
  const [movements, setMovements] = useState<IguardMovement[]>([]);
  const [posts, setPosts] = useState<IguardPost[]>([]);
  const [loaded, setLoaded] = useState(false);
  const { fail, ok, message: loadError } = useLoadErrors(`my-page|${user?.uid ?? "signed-out"}`);
  const hasPortalAccess = canAccessArea("home", roles);

  useEffect(() => {
    if (!user) return;
    const unsubs = [
      subscribeToConnection(setConnected),
      subscribeToMySiteRequests(user.uid, (values) => {
        setRequests(values);
        ok("내 요청");
      }, fail("내 요청")),
    ];
    if (hasPortalAccess) {
      unsubs.push(
        subscribeToRetreats((values) => {
          setRetreats([...values].sort((a, b) => b.year - a.year || b.createdAt - a.createdAt));
          setLoaded(true);
          ok("수련회 목록");
        }, fail("수련회 목록")),
        subscribeToMilestones((values) => {
          setMilestones(values);
          ok("공유 일정");
        }, fail("공유 일정")),
      );
    }
    if (canAccessArea("semester", roles)) {
      unsubs.push(subscribeSemesters((values) => {
        setSemesters(values);
        ok("학기 목록");
      }, fail("학기 목록")));
    }
    if (canAccessArea("sunday", roles) && canAccessSundayTeam("barnabas", roles)) {
      unsubs.push(subscribeSundayNewFriends((values) => {
        setNewFriends(values);
        ok("새친구");
      }, fail("새친구")));
    }
    return () => unsubs.forEach((unsubscribe) => unsubscribe());
  }, [fail, hasPortalAccess, ok, roles, user]);

  useEffect(() => {
    if (!user || !hasPortalAccess) return;
    return subscribeToAllRetreatPeriods(retreats.map((retreat) => retreat.id), (values) => {
      setPeriods(values);
      ok("수련회 기간");
    }, fail("수련회 기간"));
  }, [fail, hasPortalAccess, ok, retreats, user]);

  const currentSemester = useMemo(() => (
    semesters.find((semester) => {
      const { startDate, endDate } = semester.meta;
      return !!startDate && !!endDate && startDate <= today && today <= endDate;
    }) ?? semesters[0] ?? null
  ), [semesters, today]);

  useEffect(() => {
    if (!user || !currentSemester || !canAccessArea("semester", roles)) return;
    const sid = currentSemester.id;
    const unsubs = [
      subscribeSessions(sid, (values) => { setSessions(values); ok("학기 회차"); }, fail("학기 회차")),
      subscribeApplications(sid, (values) => { setApplications(values); ok("학기 신청"); }, fail("학기 신청")),
      subscribeTeams(sid, (values) => { setTeams(values); ok("사역팀"); }, fail("사역팀")),
      subscribeTrainingClasses(sid, (values) => { setTrainingClasses(values); ok("훈련 반"); }, fail("훈련 반")),
      subscribeAllAttendance(sid, (values) => { setAttendance(values); ok("학기 출석"); }, fail("학기 출석")),
    ];
    return () => unsubs.forEach((unsubscribe) => unsubscribe());
  }, [currentSemester, fail, ok, roles, user]);

  const currentRetreat = useMemo(() => {
    const active = periods.find((period) => period.startDate <= today && today <= period.endDate);
    if (active) return retreats.find((retreat) => retreat.id === active.retreatId) ?? null;
    const next = periods.find((period) => period.startDate >= today);
    return retreats.find((retreat) => retreat.id === next?.retreatId) ?? retreats[0] ?? null;
  }, [periods, retreats, today]);

  useEffect(() => {
    if (!user || !currentRetreat || iguardScopeOf(roles) === "none") return;
    const id = currentRetreat.id;
    const unsubs = [
      subscribeToGroups(id, (values) => { setGroups(values); ok("조 편성"); }, fail("조 편성")),
      subscribeToTeacherAttendances(id, (values) => { setTeachers(values); ok("교사 참석"); }, fail("교사 참석")),
      subscribeToIguardGroupStaff(id, (values) => { setGroupStaff(values); ok("조스탭"); }, fail("조스탭")),
      subscribeToIguardSchedule(id, (values) => { setSchedule(values); ok("현장 일정"); }, fail("현장 일정")),
      subscribeToIguardSegments(id, (values) => { setSegments(values); ok("현장 구간"); }, fail("현장 구간")),
      subscribeToIguardMovements(id, (values) => { setMovements(values); ok("현장 동선"); }, fail("현장 동선")),
      subscribeToIguardPosts(id, (values) => { setPosts(values); ok("현장 포스트"); }, fail("현장 포스트")),
    ];
    return () => unsubs.forEach((unsubscribe) => unsubscribe());
  }, [currentRetreat, fail, ok, roles, user]);

  const calendarItems = useMemo<SharedCalendarItem[]>(() => {
    const semesterHref = currentSemester ? `/semester/${encodeURIComponent(currentSemester.id)}` : "/semesters";
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
  }, [currentSemester, milestones, periods, retreats, roles, sessions]);

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
    memberName,
    today,
    connected,
    loaded: !hasPortalAccess || loaded,
    loadError,
    currentSemester,
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
