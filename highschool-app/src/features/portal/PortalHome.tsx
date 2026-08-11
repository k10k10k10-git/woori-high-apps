"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import LandingPage from "@/features/landing/LandingPage";
import { useLoadErrors } from "@/lib/useLoadErrors";
import {
  deleteMilestone,
  getRetreats,
  saveMilestone,
  subscribeToAllRetreatPeriods,
  subscribeToMilestones,
  updateMilestone,
  type RetreatPeriodWithOwner,
} from "@/lib/db";
import type { Milestone } from "@/lib/types";
import type { Retreat } from "@/lib/types";
import { getSemesters, subscribeSessions } from "@/features/semester/db";
import type { Semester, Session } from "@/features/semester/types";
import {
  canAccessPortalArea,
  canEditPortalArea,
  iguardScope,
  MINISTRY_ROLE_HINTS,
  MINISTRY_ROLE_LABELS,
  retreatEntryHref,
} from "./accessPolicy";
import { IGUARD_VIEW_GROUPS, RETREAT_TAB_GROUPS, SEMESTER_TRAINING_TABS, SUNDAY_MINISTRY_TABS } from "./featureCatalog";
import SharedMinistryCalendar, { type SharedCalendarItem } from "./SharedMinistryCalendar";
import { buildHomeActions } from "./homeActions";
import { getMonthlyMinistry } from "@/features/ministryGuide/ministryGuideContent";

function todayYmd() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function daysBetweenYmd(from: string, to: string) {
  const toUtc = (value: string) => {
    const [year, month, day] = value.split("-").map(Number);
    return Date.UTC(year, month - 1, day);
  };
  return Math.round((toUtc(to) - toUtc(from)) / 86_400_000);
}

