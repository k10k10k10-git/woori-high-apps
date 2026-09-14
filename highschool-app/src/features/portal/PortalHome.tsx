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
import { sessionDisplayLabel } from "@/features/semester/sessionKind";
import type { Semester, Session } from "@/features/semester/types";
import {
  canAccessArea,
  canAccessSundayTeam,
  ownSundayTeam,
  canEditArea,
  iguardScopeOf,
  describeRoles,
  describeRolesHint,
  retreatEntryHref,
} from "./accessPolicy";
import SharedMinistryCalendar, { calendarKindForSourceSite, calendarSourceSiteForKind, SHARED_CALENDAR_KIND_OPTIONS, type SharedCalendarItem } from "./SharedMinistryCalendar";
import { HomeStart } from "./HomeStart";
import { buildHomeEntry } from "./homeEntry";
import { buildHomeActions } from "./homeActions";
import HomeAgendaSummary from "./HomeAgendaSummary";
import { getMonthlyMinistry } from "@/features/ministryGuide/ministryGuideContent";
import { dailyMinistryMessage, friendlyMinistryName, seoulDateKey } from "./dailyMinistryMessage";

import { MINISTRY_AREA_LABELS, SUNDAY_MINISTRY_TEAMS } from "./featureCatalog";
import { activeTeamKeys, canAccessOperationsCenter } from "@/features/teams/teamModel";

