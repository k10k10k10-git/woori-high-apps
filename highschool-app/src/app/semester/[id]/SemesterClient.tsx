"use client";

// 훈련·사역팀 탭 라우터 + 공용 구독 단일 지점.
// 팀·주일 운영은 공통 학기 명단을 사용하되 /sunday-ministry에서 팀별 업무를 관리한다.

import { useEffect, useMemo, useState } from "react";
import { ArrowLeft } from "@phosphor-icons/react";
import Link from "next/link";
import { praiseReturnHref } from "@/features/praise/navigation";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { useLoadErrors } from "@/lib/useLoadErrors";
import { createSubscriptionReadinessGate } from "@/lib/subscriptionReadiness";
import WorkspaceSkeleton from "@/components/WorkspaceSkeleton";
import { canEditArea } from "@/features/portal/accessPolicy";
import {
  subscribeSemesterMeta,
  subscribeTeams,
  subscribeSessions,
  subscribeApplications,
  subscribeTrainingClasses,
} from "@/features/semester/db";
import type { Application, SemesterMeta, Session, Team, TrainingClass } from "@/features/semester/types";
import ReadOnlyBanner from "@/components/ReadOnlyBanner";
import { SemesterEditProvider } from "@/features/semester/EditContext";
import { SEMESTER_TRAINING_TABS } from "@/features/portal/featureCatalog";
import WorkspaceAccessGate from "@/components/WorkspaceAccessGate";
import LoadFailureNotice from "@/components/LoadFailureNotice";
import { useViewMode } from "@/context/ViewModeContext";
import { activeTeamKeys, canAccessOperationsCenter, ownTeamKey } from "@/features/teams/teamModel";
import IntakeTab from "./IntakeTab";
import AssignTab from "./AssignTab";
import AttendanceTab from "./AttendanceTab";
import CurriculumTab from "./CurriculumTab";
import ArchiveTab from "./ArchiveTab";
import SettingsTab from "./SettingsTab";

type TabName = (typeof SEMESTER_TRAINING_TABS)[number];
type MobileSection = "출석" | "신청·배치" | "커리큘럼" | "운영";

const MOBILE_SECTIONS: readonly MobileSection[] = ["출석", "신청·배치", "커리큘럼", "운영"];

function mobileSectionOf(tab: TabName): MobileSection {
  if (tab === "신청" || tab === "배치") return "신청·배치";
  if (tab === "아카이브" || tab === "설정") return "운영";
  return tab;
}

const TAB_TITLES: Record<TabName, string> = {
  신청: "훈련·사역팀 신청 및 삭제",
  배치: "사역팀 배치",
  출석: "출석부",
  커리큘럼: "사역팀 커리큘럼",
  아카이브: "사역 자료 보관",
  설정: "학기 운영 설정",
};

function tabLabel(tab: TabName): string {
  return tab === "신청" ? "신청 및 삭제" : tab;
}

export function validInitialTab(value?: string): TabName {
  if (value === "수료") return "출석";
  return value && (SEMESTER_TRAINING_TABS as readonly string[]).includes(value)
    ? value as TabName
    : SEMESTER_TRAINING_TABS[0];
}

export function initialSemesterTab(value: string | undefined, isMobileView: boolean): TabName {
  if (value === "수료" || (value && (SEMESTER_TRAINING_TABS as readonly string[]).includes(value))) {
    return validInitialTab(value);
  }
  return value === undefined && isMobileView ? "출석" : SEMESTER_TRAINING_TABS[0];
}

/** 현재 주소의 다른 쿼리와 해시는 보존하고 선택한 학기 탭만 갱신한다. */
export function semesterTabHref(tab: TabName, currentHref: string): string {
  const url = new URL(currentHref, "https://example.invalid");
  url.searchParams.set("tab", tab);
  return `${url.pathname}${url.search}${url.hash}`;
}

/** 뒤로가기·앞으로가기로 복원된 주소를 화면 탭 계약으로 해석한다. */
export function semesterTabFromHref(currentHref: string, isMobileView: boolean): TabName {
  const url = new URL(currentHref, "https://example.invalid");
  return initialSemesterTab(url.searchParams.get("tab") ?? undefined, isMobileView);
}

