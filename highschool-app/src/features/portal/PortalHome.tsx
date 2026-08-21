"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
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
  canEditArea,
  iguardScopeOf,
  describeRoles,
  describeRolesHint,
  retreatEntryHref,
} from "./accessPolicy";
import SharedMinistryCalendar, { calendarKindForSourceSite, CALENDAR_KIND_STYLE, type SharedCalendarItem } from "./SharedMinistryCalendar";
import { buildHomeActions } from "./homeActions";
import { getMonthlyMinistry } from "@/features/ministryGuide/ministryGuideContent";

function todayYmd() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export default function PortalHome() {
  const { user, loading, roles, memberName, signIn, signOut } = useAuth();
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
  const canEditSchedule = canEditArea("retreat-admin", roles) || iguardScopeOf(roles) === "all";
  const monthlyMinistry = getMonthlyMinistry(new Date().getMonth() + 1);

  const semesterAllowed = canAccessArea("semester", roles);
  const fieldAllowed = canAccessArea("retreat-field", roles);
  const retreatAdminAllowed = canAccessArea("retreat-admin", roles);

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
    if (canAccessArea("semester", roles)) {
      unsubs.push(subscribeSemesters(
        (list) => { setSemesters(list); ok("학기 목록"); },
        fail("학기 목록"),
      ));
    }
    return () => unsubs.forEach((unsubscribe) => unsubscribe());
  }, [user, roles, fail, ok]);

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
    if (!user || !canAccessArea("home", roles)) return;
    return subscribeToMilestones((v) => { setMilestones(v); ok("공유 일정"); }, fail("공유 일정"));
  }, [user, roles, fail, ok]);

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
          ...(session.endDate ? { endDate: session.endDate } : {}),
          title: sessionDisplayLabel(session),
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
  }, [currentSemester, milestones, periods, retreats, roles, sessions]);

  const homeActions = useMemo(() => {
    return buildHomeActions(calendarItems, todayYmd());
  }, [calendarItems]);

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
              주일 사역·학기 사역·수련회 행정은 요청 버튼이 따로 없습니다.
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
            <h1 className="page-title">{memberName || user.displayName || "선생님"}, 오늘도 함께 준비해요.</h1>
            <p className="page-description">학기 운영, 주일 사역, 수련회 행정과 현장 실행을 하나의 계정에서 이어갑니다.</p>
          </div>
          <div className="hero-agenda" aria-label="공유 사역 캘린더 할 일">
            <p className="hero-agenda__title">공유 캘린더 할 일</p>
            <div className="mt-2 grid gap-1.5">
              {homeActions.slice(0, 3).map((item) => (
                <div key={item.id} className="hero-agenda__row">
                  <span className={`hero-agenda__dot ${CALENDAR_KIND_STYLE[item.kind].dot}`} />
                  <span className="min-w-0 flex-1 truncate">{item.title}</span>
                  <span className="shrink-0 tabular-nums text-slate-300">{item.urgency === "today" ? "오늘" : item.date.slice(5).replace("-", ".")}</span>
                </div>
              ))}
              {homeActions.length === 0 && <p className="py-2 text-xs text-slate-300">예정된 일정이 없습니다.</p>}
            </div>
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
            <p className="mt-2 text-sm leading-6 text-slate-500">학기 구분 없이 새친구 정착, 등록 현황과 행정 변동을 관리합니다.</p>
          </Link>}

          <Link href={currentRetreat ? retreatEntryHref(currentRetreat.id, roles) : (retreatAdminAllowed ? "/retreats" : "/field")} className="card home-domain-card home-domain-card--vacation group p-6 pl-7 sm:p-7 sm:pl-8" data-hover>
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
                {semesterAllowed && <MinistryArea href={currentSemester ? `/semester/${encodeURIComponent(currentSemester.id)}` : "/semesters"} label="훈련·사역팀" description="접수·배치·출석·수료 판정" tone="semester" />}
                {semesterAllowed && <MinistryArea href="/sunday-ministry" label="주일 사역 · 행정·바나바" description="새친구·등록 현황·행정 변동" tone="sunday" />}
                {retreatAdminAllowed && <MinistryArea href={currentRetreat ? `/retreat/${encodeURIComponent(currentRetreat.id)}` : "/retreats"} label="수련회 행정" description="명단·편성·물품·현장" tone="retreat" />}
                {fieldAllowed && <MinistryArea href={currentRetreat ? `/retreat/${encodeURIComponent(currentRetreat.id)}/field` : "/field"} label="수련회 이가드" description={iguardScopeOf(roles) === "all" ? "실행·기획·정보" : "현장 실행"} tone="field" />}
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

function MinistryArea({ href, label, description, tone }: { href: string; label: string; description: string; tone: "semester" | "sunday" | "retreat" | "field" }) {
  const toneClass = {
    semester: "bg-[#edf4ff] text-[#2457b8] hover:bg-[#e4efff]",
    sunday: "bg-[#fff7e8] text-[#9a5b0b] hover:bg-[#ffefd1]",
    retreat: "bg-[#edf7f3] text-[#087a57] hover:bg-[#e3f2ec]",
    field: "bg-[#f3f6f5] text-[#34423c] hover:bg-[#eaf0ed]",
  }[tone];
  return <Link href={href} className={`ministry-area ministry-area--${tone} rounded-xl p-3.5 transition hover:-translate-y-0.5 ${toneClass}`}><strong className="text-sm">{label}</strong><p className="mt-1 text-xs opacity-70">{description}</p></Link>;
}
