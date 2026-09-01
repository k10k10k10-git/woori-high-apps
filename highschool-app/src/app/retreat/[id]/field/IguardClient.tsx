"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useParams, useSearchParams } from "next/navigation";
import {
  ArrowLeft, DownloadSimple, DotsThreeVertical,
  MagnifyingGlass, WarningCircle, WifiSlash,
} from "@phosphor-icons/react";
import { useAuth } from "@/features/iguard/context/AuthContext";
import { useRetreatPinGate } from "@/features/portal/useRetreatPinGate";
import { checkAdminCompat } from "@/features/iguard/lib/compat";
import { useRetreatData } from "@/features/iguard/hooks/useRetreatData";
import {
  Group, IguardStaff,
  TeacherAttendance,
} from "@/features/iguard/lib/types";
import CenterSpinner from "@/components/CenterSpinner";
import WorkspaceSkeleton from "@/components/WorkspaceSkeleton";
import ChecklistView from "./ChecklistView";
import RoomsView from "./RoomsView";
import LodgingMapView from "./LodgingMapView";
import MealsView from "./MealsView";
import StaffView from "./StaffView";
import PublishedProgramsView from "./PublishedProgramsView";
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
import RetreatAreaNav from "@/features/portal/RetreatAreaNav";
import { canAccessArea, iguardScopeOf } from "@/features/portal/accessPolicy";
import { useViewMode } from "@/context/ViewModeContext";

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
  const { user, loading: authLoading, roles } = useAuth();
  const fieldAllowed = canAccessArea("retreat-field", roles);
  // 잠금 판정은 행정 화면과 같은 훅을 쓴다 — 어느 쪽에서 잠가도 양쪽이 같은 결론을 낸다.
  const { lock, unlocked, lockError, markUnlocked } = useRetreatPinGate(id, {
    enabled: !authLoading && !!user && fieldAllowed,
    roles,
  });

  useEffect(() => {
    if (!authLoading && (!user || !fieldAllowed)) router.push("/");
  }, [authLoading, user, fieldAllowed, router]);

  if (authLoading) return <CenterSpinner />;
  if (!user || !fieldAllowed) return null;
  if (lockError) return (
    <div className="flex min-h-screen flex-col items-center justify-center px-6 text-center">
      <WarningCircle aria-hidden="true" className="mb-3 text-red-600" size={32} weight="regular" />
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
  const searchParams = useSearchParams();
  const { user, roles, memberName } = useAuth();
  const { isMobileView } = useViewMode();
  const executionOnly = iguardScopeOf(roles) === "execution";

  useEffect(() => {
    document.body.classList.add("iguard-route-active");
    return () => document.body.classList.remove("iguard-route-active");
  }, []);
  const fieldAllowed = canAccessArea("retreat-field", roles);

  const view = searchParams.get("view") ?? "cue";
  const [searchOpen, setSearchOpen] = useState(false);
  const [sheetSettingsOpen, setSheetSettingsOpen] = useState(false);
  const [fieldToolsOpen, setFieldToolsOpen] = useState(false);
  const [compatDismissed, setCompatDismissed] = useState(false);
  const headerRef = useRef<HTMLElement | null>(null);
  const fieldToolsRef = useRef<HTMLDivElement | null>(null);
  const selectView = useCallback((nextView: string) => {
    const nextParams = new URLSearchParams(searchParams.toString());
    nextParams.set("view", nextView);
    // 같은 현장 작업 화면의 탭 상태다. 서버 라우트를 다시 탐색하지 않고
    // 공유 가능한 URL만 갱신해 인증·실시간 구독·현재 화면을 유지한다.
    window.history.replaceState(null, "", `/retreat/${encodeURIComponent(id)}/field?${nextParams.toString()}`);
  }, [id, searchParams]);

  // 데이터 허브 — 모든 구독을 커스텀 훅에서 관리
  const {
    retreat, retreatLoading, dataLoading, loadError,
    groups, rooms, students, participants, adminTeachers,
    meals, schedule, segments, posts, movements, movementRecords, buses, seating,
    todos, guide, periods, attendanceKeys, attendanceInfo, partial, cellColors, groupStaff, gbs, lodgingMaps, programs,
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
  // 허용되지 않은 탭(스탭이 기획/정보 뷰에 있던 경우)이면 실행 기본 탭으로 —
  // 렌더 중 파생으로 되돌린다. effect에서 setState하면 cascading render가 되고,
  // 30초 시계 tick류 effect와 겹치면 사용자 선택을 덮는다(루트 CLAUDE.md 실수 13).
  const activeView = visibleGroups.some(g => g.views.some(v => v.key === view))
    ? view
    : visibleGroups[0].views[0].key;

  const activeGroup = useMemo(
    () => visibleGroups.find(g => g.views.some(v => v.key === activeView)) ?? visibleGroups[0],
    [activeView, visibleGroups]
  );
  // 행정 데이터 형태 계약 점검 (스탭에겐 숨김 — 기획/운영자용 경고)
  const compatWarnings = useMemo(
    () => (executionOnly ? [] : checkAdminCompat(students, groups)),
    [executionOnly, students, groups]
  );
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
  }, [retreat, activeView]);

  useEffect(() => {
    if (!fieldToolsOpen) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setFieldToolsOpen(false);
    }
    function onPointerDown(event: MouseEvent | TouchEvent) {
      if (!fieldToolsRef.current?.contains(event.target as Node)) setFieldToolsOpen(false);
    }
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
    };
  }, [fieldToolsOpen]);

  if (retreatLoading) return <CenterSpinner />;
  if (!user || !fieldAllowed) return null;
  if (!retreat) return (
    <div className="min-h-screen flex flex-col items-center justify-center text-center px-6">
      <p className="text-slate-500 mb-4">수련회를 찾을 수 없습니다.</p>
      <button onClick={() => router.push("/")} className="btn-secondary">홈으로</button>
    </div>
  );

  const mobileInfoKeys = ["rooms", "lodging", "buses", "seating", "meals", "programs"] as const;
  const mobileInfoActive = mobileInfoKeys.some((key) => key === activeView);
  const mobileExecutionTabs = [
    { key: "cue", label: "큐카드" },
    { key: "board", label: "포스트" },
    { key: "check", label: "인원체크" },
    { key: "rooms", label: "정보" },
  ] as const;
  // 기획 탭은 큐싯 5열 편집처럼 가로가 필요한 PC 화면이라 컨테이너를 넓힌다.
  // 실행 탭은 현장·모바일 기준이므로 기존 폭을 유지한다(밀도 튜닝이 이 폭 기준).
  const shellWidth = activeGroup.label === "기획" ? "max-w-[1760px]" : "max-w-6xl";

  return (
    <div className="iguard-scope min-h-screen overflow-x-clip pb-8 sm:pb-12">
      <header ref={headerRef} className="workspace-sticky-header workspace-header iguard-workspace-header">
        <div className={`${shellWidth} mx-auto px-3 sm:px-4`}>
          <div className="field-title-row pt-2.5 pb-2 flex items-center gap-2 sm:gap-3">
            <button onClick={() => router.push("/")} className="field-header-back min-h-10 shrink-0 rounded-lg px-2 text-xs text-slate-300 transition hover:bg-white/10 hover:text-white" aria-label="수련회 목록으로 돌아가기">
              <ArrowLeft aria-hidden="true" size={17} weight="bold" /><span>목록</span>
            </button>
            <span className="hidden text-slate-600 sm:inline">|</span>
            <span className="hidden px-2 py-0.5 rounded-full text-xs font-semibold shrink-0 sm:inline-flex" style={{ background: "var(--color-badge-bg)", color: "var(--color-badge-text)", border: "1px solid var(--color-badge-border)" }}>{retreat.year}년</span>
            <h1 className="min-w-0 truncate text-sm font-bold text-white sm:text-base">{retreat.name}</h1>
            <RetreatAreaNav retreatId={id} current="field" adminAllowed={canAccessArea("retreat-admin", roles)} fieldAllowed onNavigate={(href) => router.push(href)} />
            <button
              onClick={() => setSearchOpen(true)}
              disabled={dataLoading}
              className="ml-auto hidden min-h-10 min-w-10 shrink-0 items-center justify-center gap-1 whitespace-nowrap rounded-lg px-2 text-xs text-slate-300 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-40 sm:flex"
              aria-label="이름·조·호실·호차 검색"
            >
              <MagnifyingGlass aria-hidden="true" size={17} weight="regular" /><span>검색</span>
            </button>
            {!executionOnly && (
              <button
                onClick={() => {
                  selectView("schedule");
                  setSheetSettingsOpen(true);
                }}
                className="hidden min-h-10 min-w-10 shrink-0 items-center justify-center gap-1 whitespace-nowrap rounded-lg px-2 text-xs text-slate-300 transition-colors hover:bg-white/10 hover:text-[var(--color-on-dark-accent)] sm:flex"
                aria-label="큐싯 가져오기 열기"
              >
                <DownloadSimple aria-hidden="true" size={17} weight="regular" /><span>큐싯 가져오기</span>
              </button>
            )}
            <div ref={fieldToolsRef} className="relative ml-auto shrink-0 sm:hidden sm:ml-0">
              <button
                type="button"
                className="field-header-more"
                onClick={() => setFieldToolsOpen(value => !value)}
                aria-label="수련회 도구 열기"
                aria-haspopup="menu"
                aria-expanded={fieldToolsOpen}
              >
                <DotsThreeVertical aria-hidden="true" size={20} weight="bold" />
              </button>
              {fieldToolsOpen && (
                <div className="field-tools-menu" role="menu">
                  <p>{retreat.year}년 수련회</p>
                  <button type="button" role="menuitem" disabled={dataLoading} onClick={() => { setFieldToolsOpen(false); setSearchOpen(true); }}>
                    <MagnifyingGlass aria-hidden="true" size={18} /> 이름·조·숙소 검색
                  </button>
                  {!executionOnly && (
                    <button type="button" role="menuitem" onClick={() => { setFieldToolsOpen(false); selectView("schedule"); setSheetSettingsOpen(true); }}>
                      <DownloadSimple aria-hidden="true" size={18} /> 큐싯 가져오기
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
          {isMobileView ? (
            <div className="iguard-mobile-tabs" role="tablist" aria-label="수련회 현장 주요 업무">
              {mobileExecutionTabs.map((item) => {
                const selected = item.key === "rooms" ? mobileInfoActive : activeView === item.key;
                return <button key={item.key} role="tab" aria-selected={selected} onClick={() => selectView(item.key)}>{item.label}</button>;
              })}
            </div>
          ) : (
            <div className="field-group-tabs flex gap-1 overflow-x-auto" role="tablist" aria-label="뷰 그룹">
              {visibleGroups.map(g => {
                const active = g.label === activeGroup.label;
                return (
                  <button key={g.label} onClick={() => selectView(g.views[0].key)}
                    role="tab"
                    aria-selected={active}
                    className="workspace-group-tab">
                    {g.label}
                  </button>
                );
              })}
            </div>
          )}
        </div>
        {/* 소그룹 */}
        {!isMobileView && <div className="workspace-tabs">
          <div className={`${shellWidth} mx-auto px-4 flex gap-0 overflow-x-auto`} role="tablist" aria-label={`${activeGroup.label} 하위 탭`}>
            {activeGroup.views.map(v => (
              <button key={v.key} onClick={() => selectView(v.key)}
                role="tab"
                aria-selected={activeView === v.key}
                className="workspace-tab"
              >
                {v.label}
              </button>
            ))}
          </div>
        </div>}
      </header>

      <main className={`${shellWidth} mx-auto px-3 py-4 sm:px-4 sm:py-6 ${activeGroup.label === "실행" ? "field-execution-main" : ""}`}>
        {isMobileView && mobileInfoActive && (
          <div className="mobile-subtabs iguard-info-tabs" role="tablist" aria-label="수련회 현장 정보">
            {([
              ["rooms", "조별 정보"], ["lodging", "숙소 안내"], ["buses", "버스"], ["seating", "자리"], ["meals", "식사"], ["programs", "프로그램"],
            ] as const).map(([key, label]) => <button key={key} role="tab" aria-selected={activeView === key} onClick={() => selectView(key)}>{label}</button>)}
          </div>
        )}
        {!connected && (
          <div className="mb-4 bg-red-50 border border-red-300 rounded-lg p-3 text-sm text-red-700 flex items-center gap-2 animate-pulse" role="alert">
            <WifiSlash aria-hidden="true" className="shrink-0" size={18} />
            <span><strong>네트워크 연결이 끊겼습니다.</strong> 인원체크·동선 변경이 서버에 저장되지 않을 수 있어요. 와이파이를 확인한 뒤, 연결이 돌아오면 방금 한 작업이 반영됐는지 다시 확인해주세요.</span>
          </div>
        )}
        {loadError && <div className="mb-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700"><WarningCircle aria-hidden="true" className="mt-0.5 shrink-0" size={17} /><span>로드 오류: {loadError}</span></div>}

        {!dataLoading && !compatDismissed && compatWarnings.length > 0 && (
          <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-1.5 font-semibold"><WarningCircle aria-hidden="true" size={17} />행정 데이터 호환성 경고</div>
              <button onClick={() => setCompatDismissed(true)} className="min-h-10 shrink-0 rounded px-2 text-xs text-amber-600 hover:bg-amber-100 hover:text-amber-800">닫기</button>
            </div>
            <ul className="mt-1.5 space-y-1">
              {compatWarnings.map((w, i) => (
                <li key={i} className="text-xs leading-relaxed">
                  • <strong>{w.text}</strong>{w.hint ? <span className="text-amber-600"> - {w.hint}</span> : null}
                </li>
              ))}
            </ul>
            <div className="mt-1.5 text-xs text-amber-600">행정 사이트의 명단·조편성 형식이 바뀌었을 수 있습니다. 행정팀과 확인해주세요.</div>
          </div>
        )}

        {dataLoading && (
          <WorkspaceSkeleton label="수련회 현장 데이터를 불러오는 중입니다." rows={6} />
        )}

        {!dataLoading && activeView === "check" && <ChecklistView retreatId={id} groups={groups} students={students} participants={participants} teachers={adminTeachers} buses={buses} retreatName={retreat.name} year={retreat.year} checkedKeys={attendanceKeys} attendanceInfo={attendanceInfo} partial={partial} cellColors={cellColors} schedule={schedule} />}
        {!dataLoading && activeView === "rooms" && <RoomsView groups={groups} rooms={rooms} buses={buses} meals={meals} staff={staffForViews} groupStaff={groupStaff} gbs={gbs} students={students} partial={partial} cellColors={cellColors} retreatName={retreat.name} year={retreat.year} />}
        {!dataLoading && activeView === "lodging" && <LodgingMapView retreatId={id} rooms={rooms} groups={groups} students={students} partial={partial} cellColors={cellColors} maps={lodgingMaps} mode="view" />}
        {!dataLoading && activeView === "lodgingmap" && <LodgingMapView retreatId={id} rooms={rooms} groups={groups} students={students} partial={partial} cellColors={cellColors} maps={lodgingMaps} mode="manage" />}
        {!dataLoading && activeView === "cue" && <CueCardView retreatId={id} staff={staffForViews} schedule={schedule} posts={posts} movements={movements} retreat={retreat} periods={periods} preferredStaffNames={preferredStaffNames} groups={groups} groupStaff={groupStaff} gbs={gbs} />}
        {!dataLoading && activeView === "leadercue" && <LeaderCueManageView retreatId={id} schedule={schedule} />}
        {!dataLoading && activeView === "board" && <PostBoardView staff={staffForViews} schedule={schedule} posts={posts} movements={movements} retreat={retreat} periods={periods} />}
        {!dataLoading && activeView === "overview" && <ScheduleOverviewView schedule={schedule} />}
        {!dataLoading && activeView === "schedule" && <ScheduleView retreatId={id} retreatName={retreat.name} schedule={schedule} staff={staffForViews} posts={posts} segments={segments} movements={movements} movementRecords={movementRecords} buses={buses} groups={groups} absentStaffNames={absentStaffNames} sheetSettingsOpen={sheetSettingsOpen} onSheetSettingsClose={() => setSheetSettingsOpen(false)} />}
        {!dataLoading && activeView === "posts" && <PostsView retreatId={id} posts={posts} />}
        {!dataLoading && activeView === "staff" && <StaffView retreatId={id} staff={staffForViews} />}
        {!dataLoading && activeView === "movements" && <MovementsView staff={staffForViews} schedule={schedule} posts={posts} movements={movements} />}
        {!dataLoading && activeView === "validate" && <ValidationView staff={staffForViews} schedule={schedule} posts={posts} movements={movements} />}
        {!dataLoading && activeView === "groupstaff" && <GroupStaffView retreatId={id} groups={groups} staff={staffForViews} students={students} adminTeachers={adminTeachers} partial={partial} cellColors={cellColors} groupStaff={groupStaff} />}
        {!dataLoading && activeView === "gbs" && <GbsPlacesView retreatId={id} groups={groups} gbs={gbs} />}
        {!dataLoading && activeView === "badge" && (
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
        {!dataLoading && activeView === "meals" && <MealsView retreatId={id} meals={meals} groups={groups} seatings={seating} />}
        {!dataLoading && activeView === "buses" && <BusesView retreatId={id} buses={buses} groups={groups} students={students} participants={participants} teachers={adminTeachers} partial={partial} cellColors={cellColors} schedule={schedule} />}
        {!dataLoading && activeView === "seating" && <SeatingView retreatId={id} seating={seating} groups={groups} meals={meals} />}
        {!dataLoading && activeView === "guide" && <GuideView retreatId={id} guide={guide} />}
        {!dataLoading && activeView === "todos" && <TodosView todos={todos} />}
        {!dataLoading && activeView === "programs" && <PublishedProgramsView programs={programs} groups={groups} />}
      </main>

      {searchOpen && (
        <SearchOverlay
          data={searchData}
          onClose={() => setSearchOpen(false)}
          onJump={nextView => { selectView(nextView); setSearchOpen(false); }}
        />
      )}

    </div>
  );
}