export default function SemesterClient(props: { semesterId: string; initialTab?: string }) {
  const { user, loading, roleError, roles, teamMemberships } = useAuth();
  return <SemesterClientContent key={`${user?.uid ?? "guest"}:${loading}:${!!roleError}:${roles.semester}:${roles.retreat}:${JSON.stringify(teamMemberships)}`} {...props} />;
}

function SemesterClientContent({ semesterId, initialTab }: { semesterId: string; initialTab?: string }) {
  const router = useRouter();
  const query = useSearchParams();
  const praiseHref = praiseReturnHref(new URLSearchParams(query.toString()));
  const requestedTeam = query.get("team") ?? "";
  const { user, loading: authLoading, roleError, roles, teamMemberships } = useAuth();
  const { isMobileView } = useViewMode();
  const allowed = canAccessOperationsCenter(roles, teamMemberships);
  const canEdit = allowed && canEditArea("semester", roles);
  const assignedTeam = ownTeamKey(roles, teamMemberships);
  const assignedTeams = activeTeamKeys(teamMemberships);
  const tabSource = `${semesterId}\u0000${initialTab ?? ""}`;
  const [tabSelection, setTabSelection] = useState<{ source: string; tab: TabName | null }>(() => ({ source: tabSource, tab: null }));
  const pickedTab = tabSelection.source === tabSource ? tabSelection.tab : null;
  const [meta, setMeta] = useState<SemesterMeta | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [trainingClasses, setTrainingClasses] = useState<TrainingClass[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [applications, setApplications] = useState<Application[]>([]);
  const [loadedScope, setLoadedScope] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const { fail, ok, errors, message: loadError } = useLoadErrors(`${semesterId}|${user?.uid ?? ""}|${attempt}`);
  const dataScope = user && allowed ? `${semesterId}|${user.uid}|${attempt}` : null;
  const dataLoading = dataScope == null || loadedScope !== dataScope;

  useEffect(() => {
    if (authLoading || roleError || !user || allowed || assignedTeams.length === 0) return;
    router.replace(assignedTeam
      ? `/teams/${assignedTeam}/terms/${encodeURIComponent(semesterId)}/overview`
      : "/teams");
  }, [allowed, assignedTeam, assignedTeams.length, authLoading, roleError, router, semesterId, user]);

  useEffect(() => {
    if (!user || authLoading || roleError || !allowed) return;
    const scope = `${semesterId}|${user.uid}|${attempt}`;
    let alive = true;
    const readiness = createSubscriptionReadinessGate(
      ["학기 정보", "사역팀", "훈련 반", "회차", "신청 명단"],
      () => { if (alive) setLoadedScope(scope); },
    );
    const ready = (key: string) => { if (alive) { ok(key); readiness.markReady(key); } };
    const failed = (key: string) => (error: Error) => { if (alive) { fail(key)(error); readiness.markReady(key); } };
    const unsubs = [
      subscribeSemesterMeta(semesterId, (value) => { if (!alive) return; setMeta(value); ready("학기 정보"); }, failed("학기 정보")),
      subscribeTeams(semesterId, (value) => { if (!alive) return; setTeams(value); ready("사역팀"); }, failed("사역팀")),
      subscribeTrainingClasses(semesterId, (value) => { if (!alive) return; setTrainingClasses(value); ready("훈련 반"); }, failed("훈련 반")),
      subscribeSessions(semesterId, (value) => { if (!alive) return; setSessions(value); ready("회차"); }, failed("회차")),
      subscribeApplications(semesterId, (value) => { if (!alive) return; setApplications(value); ready("신청 명단"); }, failed("신청 명단")),
    ];
    return () => { alive = false; unsubs.forEach((unsubscribe) => unsubscribe()); };
  }, [attempt, authLoading, roleError, allowed, fail, ok, semesterId, user]);

  const teamById = useMemo(() => new Map(teams.map((team) => [team.id, team])), [teams]);
  const visibleTabs = SEMESTER_TRAINING_TABS;
  const defaultTab = initialSemesterTab(initialTab, isMobileView);
  const activeTab = pickedTab && visibleTabs.includes(pickedTab)
    ? pickedTab
    : visibleTabs.includes(defaultTab) ? defaultTab : visibleTabs[0];
  const mobileSection = mobileSectionOf(activeTab);

  function selectTab(tab: TabName) {
    setTabSelection({ source: tabSource, tab });
    if (typeof window === "undefined") return;
    const href = semesterTabHref(tab, window.location.href);
    const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    if (href !== current) window.history.pushState(null, "", href);
  }

  useEffect(() => {
    const restoreTab = () => {
      setTabSelection({ source: tabSource, tab: semesterTabFromHref(window.location.href, isMobileView) });
    };
    window.addEventListener("popstate", restoreTab);
    return () => window.removeEventListener("popstate", restoreTab);
  }, [isMobileView, tabSource]);

  function selectMobileSection(section: MobileSection) {
    if (section === "신청·배치") {
      selectTab(activeTab === "신청" || activeTab === "배치" ? activeTab : "신청");
      return;
    }
    if (section === "운영") {
      const operatingTab = activeTab === "아카이브" || activeTab === "설정" ? activeTab : "아카이브";
      selectTab(operatingTab);
      return;
    }
    selectTab(section);
  }

  if (authLoading || roleError || !user) return <WorkspaceAccessGate allowed={allowed} area="학기 운영" backHref="/operations" backLabel="운영센터 메뉴로">{null}</WorkspaceAccessGate>;
  if (!allowed) {
    if (assignedTeams.length > 0) return <main className="team-first-state" role="status">담당 팀의 학기 화면으로 이동하고 있습니다…</main>;
    return <WorkspaceAccessGate allowed={false} area="학기 운영" backHref="/operations" backLabel="운영센터 메뉴로">{null}</WorkspaceAccessGate>;
  }

  return (
    <div className="semester-scope">
      <header className="workspace-sticky-header">
        <div className="workspace-header">
          <div className="mx-auto max-w-6xl px-4">
            <div className="flex min-w-0 items-center gap-1.5 py-3 sm:gap-3">
              <button onClick={() => router.push("/operations/semesters")} className="shrink-0 rounded-lg px-2 py-1.5 text-[11px] text-slate-400 transition-colors hover:bg-white/10 hover:text-white sm:text-xs" aria-label="학기 목록으로 돌아가기"><ArrowLeft aria-hidden="true" className="inline align-[-2px]" size={14} /> 목록</button>
              <button onClick={() => router.push("/operations/semesters")} className="shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold sm:px-2 sm:text-xs" style={{ background: "var(--color-badge-bg)", color: "var(--color-badge-text)", border: "1px solid var(--color-badge-border)" }} aria-label="학기 선택">{semesterId}</button>
              <h1 className="min-w-0 flex-1 truncate text-xs font-bold text-white sm:text-base">{meta?.title ?? "학기 운영"}</h1>
              {!canEdit && <span className="shrink-0 rounded-full bg-amber-400/15 px-2 py-0.5 text-[10px] font-semibold text-amber-200 sm:text-xs">조회 전용</span>}
            </div>
          </div>
        </div>
        <div className="workspace-tabs">
          <div className="mx-auto max-w-6xl px-0 sm:px-4">
            {isMobileView ? (
              <div className="mobile-workspace-tabs" role="tablist" aria-label="학기 운영 주요 업무">
                {MOBILE_SECTIONS.map((section) => <button key={section} role="tab" aria-selected={mobileSection === section} aria-controls="tab-content-panel" onClick={() => selectMobileSection(section)}>{section}</button>)}
              </div>
            ) : (
              <div className="tab-scroll-container flex gap-0 overflow-x-auto scrollbar-hide" role="tablist" aria-label="훈련·사역팀 탭">
                {visibleTabs.map((name) => <button key={name} role="tab" aria-selected={activeTab === name} aria-controls="tab-content-panel" onClick={() => selectTab(name)} className="workspace-tab">{tabLabel(name)}{name === "설정" && !canEdit ? " · 권한 필요" : ""}</button>)}
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
        {loadError && <LoadFailureNotice title="학기 정보를 불러오지 못했습니다." sources={Object.keys(errors)} onRetry={() => setAttempt(value => value + 1)} />}
        {loadError ? null : dataLoading ? (
          <WorkspaceSkeleton label="학기 사역 데이터를 불러오는 중입니다." rows={7} variant="page" />
        ) : (
          <>
        {isMobileView && mobileSection === "신청·배치" && (
          <div className="mobile-subtabs" role="tablist" aria-label="신청과 배치">
            {(["신청", "배치"] as const).map((name) => <button key={name} role="tab" aria-selected={activeTab === name} onClick={() => selectTab(name)}>{name === "신청" ? "신청 및 삭제" : name}</button>)}
          </div>
        )}
        {isMobileView && mobileSection === "운영" && (
          <div className="mobile-subtabs" role="tablist" aria-label="학기 운영">
            <button role="tab" aria-selected={activeTab === "아카이브"} onClick={() => selectTab("아카이브")}>자료 보관</button>
            <button role="tab" aria-selected={activeTab === "설정"} onClick={() => selectTab("설정")}>학기 설정{!canEdit ? " · 권한 필요" : ""}</button>
          </div>
        )}
        {praiseHref && <aside className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4" style={{ borderColor: "var(--color-border)", background: "var(--color-surface)" }} aria-label="찬양팀 업무 연결"><strong className="text-sm">{teamById.get(requestedTeam)?.name ?? "찬양팀"} 학기 명단</strong><Link className="btn-secondary" href={praiseHref}>찬양팀 이번 모임으로</Link></aside>}
        <div className="mb-5 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div><p className="section-kicker">{tabLabel(activeTab)}</p><h2 className="mt-1 text-xl font-bold text-slate-900 sm:text-2xl">{TAB_TITLES[activeTab]}</h2></div>
          <p className="mt-2 text-xs text-slate-400 sm:mt-0">신청 {applications.filter((item) => item.status !== "취소").length}명 · 사역팀 {teams.length}개 · 훈련 반 {trainingClasses.length}개 · 주차 {sessions.filter((session) => session.type !== "휴강").length}주{sessions.some((session) => session.type === "휴강") ? ` · 휴강 ${sessions.filter((session) => session.type === "휴강").length}일` : ""}</p>
        </div>
        <div role="tabpanel" id="tab-content-panel" className="min-h-[360px]">
          {!canEdit && <ReadOnlyBanner what="학기 사역 자료" why="편집은 행정팀·스탭팀장·교역자·통합관리자만 가능합니다." />}
          <SemesterEditProvider canEdit={canEdit}>
            {activeTab === "신청" && <IntakeTab sid={semesterId} teams={teams} trainingClasses={trainingClasses} applications={applications} />}
            {activeTab === "배치" && <AssignTab initialTeamId={requestedTeam} sid={semesterId} teams={teams} trainingClasses={trainingClasses} applications={applications} teamById={teamById} />}
            {activeTab === "출석" && <AttendanceTab sid={semesterId} meta={meta} teams={teams} trainingClasses={trainingClasses} sessions={sessions} applications={applications} teamById={teamById} />}
            {activeTab === "커리큘럼" && <CurriculumTab sid={semesterId} teams={teams} trainingClasses={trainingClasses} sessions={sessions} />}
            {activeTab === "아카이브" && <ArchiveTab sid={semesterId} />}
            {activeTab === "설정" && <WorkspaceAccessGate allowed={canEdit} area="학기 설정" embedded backHref="/operations" backLabel="운영센터 메뉴로"><SettingsTab sid={semesterId} meta={meta} teams={teams} trainingClasses={trainingClasses} sessions={sessions} applications={applications} /></WorkspaceAccessGate>}
          </SemesterEditProvider>
        </div>
          </>
        )}
      </main>
    </div>
  );
}
