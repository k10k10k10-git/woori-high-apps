"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { useAuth } from "@/features/iguard/context/AuthContext";
import { useRetreatPinGate } from "@/features/portal/useRetreatPinGate";
import { checkAdminCompat } from "@/features/iguard/lib/compat";
import { useRetreatData } from "@/features/iguard/hooks/useRetreatData";
import {
  Group, IguardStaff,
  TeacherAttendance,
} from "@/features/iguard/lib/types";
import CenterSpinner from "@/components/CenterSpinner";
import ChecklistView from "./ChecklistView";
import RoomsView from "./RoomsView";
import LodgingMapView from "./LodgingMapView";
import MealsView from "./MealsView";
import StaffView from "./StaffView";
import ScheduleView from "./ScheduleView";
import ScheduleOverviewView from "./ScheduleOverviewView";
import PostsView from "./PostsView";
import MovementsView from "./MovementsView";
import ValidationView from "./ValidationView";
import BusesView from "./BusesView";
import SeatingView from "./SeatingView";
import { CueCardView, PostBoardView } from "./ExecutionViews";
import LeaderCueManageView from "./LeaderCueManageView";
import { GuideView, TodosView } from "./InfoViews";
import GroupStaffView from "./GroupStaffView";
import GbsPlacesView from "./GbsPlacesView";
import BadgeCardsView from "./BadgeCardsView";
import RetreatPinGate from "./RetreatPinGate";
import SearchOverlay from "./SearchOverlay";
import type { SearchIndexInput } from "@/features/iguard/lib/personIndex";
import { currentBlockFor, currentRetreatDay } from "@/features/iguard/lib/scheduleTime";
import { IGUARD_VIEW_GROUPS } from "@/features/portal/featureCatalog";
import { canAccessPortalArea, iguardScope } from "@/features/portal/accessPolicy";

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
  const { user, loading: authLoading, role } = useAuth();
  const fieldAllowed = canAccessPortalArea("retreat-field", role);
  // 잠금 판정은 행정 화면과 같은 훅을 쓴다 — 어느 쪽에서 잠가도 양쪽이 같은 결론을 낸다.
  const { lock, unlocked, lockError, markUnlocked } = useRetreatPinGate(id, {
    enabled: !authLoading && !!user && fieldAllowed,
    role,
  });

  useEffect(() => {
    if (!authLoading && (!user || !fieldAllowed)) router.push("/");
  }, [authLoading, user, fieldAllowed, router]);

  if (authLoading) return <CenterSpinner />;
  if (!user || !fieldAllowed) return null;
  if (lockError) return (
    <div className="flex min-h-screen flex-col items-center justify-center px-6 text-center">
      <div className="mb-3 text-3xl" aria-hidden="true">⚠️</div>
      <p className="mb-4 max-w-md text-sm text-red-700" role="alert">{lockError}</p>
      <button onClick={() => router.push(`/retreat/${id}`)} className="btn-secondary">행정 화면으로</button>
    </div>
  );
  if (lock === undefined) return <CenterSpinner />;
  if (lock && !unlocked) return (
    <RetreatPinGate retreatId={id} lock={lock} onUnlocked={markUnlocked} onBack={() => router.push(`/retreat/${id}`)} />
  );
  return <IguardWorkspace id={id} />;
}