export default function PortalHome() {
  const { user, loading, role, memberName, signIn, signOut } = useAuth();
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
  const [scheduleDraft, setScheduleDraft] = useState<{ id?: string; date: string; title: string } | null>(null);
  const canEditSchedule = canEditPortalArea("retreat-admin", role) || iguardScope(role) === "all";
  const monthlyMinistry = getMonthlyMinistry(new Date().getMonth() + 1);

  const semesterAllowed = canAccessPortalArea("semester", role);
  const fieldAllowed = canAccessPortalArea("retreat-field", role);
  const retreatAdminAllowed = canAccessPortalArea("retreat-admin", role);

  useEffect(() => {
    if (!user || !canAccessPortalArea("home", role)) return;

    getRetreats()
      .then((retreatList) => {
        setRetreats([...retreatList].sort((a, b) => b.year - a.year || b.createdAt - a.createdAt));
        ok("수련회 목록");
      })
      .catch((error: unknown) => fail("수련회 목록")(error instanceof Error ? error : new Error(String(error))));

    if (canAccessPortalArea("semester", role)) {
      getSemesters()
        .then((list) => { setSemesters(list); ok("학기 목록"); })
        .catch((error: unknown) => fail("학기 목록")(error instanceof Error ? error : new Error(String(error))));
    }
  }, [user, role, fail, ok]);

  const currentSemester = useMemo(() => {
    const today = todayYmd();
    return semesters.find((semester) => {
      const { startDate, endDate } = semester.meta;
      return !!startDate && !!endDate && startDate <= today && today <= endDate;
    }) ?? semesters[0] ?? null;
  }, [semesters]);

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
    if (!user || !canAccessPortalArea("home", role)) return;
    return subscribeToMilestones((v) => { setMilestones(v); ok("공유 일정"); }, fail("공유 일정"));
  }, [user, role, fail, ok]);

  // 회차 구독과 같은 이유로 user 가드가 필요하다 — 로그아웃해도 retreats 상태가 남아
  // 인증이 끊긴 채 재구독하면서 엉뚱한 permission_denied 배너가 뜬다.
  useEffect(() => {
    if (!user) return;
    return subscribeToAllRetreatPeriods(
      retreats.map((retreat) => retreat.id),
      (v) => { setPeriods(v); ok("수련회 기간"); },
      fail("수련회 기간"),
    );
  }, [user, retreats, fail, ok]);

  const currentRetreat = useMemo(() => {
    const today = todayYmd();
    const active = periods.find((period) => period.startDate <= today && today <= period.endDate);
    if (active) return retreats.find((retreat) => retreat.id === active.retreatId) ?? null;
    const next = periods.find((period) => period.startDate >= today);
    return retreats.find((retreat) => retreat.id === next?.retreatId) ?? retreats[0] ?? null;
  }, [periods, retreats]);
  const calendarItems = useMemo<SharedCalendarItem[]>(() => {
    const semesterHref = currentSemester ? `/semester/${encodeURIComponent(currentSemester.id)}` : "/semesters";
    const semesterItems: SharedCalendarItem[] = currentSemester
      ? sessions.map((session) => ({
          id: `semester-${session.id}`,
          date: session.date,
          title: session.label?.trim() || `${session.type} 모임`,
          kind: "semester" as const,
          href: semesterHref,
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
        href: retreatEntryHref(period.retreatId, role),
      };
    });
    const sharedItems: SharedCalendarItem[] = milestones.map((milestone) => ({
      id: `shared-${milestone.id}`,
      date: milestone.targetDate,
      title: milestone.title,
      kind: "shared" as const,
      done: milestone.done,
    }));
    return [...semesterItems, ...retreatItems, ...sharedItems].sort((a, b) => a.date.localeCompare(b.date));
  }, [currentSemester, milestones, periods, retreats, role, sessions]);

  const homeSummary = useMemo(() => {
    const today = todayYmd();
    const todayCount = calendarItems.filter((item) => item.date <= today && (item.endDate ?? item.date) >= today).length;
    const pendingCount = milestones.filter((item) => !item.done).length;
    const nextPeriod = [...periods]
      .filter((period) => period.endDate >= today)
      .sort((a, b) => a.startDate.localeCompare(b.startDate))[0];
    const nextRetreat = nextPeriod
      ? retreats.find((retreat) => retreat.id === nextPeriod.retreatId)
      : null;
    const daysUntil = nextPeriod ? daysBetweenYmd(today, nextPeriod.startDate) : null;
    return {
      todayCount,
      pendingCount,
      retreatName: nextRetreat?.name ?? "예정 없음",
      retreatTiming: daysUntil === null ? "-" : daysUntil <= 0 ? "진행 중" : `D-${daysUntil}`,
    };
  }, [calendarItems, milestones, periods, retreats]);

  const homeActions = useMemo(() => {
    const semesterHref = currentSemester ? `/semester/${encodeURIComponent(currentSemester.id)}` : undefined;
    return buildHomeActions({
      today: todayYmd(),
      role,
      milestones,
      sessions: semesterAllowed ? sessions : [],
      semesterHref,
      periods,
      retreats,
    });
  }, [currentSemester, milestones, periods, retreats, role, semesterAllowed, sessions]);

  async function submitSchedule() {
    if (!scheduleDraft) return;
    const title = scheduleDraft.title.trim();
    if (!title) return;
    setActionError(null);
    try {
      if (scheduleDraft.id) {
        await updateMilestone(scheduleDraft.id, { title, targetDate: scheduleDraft.date });
      } else {
        await saveMilestone({ title, targetDate: scheduleDraft.date, done: false });
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

  if (!canAccessPortalArea("home", role)) {
    return (
      <main className="min-h-screen grid place-items-center px-6 text-center">
        <div>
          <h1 className="text-xl font-bold">접근 승인이 필요합니다</h1>
          <p className="mt-2 text-sm text-slate-500">통합관리자 승인 후 사역 메뉴를 사용할 수 있습니다.</p>
          <div className="mt-5 flex items-center justify-center gap-3">
            <Link href="/field" className="btn-primary">이가드 접근 요청</Link>
            <button onClick={() => void signOut()} className="text-sm text-slate-500 underline">로그아웃</button>
          </div>
        </div>
      </main>
    );
  }

  return (
    <div className="app-page">
      <main className="page-container">
        {loadError && <div className="mb-5 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">⚠ {loadError}</div>}

        <section className="page-hero mb-7 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(420px,0.72fr)] lg:items-end">
          <div className="min-w-0">
            <p className="page-eyebrow">TODAY&apos;S MINISTRY</p>
            <h1 className="page-title">{memberName || user.displayName || "선생님"}, 오늘도 함께 준비해요.</h1>
            <p className="page-description">학기 운영, 주일 사역, 수련회 행정과 현장 실행을 하나의 계정에서 이어갑니다.</p>
          </div>
          <div className="grid grid-cols-3 gap-2.5 sm:gap-3" aria-label="오늘의 사역 요약">
            <HeroMetric label="오늘 일정" value={`${homeSummary.todayCount}건`} />
            <HeroMetric label="다음 수련회" value={homeSummary.retreatTiming} detail={homeSummary.retreatName} />
            <HeroMetric label="미완료 준비" value={`${homeSummary.pendingCount}건`} />
          </div>
        </section>

        <section className="grid gap-5 lg:grid-cols-3">
          {semesterAllowed ? <Link href={currentSemester ? `/semester/${encodeURIComponent(currentSemester.id)}` : "/semesters"} className="card home-domain-card home-domain-card--semester group p-6 pl-7 sm:p-7 sm:pl-8" data-hover>
            <div className="flex items-center justify-between">
              <span className="tag bg-[#edf4ff] px-3 py-1.5 text-[#2457b8]">학기 중 사역</span>
              <span className="grid h-9 w-9 place-items-center rounded-full bg-slate-50 text-slate-400 transition group-hover:translate-x-1 group-hover:bg-[#edf4ff] group-hover:text-[#2457b8]">→</span>
            </div>
            <h2 className="mt-6 text-2xl font-bold tracking-[-0.025em]">{currentSemester?.meta.title ?? "등록된 학기가 없습니다"}</h2>
            <p className="mt-2 text-sm leading-6 text-slate-500">훈련·사역팀 출석, 수료, 커리큘럼과 자료를 관리합니다.</p>
          </Link> : <section className="card p-6 text-slate-400 opacity-75">
            <span className="rounded-full bg-slate-200 px-3 py-1 text-xs font-bold">학기 중 사역</span>
            <h2 className="mt-5 text-2xl font-bold">통합관리자 승인 후 이용</h2>
            <p className="mt-2 text-sm">훈련·사역팀 출석, 수료, 커리큘럼과 자료를 관리합니다.</p>
          </section>}

          {semesterAllowed && <Link href="/sunday-ministry" className="card home-domain-card home-domain-card--sunday group p-6 pl-7 sm:p-7 sm:pl-8" data-hover>
            <div className="flex items-center justify-between">
              <span className="tag bg-amber-50 px-3 py-1.5 text-amber-700">주일 사역</span>
              <span className="grid h-9 w-9 place-items-center rounded-full bg-slate-50 text-slate-400 transition group-hover:translate-x-1 group-hover:bg-amber-50 group-hover:text-amber-700">→</span>
            </div>
            <h2 className="mt-6 text-2xl font-bold tracking-[-0.025em]">행정·바나바</h2>
            <p className="mt-2 text-sm leading-6 text-slate-500">학기 구분 없이 새친구 정착, 학생 변동과 처리 이력을 관리합니다.</p>
          </Link>}

          <Link href={currentRetreat ? retreatEntryHref(currentRetreat.id, role) : (retreatAdminAllowed ? "/retreats" : "/field")} className="card home-domain-card home-domain-card--vacation group p-6 pl-7 sm:p-7 sm:pl-8" data-hover>
            <div className="flex items-center justify-between">
              <span className="tag bg-[#e9f6f1] px-3 py-1.5 text-[var(--color-primary)]">방학 중 사역</span>
              <span className="grid h-9 w-9 place-items-center rounded-full bg-slate-50 text-slate-400 transition group-hover:translate-x-1 group-hover:bg-[#e9f6f1] group-hover:text-[var(--color-primary)]">→</span>
            </div>
            <h2 className="mt-6 text-2xl font-bold tracking-[-0.025em]">{currentRetreat ? `${currentRetreat.year}년 ${currentRetreat.name}` : "등록된 수련회가 없습니다"}</h2>
            <p className="mt-2 text-sm leading-6 text-slate-500">행정 편성과 이가드 현장 운영을 같은 수련회 데이터로 연결합니다.</p>
          </Link>
        </section>

        <Link href="/ministry-guide" className="home-ministry-brief group mt-7" data-hover>
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

        <section className="surface-panel mt-7 p-5 sm:p-7">
          <div className="section-heading">
            <div><p className="section-kicker">WORKSPACES</p>
            <h2 className="section-title">사역 바로가기</h2>
            <p className="mt-1 text-sm text-slate-500">기존 사이트별 메뉴를 하나의 사역 흐름으로 정리했습니다.</p>
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {semesterAllowed && (
              <Link href={currentSemester ? `/semester/${encodeURIComponent(currentSemester.id)}` : "/semesters"} className="home-workspace-card group">
                <div className="flex items-center justify-between"><h3 className="font-bold text-[var(--color-text-primary)]">훈련·사역팀</h3><span className="text-[#2563eb] group-hover:translate-x-0.5">→</span></div>
                <div className="mt-4 flex flex-wrap gap-2">{SEMESTER_TRAINING_TABS.map((label) => <span key={label} className="rounded-lg bg-white px-2.5 py-1.5 text-xs font-medium text-[#2457b8] shadow-sm">{label}</span>)}</div>
              </Link>
            )}
            {semesterAllowed && (
              <Link href="/sunday-ministry" className="home-workspace-card group">
                <div className="flex items-center justify-between"><h3 className="font-bold text-[var(--color-text-primary)]">행정·바나바</h3><span className="text-amber-600 group-hover:translate-x-0.5">→</span></div>
                <div className="mt-4 space-y-2.5">{SUNDAY_MINISTRY_TABS.map((label) => <div key={label} className="flex items-center gap-2 text-xs"><span className="size-1.5 rounded-full bg-amber-400"/><span className="text-slate-600">{label}</span></div>)}</div>
              </Link>
            )}
            {retreatAdminAllowed && (
              <Link href={currentRetreat ? `/retreat/${encodeURIComponent(currentRetreat.id)}` : "/retreats"} className="home-workspace-card group">
                <div className="flex items-center justify-between"><h3 className="font-bold text-[var(--color-text-primary)]">수련회 행정</h3><span className="text-[var(--color-primary)] group-hover:translate-x-0.5">→</span></div>
                <div className="mt-4 space-y-2.5">{RETREAT_TAB_GROUPS.map((group) => <div key={group.label} className="flex items-start gap-2 text-xs"><span className="min-w-14 font-bold text-[var(--color-primary)]">{group.label}</span><span className="leading-relaxed text-slate-500">{group.tabs.map((tab) => tab.label).join(" · ")}</span></div>)}</div>
              </Link>
            )}
            {fieldAllowed && (
              <Link href={currentRetreat ? `/retreat/${encodeURIComponent(currentRetreat.id)}/field` : "/field"} className="home-workspace-card group">
                <div className="flex items-center justify-between"><h3 className="font-bold text-[var(--color-text-primary)]">수련회 이가드</h3><span className="text-[var(--color-primary)] group-hover:translate-x-0.5">→</span></div>
                <div className="mt-4 space-y-2.5">{IGUARD_VIEW_GROUPS
                  .filter((group) => iguardScope(role) === "all" || group.label === "실행")
                  .map((group) => <div key={group.label} className="flex items-start gap-2 text-xs"><span className="min-w-9 font-bold text-[var(--color-primary)]">{group.label}</span><span className="line-clamp-2 leading-relaxed text-slate-500">{group.views.map((view) => view.label).join(" · ")}</span></div>)}</div>
              </Link>
            )}
          </div>
        </section>

        <section className="mt-7 grid gap-6">
          <SharedMinistryCalendar
            items={calendarItems}
            canEdit={canEditSchedule}
            onAdd={(date) => setScheduleDraft({ date, title: "" })}
            onEdit={(item) => setScheduleDraft({ id: item.id.replace(/^shared-/, ""), date: item.date, title: item.title })}
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
            <section className="surface-panel p-5 sm:p-6">
              <h2 className="text-lg font-bold">내 담당 사역</h2>
              <p className="mt-1 text-xs text-slate-400">현재 계정이 맡은 운영 영역과 권한을 표시합니다.</p>
              <div className="mt-4 rounded-xl bg-slate-50 p-4 text-sm text-slate-600">
                <div className="flex items-center gap-2">
                  <strong>{memberName || user.displayName || "승인된 사용자"}</strong>
                  <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-bold text-slate-600 shadow-sm">{MINISTRY_ROLE_LABELS[role]}</span>
                </div>
                <p className="mt-1 text-xs text-slate-400">{MINISTRY_ROLE_HINTS[role]}</p>
              </div>
              <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
                {semesterAllowed && <MinistryArea href={currentSemester ? `/semester/${encodeURIComponent(currentSemester.id)}` : "/semesters"} label="훈련·사역팀" description="접수·배치·출석·수료" tone="emerald" />}
                {semesterAllowed && <MinistryArea href="/sunday-ministry" label="주일 사역 · 행정·바나바" description="새친구·학생 변동·처리 대기" tone="amber" />}
                {retreatAdminAllowed && <MinistryArea href={currentRetreat ? `/retreat/${encodeURIComponent(currentRetreat.id)}` : "/retreats"} label="수련회 행정" description="명단·편성·물품·현장" tone="violet" />}
                {fieldAllowed && <MinistryArea href={currentRetreat ? `/retreat/${encodeURIComponent(currentRetreat.id)}/field` : "/field"} label="수련회 이가드" description={iguardScope(role) === "all" ? "실행·기획·정보" : "현장 실행"} tone="fuchsia" />}
              </div>
            </section>
            <section className="surface-panel p-5 sm:p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="section-kicker">ACTION INBOX</p>
                  <h2 className="mt-1 text-lg font-bold">지금 확인할 일</h2>
                  <p className="mt-1 text-xs text-slate-500">공유 준비 일정과 다음 사역을 날짜순으로 모았습니다.</p>
                </div>
                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold tabular-nums text-slate-600">{homeActions.length}건</span>
              </div>
              <div className="mt-4 space-y-2">
                {homeActions.length > 0 ? homeActions.map((item) => {
                  const content = (
                    <>
                      <span className={`home-action-date home-action-date--${item.urgency}`}>{item.date.slice(5).replace("-", ".")}</span>
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
              <Link href="/suggestions" className="mt-4 inline-flex min-h-10 items-center text-xs font-semibold text-[var(--color-primary)] hover:underline">사이트 건의사항 작성 →</Link>
            </section>
          </div>
        </section>
        {scheduleDraft && (
          <div
            className="modal-backdrop fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
            onClick={() => setScheduleDraft(null)}
            onKeyDown={(event) => event.key === "Escape" && setScheduleDraft(null)}
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-label={scheduleDraft.id ? "공유 일정 수정" : "공유 일정 추가"}
              className="modal-card w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl"
              onClick={(event) => event.stopPropagation()}
            >
              <h3 className="font-bold text-slate-900">{scheduleDraft.id ? "공유 일정 수정" : "공유 일정 추가"}</h3>
              <p className="mt-1 text-xs text-slate-500">행정·이가드가 함께 보는 준비 일정입니다.</p>
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
                <span className="text-xs text-slate-500">일정 내용</span>
                <input
                  autoFocus
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
          </div>
        )}
      </main>
    </div>
  );
}

function HeroMetric({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="hero-metric">
      <p className="text-xs font-medium text-slate-300">{label}</p>
      <p className="mt-1 text-lg font-bold tabular-nums text-white sm:text-xl">{value}</p>
      {detail && <p className="mt-1 truncate text-[11px] text-slate-300" title={detail}>{detail}</p>}
    </div>
  );
}

function MinistryArea({ href, label, description, tone }: { href: string; label: string; description: string; tone: "emerald" | "amber" | "violet" | "fuchsia" }) {
  const toneClass = {
    emerald: "bg-[#edf4ff] text-[#2457b8] hover:bg-[#e4efff]",
    amber: "bg-[#fff7e8] text-[#9a5b0b] hover:bg-[#ffefd1]",
    violet: "bg-[#edf7f3] text-[#087a57] hover:bg-[#e3f2ec]",
    fuchsia: "bg-[#f3f6f5] text-[#34423c] hover:bg-[#eaf0ed]",
  }[tone];
  return <Link href={href} className={`rounded-xl p-3.5 transition hover:-translate-y-0.5 ${toneClass}`}><strong className="text-sm">{label}</strong><p className="mt-1 text-xs opacity-70">{description}</p></Link>;
}
