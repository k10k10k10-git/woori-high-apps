"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { X } from "@phosphor-icons/react";
import OverlayShell from "@/components/OverlayShell";
import { useAuth } from "@/context/AuthContext";
import LandingPage from "@/features/landing/LandingPage";
import { useLoadErrors } from "@/lib/useLoadErrors";
import {
  deleteMilestone,
  saveMilestone,
  subscribeToAllRetreatPeriods,
  subscribeToMilestones,
  subscribeToRetreats,
  updateMilestone,
  type RetreatPeriodWithOwner,
} from "@/lib/db";
import type { Milestone } from "@/lib/types";
import type { Retreat } from "@/lib/types";
import { subscribeSemesters, subscribeSessions } from "@/features/semester/db";
import { featuredTerm } from "@/features/semester/termPhase";
import { sessionDisplayLabel } from "@/features/semester/sessionKind";
import type { Semester, Session } from "@/features/semester/types";
import {
  canAccessArea,
  canAccessSundayTeam,
  ownSundayTeam,
  canEditArea,
  iguardScopeOf,
  describeRoles,
  retreatEntryHref,
} from "./accessPolicy";
import SharedMinistryCalendar, { calendarKindForSourceSite, calendarSourceSiteForKind, SHARED_CALENDAR_KIND_OPTIONS, type SharedCalendarItem } from "./SharedMinistryCalendar";
import { HomeStart } from "./HomeStart";
import { buildHomeEntry } from "./homeEntry";
import { buildHomeActions } from "./homeActions";
import HomeAgendaSummary from "./HomeAgendaSummary";
import { getMonthlyMinistry } from "@/features/ministryGuide/ministryGuideContent";
import { dailyMinistryMessage, friendlyMinistryName, seoulDateKey } from "./dailyMinistryMessage";

import { SUNDAY_MINISTRY_TEAMS } from "./featureCatalog";
import { selectRetreatForWork } from "@/lib/retreatSelection";
import { activeTeamKeys, canAccessOperationsCenter, canEditTeam } from "@/features/teams/teamModel";
import styles from "./PortalHome.module.css";

export default function PortalHome() {
  const { user, roles } = useAuth();
  // 계정·역할 전환에는 조회 결과와 공유 일정 초안을 함께 폐기한다.
  return <PortalHomeWorkspace key={`${user?.uid ?? "guest"}:${roles.semester}:${roles.retreat}`} />;
}