function IguardWorkspace({ id }: { id: string }) {
  const router = useRouter();
  const { user, role, memberName } = useAuth();
  const executionOnly = iguardScope(role) === "execution";
  const fieldAllowed = canAccessPortalArea("retreat-field", role);

  const [view, setView] = useState<string>("cue");
  const [searchOpen, setSearchOpen] = useState(false);
  const [sheetSettingsOpen, setSheetSettingsOpen] = useState(false);
  const [compatDismissed, setCompatDismissed] = useState(false);
  const headerRef = useRef<HTMLElement | null>(null);

  // 데이터 허브 — 모든 구독을 커스텀 훅에서 관리
  const {
    retreat, retreatLoading, dataLoading, loadError,
    groups, rooms, students, participants, adminTeachers,
    meals, schedule, segments, posts, movements, movementRecords, buses, seating,
    todos, guide, periods, attendanceKeys, attendanceInfo, partial, cellColors, groupStaff, gbs, lodgingMaps,
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
  // 전역 검색 입력 — 새 구독 없이 이미 구독 중인 데이터의 파생이다(새 DB 경로·쓰기 없음).
  // 현재 블록은 여는 시점 기준으로 한 번 계산한다. 시계 tick에 의존하면 패턴 17(선택 리셋) 위험이 있어
  // 여기서는 tick을 걸지 않고, 시간 판정은 scheduleTime의 헬퍼에만 맡긴다.
  const searchData = useMemo<SearchIndexInput>(() => ({
    groups, rooms, students, participants, adminTeachers,
    staff: staffForViews, groupStaff, buses, movements, posts,
    partial, cellColors,
    currentBlockId: currentBlockFor(schedule, currentRetreatDay(periods, retreat ?? undefined))?.id ?? null,
  }), [
    groups, rooms, students, participants, adminTeachers, staffForViews, groupStaff,
    buses, movements, posts, partial, cellColors, schedule, periods, retreat,
  ]);
  const absentStaffNames = useMemo(
    () => adminTeachers.filter(t => t.bu === "스탭" && t.status === "불참" && t.name?.trim()).map(t => t.name.trim()),
    [adminTeachers]
  );

  // 스탭은 실행 탭만, 이가드팀/관리자는 전체 그룹
  const visibleGroups = useMemo(
    () => (executionOnly ? IGUARD_VIEW_GROUPS.filter(g => g.label === "실행") : [...IGUARD_VIEW_GROUPS]),
    [executionOnly]
  );
  const activeGroup = useMemo(
    () => visibleGroups.find(g => g.views.some(v => v.key === view)) ?? visibleGroups[0],
    [view, visibleGroups]
  );
  // 행정 데이터 형태 계약 점검 (스탭에겐 숨김 — 기획/운영자용 경고)
  const compatWarnings = useMemo(
    () => (executionOnly ? [] : checkAdminCompat(students, groups)),
    [executionOnly, students, groups]
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
  if (!user || !fieldAllowed) return null;
  if (!retreat) return (
    <div className="min-h-screen flex flex-col items-center justify-center text-center px-6">
      <p className="text-slate-500 mb-4">수련회를 찾을 수 없습니다.</p>
      <button onClick={() => router.push("/")} className="btn-secondary">홈으로</button>
    </div>
  );

  const executionViews = IGUARD_VIEW_GROUPS[0].views;
  // 기획 탭은 큐싯 5열 편집처럼 가로가 필요한 PC 화면이라 컨테이너를 넓힌다.
  // 실행 탭은 현장·모바일 기준이므로 기존 폭을 유지한다(밀도 튜닝이 이 폭 기준).
  const shellWidth = activeGroup.label === "기획" ? "max-w-[1760px]" : "max-w-6xl";

  return (
    <div className="min-h-screen overflow-x-clip bg-slate-50 pb-24 sm:pb-12">
      <header ref={headerRef} className="sticky top-14 z-20" style={{ background: "var(--color-header-bg)" }}>
        <div className={`${shellWidth} mx-auto px-3 sm:px-4`}>
          <div className="pt-2.5 pb-2 flex items-center gap-2 sm:gap-3">
            <button onClick={() => router.push("/")} className="min-h-10 shrink-0 px-1 text-xs text-slate-300 hover:text-fuchsia-200" aria-label="수련회 목록으로 돌아가기">← 목록</button>
            <span className="hidden text-slate-600 sm:inline">|</span>
            <span className="px-2 py-0.5 rounded-full text-xs font-semibold shrink-0" style={{ background: "var(--color-badge-bg)", color: "var(--color-primary-light)", border: "1px solid var(--color-badge-border)" }}>{retreat.year}년</span>
            <h1 className="min-w-0 flex-1 truncate text-sm font-bold text-white sm:text-base">{retreat.name}</h1>
            <button
              onClick={() => setSearchOpen(true)}
              disabled={dataLoading}
              className="flex min-h-10 min-w-10 shrink-0 items-center justify-center gap-1 whitespace-nowrap rounded-lg px-2 text-xs text-slate-300 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-40"
              aria-label="이름·조·호실·호차 검색"
            >
              <span aria-hidden="true">🔍</span><span className="hidden sm:inline">검색</span>
            </button>
            {!executionOnly && (
              <button
                onClick={() => {
                  setView("schedule");
                  setSheetSettingsOpen(true);
                }}
                className="flex min-h-10 min-w-10 shrink-0 items-center justify-center gap-1 whitespace-nowrap px-2 text-xs text-slate-300 transition-colors hover:bg-white/10 hover:text-fuchsia-200"
                aria-label="큐싯 가져오기 열기"
              >
                <span className="sm:hidden" aria-hidden="true">⬇</span><span className="hidden sm:inline">⬇ 큐싯 가져오기</span>
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
                  className="min-h-11 rounded-t-lg px-4 py-2 text-sm font-semibold transition-colors sm:px-5"
                  style={active ? { background: "#fff", color: "#1e293b" } : { background: "transparent", color: "#94a3b8" }}>
                  {g.label}
                </button>
              );
            })}
          </div>
        </div>
        {/* 소그룹 */}
        <div className={`bg-white border-b border-slate-200 ${activeGroup.label === "실행" ? "hidden sm:block" : "block"}`}>
          <div className={`${shellWidth} mx-auto px-4 flex gap-0 overflow-x-auto`} role="tablist" aria-label={`${activeGroup.label} 하위 탭`}>
            {activeGroup.views.map(v => (
              <button key={v.key} onClick={() => setView(v.key)}
                role="tab"
                aria-selected={view === v.key}
                className="min-h-11 whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-medium transition-colors"
                style={view === v.key ? { borderColor: "var(--color-primary)", color: "var(--color-primary)" } : { borderColor: "transparent", color: "var(--color-text-muted)" }}>
                {v.label}
              </button>
            ))}
          </div>
        </div>
      </header>

      <main className={`${shellWidth} mx-auto px-3 py-4 sm:px-4 sm:py-6`}>
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
              <button onClick={() => setCompatDismissed(true)} className="min-h-9 shrink-0 rounded px-2 text-xs text-amber-600 hover:bg-amber-100 hover:text-amber-800">닫기</button>
            </div>
            <ul className="mt-1.5 space-y-1">
              {compatWarnings.map((w, i) => (
                <li key={i} className="text-xs leading-relaxed">
                  • <strong>{w.text}</strong>{w.hint ? <span className="text-amber-600"> — {w.hint}</span> : null}
                </li>
              ))}
            </ul>
            <div className="mt-1.5 text-xs text-amber-600">행정 사이트의 명단·조편성 형식이 바뀌었을 수 있습니다. 행정팀과 확인해주세요.</div>
          </div>
        )}

        {dataLoading && (
          <div className="card p-8 text-center text-slate-400">
            <div className="mx-auto mb-3 h-7 w-7 rounded-full border-2 border-fuchsia-500 border-t-transparent animate-spin" />
            <p className="text-sm">수련회 데이터를 불러오는 중입니다.</p>
          </div>
        )}

        {!dataLoading && view === "check" && <ChecklistView retreatId={id} groups={groups} students={students} participants={participants} teachers={adminTeachers} buses={buses} retreatName={retreat.name} year={retreat.year} checkedKeys={attendanceKeys} attendanceInfo={attendanceInfo} partial={partial} cellColors={cellColors} schedule={schedule} />}
        {!dataLoading && view === "rooms" && <RoomsView groups={groups} rooms={rooms} buses={buses} meals={meals} staff={staffForViews} groupStaff={groupStaff} gbs={gbs} students={students} partial={partial} cellColors={cellColors} retreatName={retreat.name} year={retreat.year} />}
        {!dataLoading && view === "lodging" && <LodgingMapView retreatId={id} rooms={rooms} groups={groups} students={students} partial={partial} cellColors={cellColors} maps={lodgingMaps} mode="view" />}
        {!dataLoading && view === "lodgingmap" && <LodgingMapView retreatId={id} rooms={rooms} groups={groups} students={students} partial={partial} cellColors={cellColors} maps={lodgingMaps} mode="manage" />}
        {!dataLoading && view === "cue" && <CueCardView retreatId={id} staff={staffForViews} schedule={schedule} posts={posts} movements={movements} retreat={retreat} periods={periods} preferredStaffNames={preferredStaffNames} groups={groups} groupStaff={groupStaff} gbs={gbs} />}
        {!dataLoading && view === "leadercue" && <LeaderCueManageView retreatId={id} schedule={schedule} />}
        {!dataLoading && view === "board" && <PostBoardView staff={staffForViews} schedule={schedule} posts={posts} movements={movements} retreat={retreat} periods={periods} />}
        {!dataLoading && view === "overview" && <ScheduleOverviewView schedule={schedule} />}
        {!dataLoading && view === "schedule" && <ScheduleView retreatId={id} retreatName={retreat.name} schedule={schedule} staff={staffForViews} posts={posts} segments={segments} movements={movements} movementRecords={movementRecords} buses={buses} groups={groups} absentStaffNames={absentStaffNames} sheetSettingsOpen={sheetSettingsOpen} onSheetSettingsClose={() => setSheetSettingsOpen(false)} />}
        {!dataLoading && view === "posts" && <PostsView retreatId={id} posts={posts} />}
        {!dataLoading && view === "staff" && <StaffView retreatId={id} staff={staffForViews} />}
        {!dataLoading && view === "movements" && <MovementsView staff={staffForViews} schedule={schedule} posts={posts} movements={movements} />}
        {!dataLoading && view === "validate" && <ValidationView staff={staffForViews} schedule={schedule} posts={posts} movements={movements} />}
        {!dataLoading && view === "groupstaff" && <GroupStaffView retreatId={id} groups={groups} staff={staffForViews} students={students} adminTeachers={adminTeachers} partial={partial} cellColors={cellColors} groupStaff={groupStaff} />}
        {!dataLoading && view === "gbs" && <GbsPlacesView retreatId={id} groups={groups} gbs={gbs} />}
        {!dataLoading && view === "badge" && (
          <BadgeCardsView
            retreatId={id}
            retreatName={retreat.name}
            year={retreat.year}
            staff={staffForViews}
            groups={groups}
            groupStaff={groupStaff}
            gbs={gbs}
            buses={buses}
            meals={meals}
            seating={seating}
            schedule={schedule}
            posts={posts}
            movements={movementRecords}
            rooms={rooms}
            students={students}
            partial={partial}
            cellColors={cellColors}
          />
        )}
        {!dataLoading && view === "meals" && <MealsView retreatId={id} meals={meals} groups={groups} seatings={seating} />}
        {!dataLoading && view === "buses" && <BusesView retreatId={id} buses={buses} groups={groups} students={students} participants={participants} teachers={adminTeachers} partial={partial} cellColors={cellColors} schedule={schedule} />}
        {!dataLoading && view === "seating" && <SeatingView retreatId={id} seating={seating} groups={groups} meals={meals} />}
        {!dataLoading && view === "guide" && <GuideView retreatId={id} guide={guide} />}
        {!dataLoading && view === "todos" && <TodosView todos={todos} />}
      </main>

      {searchOpen && (
        <SearchOverlay
          data={searchData}
          onClose={() => setSearchOpen(false)}
          onJump={nextView => { setView(nextView); setSearchOpen(false); }}
        />
      )}

      {/* 하단 탭바는 실행 뷰에서만 — 기획·정보 화면에서는 숨겨 세로 공간 확보 + 오탐 이동 방지 (2026-07-12) */}
      {executionViews.some(v => v.key === view) && (
        <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 px-2 pb-[max(env(safe-area-inset-bottom),0.5rem)] pt-2 shadow-[0_-8px_24px_rgba(15,23,42,0.08)] backdrop-blur sm:hidden" aria-label="실행 뷰 탐색">
          <div className="mx-auto grid max-w-md grid-cols-5 gap-1" role="tablist">
            {executionViews.map(v => {
              const active = view === v.key;
              return (
                <button
                  key={v.key}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setView(v.key)}
                  className={`min-h-14 rounded-lg px-1.5 text-xs font-semibold transition-colors ${
                    active ? "bg-fuchsia-700 text-white shadow-sm" : "text-slate-500 hover:bg-slate-100"
                  }`}
                >
                  <span aria-hidden="true" className="mb-1 block text-base leading-none">{v.icon}</span>
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
