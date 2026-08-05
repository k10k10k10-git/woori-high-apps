"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import LoginButton from "@/components/LoginButton";
import { useAuth } from "@/context/AuthContext";
import { getRetreats, subscribeToAllRetreatPeriods, type RetreatPeriodWithOwner } from "@/lib/db";
import type { Retreat } from "@/lib/types";
import { getSemesters, subscribeSessions } from "@/features/semester/db";
import type { Semester, Session } from "@/features/semester/types";
import { useMyRetreatMinistry } from "./useMyRetreatMinistry";
import {
  canAccessPortalArea,
  iguardScope,
  MINISTRY_ROLE_HINTS,
  MINISTRY_ROLE_LABELS,
  retreatEntryHref,
} from "./accessPolicy";
import { buildSemesterTimeline } from "./semesterTimeline";
import { IGUARD_VIEW_GROUPS, RETREAT_TAB_GROUPS, SEMESTER_TABS } from "./featureCatalog";

type TimelineItem = {
  id: string;
  date: string;
  endDate?: string;
  title: string;
  kind: "semester" | "retreat";
  href: string;
};

function todayYmd() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function formatDateRange(start: string, end?: string) {
  const short = (value: string) => value.replace(/^\d{4}-/, "").replace("-", ".");
  return end && end !== start ? `${short(start)}–${short(end)}` : short(start);
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
  const [loadError, setLoadError] = useState<string | null>(null);

  const semesterAllowed = canAccessPortalArea("semester", role);
  const fieldAllowed = canAccessPortalArea("retreat-field", role);
  const retreatAdminAllowed = canAccessPortalArea("retreat-admin", role);

  useEffect(() => {
    if (!user || !canAccessPortalArea("home", role)) return;

    getRetreats()
      .then((retreatList) => setRetreats([...retreatList].sort((a, b) => b.year - a.year || b.createdAt - a.createdAt)))
      .catch((error: unknown) => setLoadError(error instanceof Error ? error.message : String(error)));

    if (canAccessPortalArea("semester", role)) {
      getSemesters()
        .then(setSemesters)
        .catch((error: unknown) => setLoadError(error instanceof Error ? error.message : String(error)));
    }
  }, [user, role]);

  const currentSemester = useMemo(() => {
    const today = todayYmd();
    return semesters.find((semester) => {
      const { startDate, endDate } = semester.meta;
      return !!startDate && !!endDate && startDate <= today && today <= endDate;
    }) ?? semesters[0] ?? null;
  }, [semesters]);

  useEffect(() => {
    if (!currentSemester) return;
    return subscribeSessions(
      currentSemester.id,
      items => setSessionState({ semesterId: currentSemester.id, items }),
      (error) => setLoadError(error.message),
    );
  }, [currentSemester]);

  const sessions = useMemo(
    () => sessionState.semesterId === currentSemester?.id ? sessionState.items : [],
    [currentSemester?.id, sessionState],
  );

  useEffect(() => {
    return subscribeToAllRetreatPeriods(
      retreats.map((retreat) => retreat.id),
      setPeriods,
      (error) => setLoadError(error.message),
    );
  }, [retreats]);

  const currentRetreat = useMemo(() => {
    const today = todayYmd();
    const active = periods.find((period) => period.startDate <= today && today <= period.endDate);
    if (active) return retreats.find((retreat) => retreat.id === active.retreatId) ?? null;
    const next = periods.find((period) => period.startDate >= today);
    return retreats.find((retreat) => retreat.id === next?.retreatId) ?? retreats[0] ?? null;
  }, [periods, retreats]);
  const preferredStaffNames = useMemo(
    () => [memberName, user?.displayName],
    [memberName, user?.displayName],
  );
  const myRetreatMinistry = useMyRetreatMinistry(
    fieldAllowed ? currentRetreat?.id ?? "" : "",
    preferredStaffNames,
  );

  const timeline = useMemo<TimelineItem[]>(() => {
    const semesterHref = currentSemester ? `/semester/${encodeURIComponent(currentSemester.id)}` : "/semesters";
    const semesterItems: TimelineItem[] = currentSemester
      ? buildSemesterTimeline(sessions).map((entry) => ({
          id: entry.key,
          date: entry.date,
          ...(entry.endDate ? { endDate: entry.endDate } : {}),
          title: entry.title,
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
    return [...semesterItems, ...retreatItems]
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(0, 10);
  }, [currentSemester, periods, retreats, role, sessions]);

  if (loading) {
    return <main className="min-h-screen grid place-items-center text-slate-500">불러오는 중…</main>;
  }

  if (!user) {
    return (
      <main className="min-h-screen grid place-items-center bg-slate-950 px-6 text-center">
        <div className="max-w-md">
          <div className="mb-5 text-5xl">🧭</div>
          <h1 className="text-3xl font-bold text-white">고등부 사역 플랫폼</h1>
          <p className="mt-2 mb-7 text-sm text-slate-400">학기 사역과 수련회 준비·현장 운영을 한곳에서 관리합니다.</p>
          <LoginButton signIn={signIn} />
        </div>
      </main>
    );
  }

  if (!canAccessPortalArea("home", role)) {
    return (
      <main className="min-h-screen grid place-items-center px-6 text-center">
        <div>
          <h1 className="text-xl font-bold">접근 승인이 필요합니다</h1>
          <p className="mt-2 text-sm text-slate-500">통합관리자 승인 후 사역 메뉴를 사용할 수 있습니다.</p>
          <div className="mt-5 flex items-center justify-center gap-3">
            <Link href="/field" className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white">이가드 접근 요청</Link>
            <button onClick={() => void signOut()} className="text-sm text-slate-500 underline">로그아웃</button>
          </div>
        </div>
      </main>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800">
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-9">
        {loadError && <div className="mb-5 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">⚠ {loadError}</div>}

        <section className="mb-6 overflow-hidden rounded-3xl bg-slate-900 px-5 py-6 text-white shadow-lg sm:px-8 sm:py-8">
          <div>
            <p className="text-xs font-bold tracking-[0.16em] text-emerald-300">TODAY&apos;S MINISTRY</p>
            <h1 className="mt-2 text-2xl font-bold sm:text-3xl">{memberName || user.displayName || "선생님"}, 오늘도 함께 준비해요.</h1>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-400">학기 운영, 수련회 행정, 현장 실행을 같은 계정과 같은 데이터 흐름에서 이어갑니다.</p>
          </div>
        </section>

        <section className="grid gap-4 lg:grid-cols-2">
          {semesterAllowed ? <Link href={currentSemester ? `/semester/${encodeURIComponent(currentSemester.id)}` : "/semesters"} className="group rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
            <div className="flex items-center justify-between">
              <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-700">학기 중 사역</span>
              <span className="text-slate-300 transition group-hover:translate-x-1">→</span>
            </div>
            <h2 className="mt-5 text-2xl font-bold">{currentSemester?.meta.title ?? "등록된 학기가 없습니다"}</h2>
            <p className="mt-2 text-sm text-slate-500">훈련·사역팀 출석, 수료, 커리큘럼과 자료를 관리합니다.</p>
          </Link> : <section className="rounded-2xl border border-slate-200 bg-slate-100 p-6 text-slate-400">
            <span className="rounded-full bg-slate-200 px-3 py-1 text-xs font-bold">학기 중 사역</span>
            <h2 className="mt-5 text-2xl font-bold">통합관리자 승인 후 이용</h2>
            <p className="mt-2 text-sm">훈련·사역팀 출석, 수료, 커리큘럼과 자료를 관리합니다.</p>
          </section>}

          <Link href={currentRetreat ? retreatEntryHref(currentRetreat.id, role) : (retreatAdminAllowed ? "/retreats" : "/field")} className="group rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
            <div className="flex items-center justify-between">
              <span className="rounded-full bg-violet-100 px-3 py-1 text-xs font-bold text-violet-700">방학 중 사역</span>
              <span className="text-slate-300 transition group-hover:translate-x-1">→</span>
            </div>
            <h2 className="mt-5 text-2xl font-bold">{currentRetreat ? `${currentRetreat.year}년 ${currentRetreat.name}` : "등록된 수련회가 없습니다"}</h2>
            <p className="mt-2 text-sm text-slate-500">행정 편성과 이가드 현장 운영을 같은 수련회 데이터로 연결합니다.</p>
          </Link>
        </section>

        <section className="mt-7 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="mb-5">
            <p className="text-xs font-bold tracking-[0.14em] text-slate-400">WORKSPACES</p>
            <h2 className="mt-1 text-xl font-bold">사역 바로가기</h2>
            <p className="mt-1 text-sm text-slate-500">기존 사이트별 메뉴를 하나의 사역 흐름으로 정리했습니다.</p>
          </div>
          <div className="grid gap-4 xl:grid-cols-3">
            {semesterAllowed && (
              <Link href={currentSemester ? `/semester/${encodeURIComponent(currentSemester.id)}` : "/semesters"} className="group rounded-2xl border border-emerald-100 bg-emerald-50/60 p-4 transition hover:border-emerald-300 hover:bg-emerald-50">
                <div className="flex items-center justify-between"><h3 className="font-bold text-emerald-950">학기 운영</h3><span className="text-emerald-400 group-hover:translate-x-0.5">→</span></div>
                <div className="mt-3 flex flex-wrap gap-1.5">{SEMESTER_TABS.map((label) => <span key={label} className="rounded-lg bg-white px-2.5 py-1.5 text-xs font-medium text-emerald-700 shadow-sm">{label}</span>)}</div>
              </Link>
            )}
            {retreatAdminAllowed && (
              <Link href={currentRetreat ? `/retreat/${encodeURIComponent(currentRetreat.id)}` : "/retreats"} className="group rounded-2xl border border-violet-100 bg-violet-50/60 p-4 transition hover:border-violet-300 hover:bg-violet-50">
                <div className="flex items-center justify-between"><h3 className="font-bold text-violet-950">수련회 행정</h3><span className="text-violet-400 group-hover:translate-x-0.5">→</span></div>
                <div className="mt-3 space-y-2">{RETREAT_TAB_GROUPS.map((group) => <div key={group.label} className="flex items-start gap-2 text-xs"><span className="min-w-14 font-bold text-violet-700">{group.label}</span><span className="leading-relaxed text-slate-500">{group.tabs.map((tab) => tab.label).join(" · ")}</span></div>)}</div>
              </Link>
            )}
            {fieldAllowed && (
              <Link href={currentRetreat ? `/retreat/${encodeURIComponent(currentRetreat.id)}/field` : "/field"} className="group rounded-2xl border border-fuchsia-100 bg-fuchsia-50/60 p-4 transition hover:border-fuchsia-300 hover:bg-fuchsia-50">
                <div className="flex items-center justify-between"><h3 className="font-bold text-fuchsia-950">이가드 현장</h3><span className="text-fuchsia-400 group-hover:translate-x-0.5">→</span></div>
                <div className="mt-3 space-y-2">{IGUARD_VIEW_GROUPS
                  .filter((group) => iguardScope(role) === "all" || group.label === "실행")
                  .map((group) => <div key={group.label} className="flex items-start gap-2 text-xs"><span className="min-w-9 font-bold text-fuchsia-700">{group.label}</span><span className="line-clamp-2 leading-relaxed text-slate-500">{group.views.map((view) => view.label).join(" · ")}</span></div>)}</div>
              </Link>
            )}
          </div>
        </section>

        <section className="mt-7 grid gap-6 lg:grid-cols-[1.5fr_1fr]">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold">전체 일정</h2>
                <p className="text-xs text-slate-400">현재 학기와 수련회 기간을 날짜순으로 모았습니다.</p>
              </div>
            </div>
            <div className="divide-y divide-slate-100">
              {timeline.length === 0 && <p className="py-8 text-center text-sm text-slate-400">등록된 일정이 없습니다.</p>}
              {timeline.map((item) => (
                <Link key={item.id} href={item.href} className="flex items-center gap-4 py-3.5 hover:bg-slate-50">
                  <span className={`min-w-24 text-xs font-bold ${item.kind === "semester" ? "text-emerald-600" : "text-violet-600"}`}>{formatDateRange(item.date, item.endDate)}</span>
                  <span className="text-sm font-medium">{item.title}</span>
                </Link>
              ))}
            </div>
          </div>

          <div className="space-y-4">
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-lg font-bold">내 담당 사역</h2>
              <p className="mt-1 text-xs text-slate-400">통합 계정과 현재 수련회 배정을 함께 모았습니다.</p>
              <div className="mt-4 rounded-xl bg-slate-50 p-4 text-sm text-slate-600">
                <div className="flex items-center gap-2">
                  <strong>{memberName || user.displayName || "승인된 사용자"}</strong>
                  <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-bold text-slate-600 shadow-sm">{MINISTRY_ROLE_LABELS[role]}</span>
                </div>
                <p className="mt-1 text-xs text-slate-400">{MINISTRY_ROLE_HINTS[role]}</p>
              </div>
              {currentRetreat && fieldAllowed && (
                <div className="mt-3 space-y-3">
                  {myRetreatMinistry.loading ? (
                    <p className="rounded-xl border border-slate-100 px-4 py-3 text-xs text-slate-400">현재 수련회 담당을 확인하는 중…</p>
                  ) : myRetreatMinistry.error ? (
                    <p className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-xs text-red-600">담당 배정을 불러오지 못했습니다.</p>
                  ) : !myRetreatMinistry.matchedStaffId ? (
                    <p className="rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-xs text-amber-700">승인 계정 이름과 현재 수련회 스탭 명단이 연결되지 않았습니다.</p>
                  ) : (
                    <>
                      <div className="flex flex-wrap gap-2 text-xs">
                        {myRetreatMinistry.groups.map(group => (
                          <span key={group.id} className="rounded-full bg-emerald-50 px-2.5 py-1 font-semibold text-emerald-700">
                            조스탭 · {group.bu} {group.name}
                          </span>
                        ))}
                        <span className="rounded-full bg-violet-50 px-2.5 py-1 font-semibold text-violet-700">
                          큐싯 담당 · {myRetreatMinistry.duties.length}개 일정
                        </span>
                      </div>
                      <div className="space-y-2">
                        {myRetreatMinistry.duties.slice(0, 4).map(duty => (
                          <div key={duty.blockId} className="rounded-xl border border-slate-100 px-3 py-2.5">
                            <p className="text-xs font-semibold text-slate-700">{duty.day}일차 {duty.start} · {duty.scheduleLabel}</p>
                            <p className="mt-1 text-xs leading-relaxed text-slate-500">
                              {[...duty.roles, ...duty.posts].join(" · ")}
                            </p>
                          </div>
                        ))}
                        {myRetreatMinistry.duties.length === 0 && myRetreatMinistry.groups.length === 0 && (
                          <p className="rounded-xl border border-slate-100 px-4 py-3 text-xs text-slate-400">현재 수련회에 연결된 조·동선·담당이 없습니다.</p>
                        )}
                      </div>
                    </>
                  )}
                </div>
              )}
            </section>
          </div>
        </section>
      </main>
    </div>
  );
}