export default function PortalHome() {
  const router = useRouter();
  const { user, loading, roles, teamMemberships, memberName, signIn, signOut } = useAuth();
  const [semesters, setSemesters] = useState<Semester[]>([]);
  const [retreats, setRetreats] = useState<Retreat[]>([]);
  const [periods, setPeriods] = useState<RetreatPeriodWithOwner[]>([]);
  const [sessionState, setSessionState] = useState<{ semesterId: string; items: Session[] }>({
    semesterId: "",
    items: [],
  });
  // 로드 실패는 경로별로 모으고(마지막 하나만 보이던 문제), 저장·삭제 실패는 따로 둔다.
  const { fail, ok, message: dataError } = useLoadErrors(user?.uid ?? "");
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

  useEffect(() => {
    if (!user || !assignedSundayTeam || teamMemberships?.[assignedSundayTeam]?.role === "viewer") return;
    const key = `woori-team-entry:${user.uid}`;
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, "1");
    router.replace(`/teams/${assignedSundayTeam}`);
  }, [assignedSundayTeam, router, teamMemberships, user]);

  useEffect(() => {
    if (!user || !canAccessArea("home", roles)) return;

    const unsubs = [
      subscribeToRetreats(
        (retreatList) => {
          setRetreats([...retreatList].sort((a, b) => b.year - a.year || b.createdAt - a.createdAt));
          ok("수련회 목록");
        },
        fail("수련회 목록"),
      ),
    ];
    if (semesterAllowed) {
      unsubs.push(subscribeSemesters(
        (list) => { setSemesters(list); ok("학기 목록"); },
        fail("학기 목록"),
      ));
    }
    return () => unsubs.forEach((unsubscribe) => unsubscribe());
  }, [user, roles, semesterAllowed, fail, ok]);

  const currentSemester = useMemo(() => {
    return semesters.find((semester) => {
      const { startDate, endDate } = semester.meta;
      return !!startDate && !!endDate && startDate <= today && today <= endDate;
    }) ?? semesters[0] ?? null;
  }, [semesters, today]);

  // user 가드가 필요하다 — 로그아웃해도 semesters 상태는 남아 currentSemester가 유지되므로,
  // 가드가 없으면 인증이 끊긴 채 재구독해 엉뚱한 permission_denied 배너가 뜬다.
  useEffect(() => {
    if (!user || !currentSemester) return;
    return subscribeSessions(
      currentSemester.id,
      items => { setSessionState({ semesterId: currentSemester.id, items }); ok("회차"); },
      fail("회차"),
    );
  }, [user, currentSemester, fail, ok]);

  const sessions = useMemo(
    () => sessionState.semesterId === currentSemester?.id ? sessionState.items : [],
    [currentSemester?.id, sessionState],
  );

  useEffect(() => {
    if (!user || !canAccessArea("home", roles)) return;
    return subscribeToMilestones((v) => { setMilestones(v); ok("공유 일정"); }, fail("공유 일정"));
  }, [user, roles, fail, ok]);

  // 회차 구독과 같은 이유로 user 가드가 필요하다 — 로그아웃해도 retreats 상태가 남아
  // 인증이 끊긴 채 재구독하면서 엉뚱한 permission_denied 배너가 뜬다.
  // 같은 날짜의 기간은 목록 순서가 우선순위다. 이름만 바뀌면 구독을 유지하고 ID 순서는 보존한다.
  const retreatIdsKey = JSON.stringify(retreats.map((retreat) => retreat.id));
  useEffect(() => {
    if (!user) return;
    return subscribeToAllRetreatPeriods(
      JSON.parse(retreatIdsKey) as string[],
      (v) => { setPeriods(v); ok("수련회 기간"); },
      fail("수련회 기간"),
    );
  }, [user, retreatIdsKey, fail, ok]);

  const currentRetreat = useMemo(() => {
    const active = periods.find((period) => period.startDate <= today && today <= period.endDate);
    if (active) return retreats.find((retreat) => retreat.id === active.retreatId) ?? null;
    const next = periods.find((period) => period.startDate >= today);
    return retreats.find((retreat) => retreat.id === next?.retreatId) ?? retreats[0] ?? null;
  }, [periods, retreats, today]);
  const semesterCalendarHref = currentSemester
    ? operationsAllowed
      ? `/operations/semesters/${encodeURIComponent(currentSemester.id)}/overview`
      : assignedSundayTeam
        ? `/teams/${assignedSundayTeam}/terms/${encodeURIComponent(currentSemester.id)}/overview`
        : "/teams"
    : operationsAllowed ? "/operations/semesters" : "/teams";
  const calendarItems = useMemo<SharedCalendarItem[]>(() => {
    const semesterItems: SharedCalendarItem[] = currentSemester
      ? sessions.map((session) => ({
          id: `semester-${session.id}`,
          date: session.date,
          ...(session.endDate ? { endDate: session.endDate } : {}),
          title: sessionDisplayLabel(session),
          kind: "semester" as const,
          href: semesterCalendarHref,
        }))
      : [];
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
    const sharedItems: SharedCalendarItem[] = milestones.map((milestone) => ({
      id: `shared-${milestone.id}`,
      date: milestone.targetDate,
      title: milestone.title,
      kind: calendarKindForSourceSite(milestone.sourceSite),
      done: milestone.done,
      editable: true,
    }));
    return [...semesterItems, ...retreatItems, ...sharedItems].sort((a, b) => a.date.localeCompare(b.date));
  }, [currentSemester, milestones, periods, retreats, roles, semesterCalendarHref, sessions]);

  const homeActions = useMemo(() => {
    return buildHomeActions(calendarItems, today);
  }, [calendarItems, today]);
  const homeEntry = buildHomeEntry({ roles, actions: homeActions, semesterId: currentSemester?.id,
    retreat: currentRetreat ?? undefined,
    fieldActive: periods.some(period => period.retreatId === currentRetreat?.id && period.startDate <= today && today <= period.endDate),
    assignedTeamKeys,
    operationsAllowed,
  });

  async function submitSchedule() {
    if (!scheduleDraft) return;
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
              <span className="mt-1 block text-[11px]">이 주소를 통합관리자에게 알려주시면 배정이 빠릅니다.</span>
            </p>
          )}
          <div className="mt-5 grid gap-2 text-left">
            <p className="text-xs font-semibold text-slate-500">요청 방법</p>
            <Link href="/field" className="btn-primary justify-center">수련회 이가드 접근 요청</Link>
            <p className="text-xs leading-5 text-slate-500">
              팀·주일 운영·학기 운영·수련회 행정은 요청 버튼이 따로 없습니다.
              담당 교역자나 통합관리자에게 위 이메일과 맡을 사역을 알려주세요.
            </p>
            <Link href="/suggestions" className="btn-secondary justify-center">건의사항으로 문의하기</Link>
          </div>
          <button onClick={() => void signOut()} className="mt-6 text-sm text-slate-500 underline">다른 계정으로 로그인</button>
        </div>
      </main>
    );
  }

  return (
    <div className="app-page">
      <main className="page-container">
        {loadError && <div className="mb-5 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">⚠ {loadError}</div>}

        <section className="page-hero home-hero mb-7 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(420px,0.72fr)] lg:items-end">
          <div className="min-w-0">
            <h1 className="page-title">
              <span className="block">{friendlyName},</span>
              <span className="block">{dailyMessage.encouragement}</span>
            </h1>
            <p className="page-description">{dailyMessage.verse.text} {dailyMessage.verse.reference}</p>
          </div>
          <HomeAgendaSummary actions={homeActions} />
        </section>

        <HomeStart entry={homeEntry} roleLabel={describeRoles(roles)} />

        <section className="grid gap-5 lg:grid-cols-3">
          {operationsAllowed && <Link href={currentSemester ? `/operations/semesters/${encodeURIComponent(currentSemester.id)}/overview` : "/operations/semesters"} className="card home-domain-card home-domain-card--semester group p-6 pl-7 sm:p-7 sm:pl-8" data-hover>
            <div className="flex items-center justify-between">
              <span className="tag home-domain-chip--semester px-3 py-1.5">운영센터</span>
              <span className="home-domain-arrow--semester grid h-9 w-9 place-items-center rounded-full transition group-hover:translate-x-1">→</span>
            </div>
            <h2 className="mt-6 text-2xl font-bold tracking-[-0.025em]">{currentSemester?.meta.title ?? "등록된 학기가 없습니다"}</h2>
            <p className="mt-2 text-sm leading-6 text-slate-500">훈련·사역팀 출석, 수료, 커리큘럼과 자료를 관리합니다.</p>
          </Link>}

          {sundayTeams.length > 0 && <Link href={sundayHref} className="card home-domain-card home-domain-card--sunday group p-6 pl-7 sm:p-7 sm:pl-8" data-hover>
            <div className="flex items-center justify-between">
              <span className="tag home-domain-chip--sunday px-3 py-1.5">팀</span>
              <span className="home-domain-arrow--sunday grid h-9 w-9 place-items-center rounded-full transition group-hover:translate-x-1">→</span>
            </div>
            <h2 className="mt-6 text-2xl font-bold tracking-[-0.025em]">{sundayTitle}</h2>
            <p className="mt-2 text-sm leading-6 text-slate-500">{sundayDescription}</p>
          </Link>}

          {(retreatAdminAllowed || fieldAllowed) && <Link href={currentRetreat ? retreatEntryHref(currentRetreat.id, roles) : "/events"} className="card home-domain-card home-domain-card--vacation group p-6 pl-7 sm:p-7 sm:pl-8" data-hover>
            <div className="flex items-center justify-between">
              <span className="tag home-domain-chip--vacation px-3 py-1.5">행사</span>
              <span className="home-domain-arrow--vacation grid h-9 w-9 place-items-center rounded-full transition group-hover:translate-x-1">→</span>
            </div>
            <h2 className="mt-6 text-2xl font-bold tracking-[-0.025em]">{currentRetreat ? `${currentRetreat.year}년 ${currentRetreat.name}` : "등록된 수련회가 없습니다"}</h2>
            <p className="mt-2 text-sm leading-6 text-slate-500">행정 편성과 이가드 현장 운영을 같은 수련회 데이터로 연결합니다.</p>
          </Link>}
        </section>

        <Link href="/library/guide" className="home-ministry-brief group mt-7" data-hover>
          <div className="home-ministry-brief__month">
            <span>{monthlyMinistry.month}</span>월
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="section-kicker">THIS MONTH</p>
              <span className="guide-status">사역계획 가안</span>
            </div>
            <h2>{monthlyMinistry.curriculum}</h2>
            <div className="home-ministry-brief__focus">
              {monthlyMinistry.focus.map((item) => <span key={item}>{item}</span>)}
            </div>
          </div>
          <span className="home-ministry-brief__action">사역 가이드 <b aria-hidden="true">→</b></span>
        </Link>

        <section className="mt-7 grid gap-6">
          <SharedMinistryCalendar
            items={calendarItems}
            canEdit={canEditSchedule}
            onAdd={(date) => setScheduleDraft({ date, title: "", kind: "main" })}
            onEdit={(item) => setScheduleDraft({ id: item.id.replace(/^shared-/, ""), date: item.date, title: item.title, kind: item.kind })}
            onDelete={async (item) => {
              setActionError(null);
              try {
                await deleteMilestone(item.id.replace(/^shared-/, ""));
              } catch (error) {
                setActionError(error instanceof Error ? error.message : String(error));
              }
            }}
          />

          <div className="grid gap-4 lg:grid-cols-2">
            <section className="surface-panel order-2 p-5 sm:p-6">
              <h2 className="text-lg font-bold">내 담당 사역</h2>
              <p className="mt-1 text-xs text-slate-400">현재 계정이 맡은 운영 영역과 권한을 표시합니다.</p>
              <div className="mt-4 rounded-xl bg-slate-50 p-4 text-sm text-slate-600">
                <div className="flex items-center gap-2">
                  <strong>{memberName || user.displayName || "승인된 사용자"}</strong>
                  <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-bold text-slate-600 shadow-sm">{describeRoles(roles)}</span>
                </div>
                <p className="mt-1 text-xs text-slate-400">{describeRolesHint(roles)}</p>
              </div>
              <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
                {operationsAllowed && <MinistryArea href={currentSemester ? `/operations/semesters/${encodeURIComponent(currentSemester.id)}/overview` : "/operations/semesters"} label="학기 운영" description="접수·배치·전체 출석·수료 판정" tone="semester" />}
                {sundayTeams.length > 0 && <MinistryArea href={sundayHref} label={MINISTRY_AREA_LABELS.sunday} description={sundayDescription} tone="sunday" />}
                {retreatAdminAllowed && <MinistryArea href={currentRetreat ? `/events/${encodeURIComponent(currentRetreat.id)}/administration` : "/events"} label="행사 행정" description="명단·편성·물품·현장" tone="retreat" />}
                {fieldAllowed && <MinistryArea href={currentRetreat ? `/events/${encodeURIComponent(currentRetreat.id)}/field` : "/events"} label="행사 현장" description={iguardScopeOf(roles) === "all" ? "실행·기획·정보" : "현장 실행"} tone="field" />}
              </div>
            </section>
            <section className="surface-panel order-1 p-5 sm:p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-lg font-bold">지금 확인할 일</h2>
                  <p className="mt-1 text-xs text-slate-500">공유 준비 일정과 다음 사역을 날짜순으로 모았습니다.</p>
                </div>
                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold tabular-nums text-slate-600">{homeActions.length}건</span>
              </div>
              <div className="mt-4 space-y-2">
                {homeActions.length > 0 ? homeActions.map((item) => {
                  const content = (
                    <>
                      <span className={`home-action-date home-action-date--${item.urgency}`}>{item.dayLabel}</span>
                      <span className="min-w-0 flex-1">
                        <strong className="block truncate text-sm text-slate-800">{item.title}</strong>
                        <span className="mt-0.5 block text-[11px] text-slate-500">{item.meta}</span>
                      </span>
                      {item.href && <span aria-hidden="true" className="text-slate-300">→</span>}
                    </>
                  );
                  return item.href
                    ? <Link key={item.id} href={item.href} className="home-action-row">{content}</Link>
                    : <div key={item.id} className="home-action-row">{content}</div>;
                }) : (
                  <div className="rounded-xl bg-slate-50 px-4 py-8 text-center">
                    <p className="text-sm font-semibold text-slate-700">급히 확인할 일이 없습니다.</p>
                    <p className="mt-1 text-xs text-slate-400">공유 일정을 추가하면 여기에 나타납니다.</p>
                  </div>
                )}
              </div>
              <Link href="/help/feedback" className="mt-4 inline-flex min-h-10 items-center text-xs font-semibold text-[var(--color-primary)] hover:underline">문제 제보 →</Link>
            </section>
          </div>
        </section>
        {scheduleDraft && (
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

function MinistryArea({ href, label, description, tone }: { href: string; label: string; description: string; tone: "semester" | "sunday" | "retreat" | "field" }) {
  // 톤별 색은 .ministry-area--{tone}(portal-surfaces.css)이 --domain-* 토큰으로 정한다.
  return <Link href={href} className={`ministry-area ministry-area--${tone} rounded-xl p-3.5 transition hover:-translate-y-0.5`}><strong className="text-sm">{label}</strong><p className="mt-1 text-xs">{description}</p></Link>;
}