function PortalHomeWorkspace() {
  const router = useRouter();
  const { user, loading, roleError, retryRoles, roles, teamMemberships, memberName, signIn, signOut } = useAuth();
  const [semesters, setSemesters] = useState<Semester[]>([]);
  const [retreats, setRetreats] = useState<Retreat[]>([]);
  const [periods, setPeriods] = useState<RetreatPeriodWithOwner[]>([]);
  const [sourceStatus, setSourceStatus] = useState<Record<string, "ready" | "error">>({});
  const [sessionState, setSessionState] = useState<{ uid: string; semesterId: string; items: Session[] }>({
    uid: "",
    semesterId: "",
    items: [],
  });
  // 로드 실패는 경로별로 모으고(마지막 하나만 보이던 문제), 저장·삭제 실패는 따로 둔다.
  const { fail, ok, message: dataError } = useLoadErrors(user?.uid ?? "");
  const [subscriptionGeneration, setSubscriptionGeneration] = useState(0);
  const [actionError, setActionError] = useState<string | null>(null);
  const loadError = dataError ?? actionError;
  // 공유 일정(prepMilestones) — 행정·이가드가 함께 쓰는 전역 노드. 스탭은 Rules상 쓰기 불가.
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [scheduleDraft, setScheduleDraft] = useState<{ id?: string; date: string; title: string; kind: SharedCalendarItem["kind"] } | null>(null);
  const canEditSchedule = canEditArea("retreat-admin", roles) || iguardScopeOf(roles) === "all";
  const [today] = useState(seoulDateKey);
  const monthlyMinistry = getMonthlyMinistry(Number(today.slice(5, 7)));
  const dailyMessage = dailyMinistryMessage(today);
  const friendlyName = friendlyMinistryName(memberName || user?.displayName);

  const semesterAllowed = canAccessArea("semester", roles);
  const assignedTeamKeys = teamMemberships ? activeTeamKeys(teamMemberships) : undefined;
  const operationsAllowed = canAccessOperationsCenter(roles, teamMemberships);
  const sundayTeams = SUNDAY_MINISTRY_TEAMS.filter((team) => canAccessSundayTeam(team.key, roles, assignedTeamKeys));
  const assignedSundayTeam = ownSundayTeam(roles, assignedTeamKeys);
  const sundayHref = assignedSundayTeam ? `/teams/${assignedSundayTeam}` : "/teams";
  const sundayTitle = sundayTeams.length === 1 ? sundayTeams[0].label : "팀별 운영 공간";
  const sundayDescription = sundayTeams.length === 1
    ? `${sundayTeams[0].label}의 ${sundayTeams[0].hint} 업무를 확인합니다.`
    : "새친구·행정은 연중 관리하고, 찬양·예배는 팀별 모임과 주일 준비를 이어갑니다.";
  const fieldAllowed = canAccessArea("retreat-field", roles);
  const retreatAdminAllowed = canAccessArea("retreat-admin", roles);
  const scope = user?.uid ?? "";
  const authReady = !!user && !loading && !roleError;
  const semesterListStatus = sourceStatus[`${scope}:semesters`];
  const retreatListStatus = sourceStatus[`${scope}:retreats`];

  useEffect(() => {
    if (!authReady || !user || !assignedSundayTeam || teamMemberships?.[assignedSundayTeam]?.role === "viewer") return;
    const key = `woori-team-entry:${user.uid}`;
    try {
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, "1");
    } catch { return; } // 저장소가 차단된 브라우저에서는 홈의 업무 바로가기를 그대로 이용한다.
    router.replace(`/teams/${assignedSundayTeam}`);
  }, [authReady, assignedSundayTeam, router, teamMemberships, user]);

  useEffect(() => {
    if (!authReady || !user || !canAccessArea("home", roles)) return;

    let active = true;
    const unsubs = [
      subscribeToRetreats(
        (retreatList) => {
          if (!active) return;
          setRetreats([...retreatList].sort((a, b) => b.year - a.year || b.createdAt - a.createdAt));
          setSourceStatus((current) => ({ ...current, [`${scope}:retreats`]: "ready" }));
          ok("수련회 목록");
        },
        (error) => { if (!active) return; setSourceStatus((current) => ({ ...current, [`${scope}:retreats`]: "error" })); fail("수련회 목록")(error); },
      ),
    ];
    if (semesterAllowed) {
      unsubs.push(subscribeSemesters(
        (list) => { if (!active) return; setSemesters(list); setSourceStatus((current) => ({ ...current, [`${scope}:semesters`]: "ready" })); ok("학기 목록"); },
        (error) => { if (!active) return; setSourceStatus((current) => ({ ...current, [`${scope}:semesters`]: "error" })); fail("학기 목록")(error); },
      ));
    }
    return () => { active = false; unsubs.forEach((unsubscribe) => unsubscribe()); };
  }, [authReady, user, roles, scope, semesterAllowed, fail, ok, subscriptionGeneration]);

  const featuredSemester = useMemo(() => semesterAllowed && semesterListStatus === "ready" ? featuredTerm(semesters, today) : null, [semesterAllowed, semesterListStatus, semesters, today]);
  const currentSemester = featuredSemester?.semester ?? null;

  // user 가드가 필요하다 — 로그아웃해도 semesters 상태는 남아 currentSemester가 유지되므로,
  // 가드가 없으면 인증이 끊긴 채 재구독해 엉뚱한 permission_denied 배너가 뜬다.
  useEffect(() => {
    if (!authReady || !user || !currentSemester) return;
    let active = true;
    const unsubscribe = subscribeSessions(
      currentSemester.id,
      items => { if (!active) return; setSessionState({ uid: scope, semesterId: currentSemester.id, items }); setSourceStatus((current) => ({ ...current, [`${scope}:sessions:${currentSemester.id}`]: "ready" })); ok("회차"); },
      (error) => { if (!active) return; setSourceStatus((current) => ({ ...current, [`${scope}:sessions:${currentSemester.id}`]: "error" })); fail("회차")(error); },
    );
    return () => { active = false; unsubscribe(); };
  }, [authReady, user, currentSemester, scope, fail, ok, subscriptionGeneration]);

  const sessions = useMemo(
    () => sessionState.uid === scope && sessionState.semesterId === currentSemester?.id ? sessionState.items : [],
    [currentSemester?.id, scope, sessionState],
  );

  useEffect(() => {
    if (!authReady || !user || !canAccessArea("home", roles)) return;
    let active = true;
    const unsubscribe = subscribeToMilestones((v) => { if (!active) return; setMilestones(v); setSourceStatus((current) => ({ ...current, [`${scope}:milestones`]: "ready" })); ok("공유 일정"); },
      (error) => { if (!active) return; setSourceStatus((current) => ({ ...current, [`${scope}:milestones`]: "error" })); fail("공유 일정")(error); });
    return () => { active = false; unsubscribe(); };
  }, [authReady, user, roles, scope, fail, ok, subscriptionGeneration]);

  // 회차 구독과 같은 이유로 user 가드가 필요하다 — 로그아웃해도 retreats 상태가 남아
  // 인증이 끊긴 채 재구독하면서 엉뚱한 permission_denied 배너가 뜬다.
  // 같은 날짜의 기간은 목록 순서가 우선순위다. 이름만 바뀌면 구독을 유지하고 ID 순서는 보존한다.
  const retreatIdsKey = JSON.stringify((retreatListStatus === "ready" ? retreats : []).map((retreat) => retreat.id));
  const retreatPeriodStatus = sourceStatus[`${scope}:periods:${retreatIdsKey}`];
  useEffect(() => {
    if (!authReady || !user || !canAccessArea("home", roles)) return;
    let active = true;
    const unsubscribe = subscribeToAllRetreatPeriods(
      JSON.parse(retreatIdsKey) as string[],
      (v) => { if (!active) return; setPeriods(v); setSourceStatus((current) => ({ ...current, [`${scope}:periods:${retreatIdsKey}`]: "ready" })); ok("수련회 기간"); },
      (error) => { if (!active) return; setSourceStatus((current) => ({ ...current, [`${scope}:periods:${retreatIdsKey}`]: "error" })); fail("수련회 기간")(error); },
    );
    return () => { active = false; unsubscribe(); };
  }, [authReady, user, roles, retreatIdsKey, scope, fail, ok, subscriptionGeneration]);

  const currentRetreat = useMemo(() => {
    if (retreatListStatus !== "ready" || retreatPeriodStatus !== "ready") return null;
    return selectRetreatForWork(retreats, periods, today);
  }, [periods, retreatListStatus, retreatPeriodStatus, retreats, today]);
  const calendarStatuses = [
    retreatListStatus,
    retreatPeriodStatus,
    sourceStatus[`${scope}:milestones`],
    ...(semesterAllowed ? [semesterListStatus, ...(currentSemester ? [sourceStatus[`${scope}:sessions:${currentSemester.id}`]] : [])] : []),
  ];
  const calendarPending = calendarStatuses.some((status) => !status);
  const calendarFailed = calendarStatuses.some((status) => status === "error");
  const semesterCalendarHref = currentSemester
    ? operationsAllowed
      ? `/operations/semesters/${encodeURIComponent(currentSemester.id)}/overview`
      : assignedSundayTeam
        ? `/teams/${assignedSundayTeam}/terms/${encodeURIComponent(currentSemester.id)}/overview`
        : "/teams"
    : operationsAllowed ? "/operations/semesters" : "/teams";
  const calendarItems = useMemo<SharedCalendarItem[]>(() => {
    const visibleRetreats = retreatListStatus === "ready" ? retreats : [];
    const visiblePeriods = retreatListStatus === "ready" && retreatPeriodStatus === "ready" ? periods : [];
    const visibleMilestones = sourceStatus[`${scope}:milestones`] === "ready" ? milestones : [];
    const semesterItems: SharedCalendarItem[] = currentSemester
      ? sessions.map((session) => ({
          id: `semester-${session.id}`,
          date: session.date,
          ...(session.endDate ? { endDate: session.endDate } : {}),
          title: sessionDisplayLabel(session),
          noticeOnly: session.type === "휴강",
          kind: "semester" as const,
          href: semesterCalendarHref,
        }))
      : [];
    const retreatItems = visiblePeriods.map((period) => {
      const retreat = visibleRetreats.find((item) => item.id === period.retreatId);
      return {
        id: `retreat-${period.retreatId}-${period.id}`,
        date: period.startDate,
        endDate: period.endDate,
        title: `${retreat?.name ?? "수련회"}${period.label ? ` · ${period.label}` : ""}`,
        kind: "retreat" as const,
        href: retreatEntryHref(period.retreatId, roles),
      };
    });
    const sharedItems: SharedCalendarItem[] = visibleMilestones.map((milestone) => ({
      id: `shared-${milestone.id}`,
      date: milestone.targetDate,
      title: milestone.title,
      kind: calendarKindForSourceSite(milestone.sourceSite),
      done: milestone.done,
      editable: true,
    }));
    return [...semesterItems, ...retreatItems, ...sharedItems].sort((a, b) => a.date.localeCompare(b.date));
  }, [currentSemester, milestones, periods, retreatListStatus, retreatPeriodStatus, retreats, roles, scope, semesterCalendarHref, sessions, sourceStatus]);

  const homeActions = useMemo(() => {
    return buildHomeActions(calendarItems, today);
  }, [calendarItems, today]);
  const homeEntry = buildHomeEntry({ roles, actions: homeActions, semesterId: currentSemester?.id,
    retreat: currentRetreat ?? undefined,
    fieldActive: periods.some(period => period.retreatId === currentRetreat?.id && period.startDate <= today && today <= period.endDate),
    assignedTeamKeys,
    operationsAllowed,
  });

  const attentionActions = homeActions.filter((item) => item.urgency !== "upcoming");
  const upcomingActions = buildHomeActions(calendarItems.filter((item) => item.date > today), today, 3);
  const retreatContext = retreatListStatus === "error" || retreatPeriodStatus === "error"
    ? "수련회를 확인할 수 없습니다"
    : !retreatListStatus || !retreatPeriodStatus ? "수련회를 확인하는 중입니다…"
    : currentRetreat ? `${currentRetreat.year}년 ${currentRetreat.name}` : "등록된 수련회가 없습니다";
  const otherWork = [
    ...(operationsAllowed ? [{ href: semesterCalendarHref, label: "학기 운영", context: semesterListStatus === "error" ? "학기를 확인할 수 없습니다" : !semesterListStatus ? "학기를 확인하는 중입니다…" : currentSemester?.meta.title ?? "등록된 학기가 없습니다" }] : []),
    ...(sundayTeams.length > 0 ? [{ href: sundayHref, label: sundayTitle, context: sundayDescription }] : []),
    ...(retreatAdminAllowed || fieldAllowed ? [{ href: currentRetreat ? retreatEntryHref(currentRetreat.id, roles) : "/events", label: "행사 업무", context: retreatContext }] : []),
  ].filter((item, index, list) => item.href.split("?")[0] !== homeEntry?.href.split("?")[0] && list.findIndex((other) => other.href === item.href) === index);

  async function submitSchedule() {
    if (!scheduleDraft || !authReady || !canEditSchedule) return;
    const title = scheduleDraft.title.trim();
    if (!title) return;
    setActionError(null);
    try {
      if (scheduleDraft.id) {
        await updateMilestone(scheduleDraft.id, {
          title,
          targetDate: scheduleDraft.date,
          sourceSite: calendarSourceSiteForKind(scheduleDraft.kind),
        });
      } else {
        await saveMilestone({
          title,
          targetDate: scheduleDraft.date,
          done: false,
          sourceSite: calendarSourceSiteForKind(scheduleDraft.kind),
        });
      }
      setScheduleDraft(null);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error));
    }
  }

  if (loading) {
    return <main className="min-h-screen grid place-items-center text-slate-500">불러오는 중…</main>;
  }

  if (!user) {
    return <LandingPage signIn={signIn} />;
  }

  if (roleError) {
    return <main className="min-h-screen grid place-items-center px-6 py-10"><div className="w-full max-w-md text-center" role="alert">
      <h1 className="text-xl font-bold">담당 사역을 확인하지 못했습니다</h1>
      <p className="mt-2 text-sm leading-6 text-slate-500">권한 정보를 불러오는 중 문제가 생겼습니다. 잠시 후 다시 시도해 주세요.</p>
      <button type="button" onClick={retryRoles} className="btn-primary mt-5">다시 시도</button>
      <Link href="/library/help#connection" className="btn-secondary mt-3">접속 문제 도움말</Link>
      <Link href="/help/feedback" className="btn-secondary mt-3">접속 문제 문의하기</Link>
    </div></main>;
  }

  if (!canAccessArea("home", roles)) {
    return (
      // 여기까지 온 사람은 로그인은 됐는데 맡은 영역이 없다. 예전엔 "이가드 접근 요청"
      // 버튼 하나뿐이라, 이가드와 무관한 신규 스탭·담임교사는 무엇을 어디에 요청해야
      // 하는지 알 수 없는 막다른 길이었다. 로그인한 계정과 다음 행동을 함께 보여준다.
      <main className="min-h-screen grid place-items-center px-6 py-10">
        <div className="w-full max-w-md text-center">
          <h1 className="text-xl font-bold">접근 승인이 필요합니다</h1>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            로그인은 되었지만 이 계정에 배정된 사역이 아직 없습니다.
            통합관리자가 역할을 배정하면 바로 사용할 수 있습니다.
          </p>
          {user.email && (
            <p className="mt-4 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500">
              로그인한 계정 <strong className="text-slate-700">{user.email}</strong>
              <span className="mt-1 block text-xs">이 주소와 담당 팀 이름을 담당 팀장 또는 교역자에게 알려 주세요.</span>
            </p>
          )}
          <div className="mt-5 grid gap-2 text-left">
            <p className="text-sm leading-6 text-slate-500">담당 팀장·교역자에게 로그인 이메일과 맡을 팀을 알려 주세요. 교역자 또는 통합관리자가 역할과 팀 연결을 확인해 드립니다.</p>
            <Link href="/library/help#access" className="btn-primary justify-center">사용법·권한 안내 보기</Link>
            <Link href="/help/feedback" className="btn-secondary justify-center">승인·팀 연결 문의하기</Link>
            <details className="mt-2"><summary className="min-h-11 cursor-pointer text-sm leading-6 text-slate-500">수련회 현장 스탭으로 참여하나요?</summary><p className="text-sm leading-6 text-slate-500">아래 요청은 수련회 현장(이가드) 접근을 위한 것입니다. 일반 사역팀·훈련 역할 연결은 담당자에게 알려 주세요.</p><Link href="/field" className="btn-secondary mt-2 justify-center">수련회 현장 접근 요청</Link></details>
          </div>
          <button onClick={() => void signOut()} className="mt-6 text-sm text-slate-500 underline">다른 계정으로 로그인</button>
        </div>
      </main>
    );
  }

  return (
    <div className="app-page">
      <main className="page-container">
        {loadError && <div className="team-first-alert mb-5" role="alert">{dataError ? "일부 사역 일정과 업무를 확인하지 못했습니다. 다시 불러오거나 사용 안내를 확인해 주세요." : "변경 내용을 저장하지 못했습니다. 잠시 후 다시 시도해 주세요."}{dataError && <button className="btn-secondary" onClick={() => setSubscriptionGeneration((value) => value + 1)}>다시 불러오기</button>}<Link className="btn-secondary" href="/library/help#connection">연결 문제 도움말</Link></div>}

        <section className="page-hero home-hero mb-6">
          <h1 className="page-title"><span className="block">{friendlyName},</span><span className="block">{dailyMessage.encouragement}</span></h1>
          <p className="page-description">{dailyMessage.verse.text} {dailyMessage.verse.reference}</p>
        </section>

        <section aria-label="내 업무">
          <HomeStart entry={homeEntry} roleLabel={describeRoles(roles)} userId={user.uid} viewOnly={!!assignedSundayTeam && !canEditTeam(assignedSundayTeam, roles, teamMemberships)} />
          {otherWork.length > 0 && <div className={styles.otherWork}><h2>다른 담당 업무</h2><div>{otherWork.map((item) => <Link key={item.href} href={item.href}><strong>{item.label}</strong><span>{item.context}</span><span aria-hidden="true">→</span></Link>)}</div></div>}
        </section>

        <div className={styles.agenda}>
          <section className={styles.attention} aria-labelledby="home-attention-title">
            <div className={styles.sectionHeading}><h2 id="home-attention-title">오늘 확인할 일</h2><span>{calendarFailed ? "일부 조회 실패" : calendarPending ? "확인 중" : `${attentionActions.length}건`}</span></div>
            <p>오늘 진행하는 일정과 기한이 지난 준비를 확인합니다.</p>
            <div className={styles.actionList}>{attentionActions.length > 0 ? attentionActions.map((item) => {
              const content = <><span className={`home-action-date home-action-date--${item.urgency}`}>{item.dayLabel}</span><span className={styles.actionText}><strong>{item.title}</strong><small>{item.meta}</small></span>{item.href && <span aria-hidden="true">→</span>}</>;
              return item.href ? <Link key={item.id} href={item.href} className="home-action-row">{content}</Link> : <div key={item.id} className="home-action-row">{content}</div>;
            }) : <p role={calendarFailed ? "alert" : calendarPending ? "status" : undefined} className={styles.empty}>{calendarFailed ? "일부 업무를 확인하지 못했습니다." : calendarPending ? "이번 주 업무를 확인하는 중입니다…" : "오늘 확인할 일정이나 기한이 지난 준비가 없습니다."}</p>}</div>
          </section>
          <section className={styles.upcoming} aria-label="다음 일정">{upcomingActions.length > 0 || (!calendarPending && !calendarFailed) ? <HomeAgendaSummary actions={upcomingActions} /> : <><h2>다음 공유 일정</h2><p role={calendarFailed ? "alert" : "status"}>{calendarFailed ? "일부 일정을 확인하지 못했습니다." : "일정을 확인하는 중입니다…"}</p></>}</section>
        </div>

        <details className={styles.calendar}><summary>전체 일정 보기·관리</summary>{calendarPending && calendarItems.length === 0 ? <p role="status">공유 사역 일정을 확인하는 중입니다…</p> : calendarFailed && calendarItems.length === 0 ? <p role="alert">일부 일정을 불러오지 못했습니다. 다시 불러오기를 눌러 주세요.</p> : <SharedMinistryCalendar
          items={calendarItems}
          canEdit={canEditSchedule}
          onAdd={(date) => setScheduleDraft({ date, title: "", kind: "main" })}
          onEdit={(item) => setScheduleDraft({ id: item.id.replace(/^shared-/, ""), date: item.date, title: item.title, kind: item.kind })}
          onDelete={async (item) => { setActionError(null); try { await deleteMilestone(item.id.replace(/^shared-/, "")); } catch (error) { setActionError(error instanceof Error ? error.message : String(error)); } }}
        />}</details>

        <div className={styles.guide}><Link href="/library/guide"><strong>{monthlyMinistry.month}월 사역 가이드</strong><span>{monthlyMinistry.curriculum}</span><small>사역계획 가안 · {monthlyMinistry.focus.join(" · ")}</small></Link><Link href="/help/feedback">문제 제보</Link></div>
        {authReady && canEditSchedule && scheduleDraft && (
          <OverlayShell
            label={scheduleDraft.id ? "공유 일정 수정" : "공유 일정 추가"}
            onClose={() => setScheduleDraft(null)}
            panelClassName="w-full max-w-sm"
          >
            <div className="modal-card w-full rounded-2xl bg-white p-5 shadow-2xl">
              <div className="flex items-start justify-between gap-3">
                <h3 className="font-bold text-slate-900">{scheduleDraft.id ? "공유 일정 수정" : "공유 일정 추가"}</h3>
                <button type="button" onClick={() => setScheduleDraft(null)} className="compact-icon-control -mr-1 -mt-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="공유 일정 창 닫기"><X aria-hidden="true" size={17} weight="bold" /></button>
              </div>
              <p className="mt-1 text-xs text-slate-500">고등부 전체가 함께 보는 일정입니다. 일정이 속한 사역 영역을 선택해 주세요.</p>
              <label className="mt-4 block text-sm">
                <span className="text-xs text-slate-500">날짜</span>
                <input
                  type="date"
                  value={scheduleDraft.date}
                  onChange={(event) => setScheduleDraft({ ...scheduleDraft, date: event.target.value })}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </label>
              <label className="mt-3 block text-sm">
                <span className="text-xs text-slate-500">일정 분류</span>
                <select
                  value={scheduleDraft.kind}
                  onChange={(event) => setScheduleDraft({ ...scheduleDraft, kind: event.target.value as SharedCalendarItem["kind"] })}
                  className="input mt-1 text-sm"
                >
                  {SHARED_CALENDAR_KIND_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>
              <label className="mt-3 block text-sm">
                <span className="text-xs text-slate-500">일정 내용</span>
                <input
                  data-autofocus
                  value={scheduleDraft.title}
                  onChange={(event) => setScheduleDraft({ ...scheduleDraft, title: event.target.value })}
                  onKeyDown={(event) => event.key === "Enter" && void submitSchedule()}
                  placeholder="예: 사역팀 모임 준비"
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </label>
              <div className="mt-5 flex justify-end gap-2">
                <button onClick={() => setScheduleDraft(null)} className="rounded-lg px-3 py-2 text-sm text-slate-500 hover:bg-slate-100">취소</button>
                <button
                  onClick={() => void submitSchedule()}
                  disabled={!scheduleDraft.title.trim() || !scheduleDraft.date}
                  className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
                >
                  저장
                </button>
              </div>
            </div>
          </OverlayShell>
        )}
      </main>
    </div>
  );
}
