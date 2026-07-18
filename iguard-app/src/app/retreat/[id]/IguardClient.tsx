"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { subscribeToIguardAccessLock } from "@/lib/db";
import { hasRetreatSessionUnlock } from "@/lib/accessLock";
import { checkAdminCompat } from "@/lib/compat";
import { useRetreatData } from "@/hooks/useRetreatData";
import {
  Group, IguardAccessLock, IguardStaff,
  TeacherAttendance,
} from "@/lib/types";
import CenterSpinner from "@/components/CenterSpinner";
import ChecklistView from "./ChecklistView";
import RoomsView from "./RoomsView";
import MealsView from "./MealsView";
import StaffView from "./StaffView";
import ScheduleView from "./ScheduleView";
import PostsView from "./PostsView";
import MovementsView from "./MovementsView";
import ValidationView from "./ValidationView";
import BusesView from "./BusesView";
import SeatingView from "./SeatingView";
import { CueCardView, PostBoardView } from "./ExecutionViews";
import LeaderCueManageView from "./LeaderCueManageView";
import { GuideView, TodosView } from "./InfoViews";
import GroupStaffView from "./GroupStaffView";
import RetreatPinGate from "./RetreatPinGate";

const GROUPS = [
  { label: "실행", hint: "현장·모바일", views: [
    { key: "cue", label: "개인 큐카드", icon: "📋" },
    { key: "board", label: "포스트 현황", icon: "📍" },
    { key: "rooms", label: "조별 정보", icon: "👥" },
    { key: "check", label: "인원체크", icon: "✅" },
  ] },
  { label: "기획", hint: "PC", views: [
    { key: "schedule", label: "스탭 전체 큐싯" },
    { key: "leadercue", label: "조장 큐싯" },
    { key: "posts", label: "포스트 편집" },
    { key: "staff", label: "스탭" },
    { key: "movements", label: "동선 매트릭스" },
    { key: "validate", label: "데이터 검증" },
    { key: "groupstaff", label: "조스탭 배정" },
    { key: "meals", label: "식사순서" },
    { key: "buses", label: "버스배정" },
    { key: "seating", label: "집회자리" },
  ] },
  { label: "정보", hint: "", views: [
    { key: "guide", label: "조스탭 가이드" },
    { key: "todos", label: "준비 할일" },
  ] },
] as const;

function parseNames(value?: string): string[] {
  return (value || "")
    .split(/[,\n/]+/)
    .map(v => v.trim())
    .filter(Boolean);
}

function staffKey(name: string): string {
  return name.toLowerCase().replace(/sf/gi, "").replace(/스탭/g, "").replace(/[\s_~\-·()[\]{}.,!?:/\\|'"“”‘’]+/g, "");
}

/** 행정 teachers가 스탭 단일 원천. (이가드 staffMeta 오버레이는 폐기됨 — 모든 속성은 행정 teachers 값만 사용.)
 *  조스탭 역할: 이가드 조스탭 배정(groupStaff, id 기준)을 우선 사용. 행정 group.staff(이름, 레거시)는 보조. */
function teachersToStaff(adminTeachers: TeacherAttendance[], groups: Group[], groupStaff: Record<string, string[]>): IguardStaff[] {
  const groupStaffIds = new Set(Object.values(groupStaff).flat());
  const groupStaffKeys = new Set(groups.flatMap(g => parseNames(g.staff)).map(staffKey));
  return adminTeachers
    .filter(t => t.bu === "스탭" && t.status !== "불참" && t.name?.trim())
    .map((t, index): IguardStaff => {
      const inferredRole = (groupStaffIds.has(t.id) || groupStaffKeys.has(staffKey(t.name))) ? "조스탭" : undefined;
      return {
        id: t.id,
        name: t.name.trim(),
        age: t.age ?? undefined,
        role: t.role ?? inferredRole,
        order: index,
        corps: t.corps,
        lateArrival: t.lateArrival ?? undefined,
        programTeam: t.programTeam ?? undefined,
        worship: t.worship,
        source: "admin",
        adminStatus: t.status,
      };
    });
}

export default function IguardClient() {
  const router = useRouter();
  const id = (useParams().id as string);
  const { user, loading: authLoading, accessLevel } = useAuth();
  const [lock, setLock] = useState<IguardAccessLock | null | undefined>(undefined);
  const [unlocked, setUnlocked] = useState(false);
  const [lockError, setLockError] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && (!user || accessLevel === "none")) router.push("/");
  }, [authLoading, user, accessLevel, router]);

  useEffect(() => {
    if (authLoading || !user || accessLevel === "none") return;
    setLockError(null);
    if (accessLevel === "admin") {
      setLock(null);
      setUnlocked(true);
      return;
    }
    setLock(undefined);
    setUnlocked(false);
    return subscribeToIguardAccessLock(id, nextLock => {
      setLock(nextLock);
      if (!nextLock) { setUnlocked(true); return; }
      try { setUnlocked(hasRetreatSessionUnlock(id, nextLock, window.sessionStorage)); }
      catch { setUnlocked(false); }
    }, error => {
      setLockError(`PIN 잠금 상태를 확인하지 못했습니다 — ${error.message}`);
      setLock(undefined);
      setUnlocked(false);
    });
  }, [authLoading, user, accessLevel, id]);

  if (authLoading) return <CenterSpinner />;
  if (!user || accessLevel === "none") return null;
  if (lockError) return (
    <div className="flex min-h-screen flex-col items-center justify-center px-6 text-center">
      <div className="mb-3 text-3xl" aria-hidden="true">⚠️</div>
      <p className="mb-4 max-w-md text-sm text-red-700" role="alert">{lockError}</p>
      <button onClick={() => router.push("/")} className="btn-secondary">수련회 목록으로</button>
    </div>
  );
  if (lock === undefined) return <CenterSpinner />;
  if (lock && !unlocked) return (
    <RetreatPinGate retreatId={id} lock={lock} onUnlocked={() => setUnlocked(true)} onBack={() => router.push("/")} />
  );
  return <IguardWorkspace id={id} />;
}

function IguardWorkspace({ id }: { id: string }) {
  const router = useRouter();
  const { user, accessLevel, memberName } = useAuth();

  const [view, setView] = useState<string>("cue");
  const [sheetSettingsOpen, setSheetSettingsOpen] = useState(false);
  const [compatDismissed, setCompatDismissed] = useState(false);
  const headerRef = useRef<HTMLElement | null>(null);

  // 데이터 허브 — 모든 구독을 커스텀 훅에서 관리
  const {
    retreat, retreatLoading, dataLoading, loadError,
    groups, rooms, students, participants, adminTeachers,
    meals, schedule, posts, movements, buses, seating,
    todos, guide, periods, attendanceKeys, attendanceInfo, partial, cellColors, groupStaff,
    connected,
  } = useRetreatData(id);

  const staffForViews = useMemo(
    () => teachersToStaff(adminTeachers, groups, groupStaff),
    [adminTeachers, groups, groupStaff]
  );
  const preferredStaffNames = useMemo(
    () => [memberName, user?.displayName].filter((name): name is string => !!name?.trim()),
    [memberName, user?.displayName],
  );
  const absentStaffNames = useMemo(
    () => adminTeachers.filter(t => t.bu === "스탭" && t.status === "불참" && t.name?.trim()).map(t => t.name.trim()),
    [adminTeachers]
  );

  // 스탭은 실행 탭만, 이가드팀/관리자는 전체 그룹
  const visibleGroups = useMemo(
    () => (accessLevel === "staff" ? GROUPS.filter(g => g.label === "실행") : [...GROUPS]),
    [accessLevel]
  );
  const activeGroup = useMemo(
    () => visibleGroups.find(g => g.views.some(v => v.key === view)) ?? visibleGroups[0],
    [view, visibleGroups]
  );
  // 행정 데이터 형태 계약 점검 (스탭에겐 숨김 — 기획/운영자용 경고)
  const compatWarnings = useMemo(
    () => (accessLevel === "staff" ? [] : checkAdminCompat(students, groups)),
    [accessLevel, students, groups]
  );
  // 허용되지 않은 탭(스탭이 기획/정보 뷰에 있던 경우)이면 실행 기본 탭으로
  useEffect(() => {
    if (!visibleGroups.some(g => g.views.some(v => v.key === view))) setView(visibleGroups[0].views[0].key);
  }, [visibleGroups, view]);

  // 헤더 실제 높이를 CSS 변수로 노출 — sticky 요소(스탭 명단 바)가 모바일/데스크톱·줄바꿈에서 헤더에 안 가리도록
  useEffect(() => {
    const el = headerRef.current;
    if (!el) return;
    const apply = () => document.documentElement.style.setProperty("--ig-header-h", `${el.offsetHeight}px`);
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    window.addEventListener("resize", apply);
    return () => { ro.disconnect(); window.removeEventListener("resize", apply); };
  }, [retreat, view]);

  if (retreatLoading) return <CenterSpinner />;
  if (!user || accessLevel === "none") return null;
  if (!retreat) return (
    <div className="min-h-screen flex flex-col items-center justify-center text-center px-6">
      <p className="text-slate-500 mb-4">수련회를 찾을 수 없습니다.</p>
      <button onClick={() => router.push("/")} className="btn-secondary">홈으로</button>
    </div>
  );

  const executionViews = GROUPS[0].views;

  return (
    <div className="min-h-screen overflow-x-hidden bg-slate-50 pb-24 sm:pb-12">
      <header ref={headerRef} className="sticky top-0 z-20" style={{ background: "var(--color-header-bg)" }}>
        <div className="max-w-6xl mx-auto px-3 sm:px-4">
          <div className="pt-2.5 pb-2 flex items-center gap-2 sm:gap-3">
            <button onClick={() => router.push("/")} className="shrink-0 text-[11px] text-slate-400 hover:text-fuchsia-200 sm:text-xs" aria-label="수련회 목록으로 돌아가기">← 목록</button>
            <span className="hidden text-slate-600 sm:inline">|</span>
            <span className="px-2 py-0.5 rounded-full text-xs font-semibold shrink-0" style={{ background: "var(--color-badge-bg)", color: "var(--color-primary-light)", border: "1px solid var(--color-badge-border)" }}>{retreat.year}년</span>
            <h1 className="min-w-0 flex-1 truncate text-sm font-bold text-white sm:text-base">{retreat.name}</h1>
            {accessLevel !== "staff" && (
              <button
                onClick={() => {
                  setView("schedule");
                  setSheetSettingsOpen(true);
                }}
                className="shrink-0 text-[11px] flex items-center gap-1 transition-colors text-slate-400 hover:text-fuchsia-200 whitespace-nowrap sm:text-xs"
                aria-label="시트 설정 열기"
              >
                <span className="sm:hidden" aria-hidden="true">⚙</span><span className="hidden sm:inline">⚙ 시트 설정</span>
              </button>
            )}
          </div>
          {/* 대그룹 */}
          <div className="flex gap-1 overflow-x-auto" role="tablist" aria-label="뷰 그룹">
            {visibleGroups.map(g => {
              const active = g.label === activeGroup.label;
              return (
                <button key={g.label} onClick={() => setView(g.views[0].key)}
                  role="tab"
                  aria-selected={active}
                  className="rounded-t-lg px-4 py-2 text-sm font-semibold transition-colors sm:px-5"
                  style={active ? { background: "#fff", color: "#1e293b" } : { background: "transparent", color: "#94a3b8" }}>
                  {g.label}
                </button>
              );
            })}
          </div>
        </div>
        {/* 소그룹 */}
        <div className={`bg-white border-b border-slate-200 ${activeGroup.label === "실행" ? "hidden sm:block" : "block"}`}>
          <div className="max-w-6xl mx-auto px-4 flex gap-0 overflow-x-auto" role="tablist" aria-label={`${activeGroup.label} 하위 탭`}>
            {activeGroup.views.map(v => (
              <button key={v.key} onClick={() => setView(v.key)}
                role="tab"
                aria-selected={view === v.key}
                className="px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap"
                style={view === v.key ? { borderColor: "var(--color-primary)", color: "var(--color-primary)" } : { borderColor: "transparent", color: "var(--color-text-muted)" }}>
                {v.label}
              </button>
            ))}
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-3 py-4 sm:px-4 sm:py-6">
        {!connected && (
          <div className="mb-4 bg-red-50 border border-red-300 rounded-lg p-3 text-sm text-red-700 flex items-center gap-2 animate-pulse" role="alert">
            <span className="text-lg" aria-hidden="true">📡</span>
            <span><strong>네트워크 연결이 끊겼습니다.</strong> 인원체크·동선 변경이 서버에 저장되지 않을 수 있어요. 와이파이를 확인한 뒤, 연결이 돌아오면 방금 한 작업이 반영됐는지 다시 확인해주세요.</span>
          </div>
        )}
        {loadError && <div className="mb-4 bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">⚠ 로드 오류: {loadError}</div>}

        {!dataLoading && !compatDismissed && compatWarnings.length > 0 && (
          <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            <div className="flex items-start justify-between gap-3">
              <div className="font-semibold">⚠ 행정 데이터 호환성 경고</div>
              <button onClick={() => setCompatDismissed(true)} className="shrink-0 text-xs text-amber-500 hover:text-amber-700">닫기</button>
            </div>
            <ul className="mt-1.5 space-y-1">
              {compatWarnings.map((w, i) => (
                <li key={i} className="text-xs leading-relaxed">
                  • <strong>{w.text}</strong>{w.hint ? <span className="text-amber-600"> — {w.hint}</span> : null}
                </li>
              ))}
            </ul>
            <div className="mt-1.5 text-[11px] text-amber-500">행정 사이트의 명단·조편성 형식이 바뀌었을 수 있습니다. 행정팀과 확인해주세요.</div>
          </div>
        )}

        {dataLoading && (
          <div className="card p-8 text-center text-slate-400">
            <div className="mx-auto mb-3 h-7 w-7 rounded-full border-2 border-fuchsia-500 border-t-transparent animate-spin" />
            <p className="text-sm">수련회 데이터를 불러오는 중입니다.</p>
          </div>
        )}

        {!dataLoading && view === "check" && <ChecklistView retreatId={id} groups={groups} students={students} participants={participants} teachers={adminTeachers} buses={buses} retreatName={retreat.name} year={retreat.year} checkedKeys={attendanceKeys} attendanceInfo={attendanceInfo} partial={partial} cellColors={cellColors} schedule={schedule} />}
        {!dataLoading && view === "rooms" && <RoomsView groups={groups} rooms={rooms} buses={buses} meals={meals} staff={staffForViews} groupStaff={groupStaff} retreatName={retreat.name} year={retreat.year} />}
        {!dataLoading && view === "cue" && <CueCardView staff={staffForViews} schedule={schedule} posts={posts} movements={movements} retreat={retreat} periods={periods} preferredStaffNames={preferredStaffNames} />}
        {!dataLoading && view === "leadercue" && <LeaderCueManageView retreatId={id} schedule={schedule} />}
        {!dataLoading && view === "board" && <PostBoardView staff={staffForViews} schedule={schedule} posts={posts} movements={movements} retreat={retreat} periods={periods} />}
        {!dataLoading && view === "schedule" && <ScheduleView retreatId={id} retreatName={retreat.name} schedule={schedule} staff={staffForViews} posts={posts} movements={movements} buses={buses} groups={groups} absentStaffNames={absentStaffNames} sheetSettingsOpen={sheetSettingsOpen} onSheetSettingsClose={() => setSheetSettingsOpen(false)} />}
        {!dataLoading && view === "posts" && <PostsView retreatId={id} posts={posts} />}
        {!dataLoading && view === "staff" && <StaffView retreatId={id} staff={staffForViews} />}
        {!dataLoading && view === "movements" && <MovementsView staff={staffForViews} schedule={schedule} posts={posts} movements={movements} />}
        {!dataLoading && view === "validate" && <ValidationView retreatId={id} staff={staffForViews} schedule={schedule} posts={posts} movements={movements} />}
        {!dataLoading && view === "groupstaff" && <GroupStaffView retreatId={id} groups={groups} staff={staffForViews} students={students} adminTeachers={adminTeachers} partial={partial} cellColors={cellColors} groupStaff={groupStaff} />}
        {!dataLoading && view === "meals" && <MealsView retreatId={id} meals={meals} groups={groups} seatings={seating} />}
        {!dataLoading && view === "buses" && <BusesView retreatId={id} buses={buses} groups={groups} students={students} participants={participants} teachers={adminTeachers} partial={partial} cellColors={cellColors} schedule={schedule} />}
        {!dataLoading && view === "seating" && <SeatingView retreatId={id} seating={seating} groups={groups} meals={meals} />}
        {!dataLoading && view === "guide" && <GuideView retreatId={id} guide={guide} />}
        {!dataLoading && view === "todos" && <TodosView todos={todos} />}
      </main>

      {/* 하단 탭바는 실행 뷰에서만 — 기획·정보 화면에서는 숨겨 세로 공간 확보 + 오탐 이동 방지 (2026-07-12) */}
      {executionViews.some(v => v.key === view) && (
        <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 px-2 pb-[max(env(safe-area-inset-bottom),0.5rem)] pt-2 shadow-[0_-8px_24px_rgba(15,23,42,0.08)] backdrop-blur sm:hidden" aria-label="실행 뷰 탐색">
          <div className="mx-auto grid max-w-md grid-cols-4 gap-1" role="tablist">
            {executionViews.map(v => {
              const active = view === v.key;
              return (
                <button
                  key={v.key}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setView(v.key)}
                  className={`min-h-12 rounded-lg px-1.5 text-[11px] font-semibold transition-colors ${
                    active ? "bg-fuchsia-700 text-white shadow-sm" : "text-slate-500 hover:bg-slate-100"
                  }`}
                >
                  <span aria-hidden="true" className="block text-sm leading-none mb-0.5">{v.icon}</span>
                  {v.label}
                </button>
              );
            })}
          </div>
        </nav>
      )}
    </div>
  );
}
