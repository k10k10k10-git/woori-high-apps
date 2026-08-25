"use client";

// 훈련·사역팀 탭 라우터 + 공용 구독 단일 지점.
// 주일 사역(행정·바나바)은 학기와 독립된 /sunday-ministry에서 관리한다.

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { useLoadErrors } from "@/lib/useLoadErrors";
import { canAccessArea, canEditArea } from "@/features/portal/accessPolicy";
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
import LoginButton from "@/components/LoginButton";
import { useViewMode } from "@/context/ViewModeContext";
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

const TAB_INTRO: Record<TabName, { title: string; description: string }> = {
  신청: { title: "훈련·사역팀 신청 및 삭제", description: "이름으로 찾아 신청을 접수하거나 삭제합니다." },
  배치: { title: "사역팀 배치", description: "희망 팀을 확인하고 팀별 명단을 완성합니다." },
  출석: { title: "출석부", description: "주차별 출석과 점수·출석률·수료 판정, 수료증·사진 작업을 한 표에서 관리합니다." },
  커리큘럼: { title: "사역팀 커리큘럼", description: "각 팀의 주차별 모임 계획을 작성하고 공유합니다." },
  아카이브: { title: "사역 자료 보관", description: "파일을 직접 업로드하거나 외부 문서·영상 링크를 연결합니다." },
  설정: { title: "학기 운영 설정", description: "학기 제목, 사역팀, 훈련 반, 주차와 수료 기준을 관리합니다." },
};

function tabLabel(tab: TabName): string {
  return tab === "신청" ? "신청 및 삭제" : tab;
}

function validInitialTab(value?: string): TabName {
  if (value === "수료") return "출석";
  return value && (SEMESTER_TRAINING_TABS as readonly string[]).includes(value)
    ? value as TabName
    : SEMESTER_TRAINING_TABS[0];
}

export default function SemesterClient({ semesterId, initialTab }: { semesterId: string; initialTab?: string }) {
  const router = useRouter();
  const { user, loading: authLoading, roles, signIn } = useAuth();
  const { isMobileView } = useViewMode();
  const allowed = canAccessArea("semester", roles);
  const canEdit = canEditArea("semester", roles);
  const [pickedTab, setPickedTab] = useState<TabName | null>(null);
  const [meta, setMeta] = useState<SemesterMeta | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [trainingClasses, setTrainingClasses] = useState<TrainingClass[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [applications, setApplications] = useState<Application[]>([]);
  const { fail, ok, message: loadError } = useLoadErrors(`${semesterId}|${user?.uid ?? ""}`);

  useEffect(() => {
    if (!user || !allowed) return;
    const unsubs = [
      subscribeSemesterMeta(semesterId, (value) => { setMeta(value); ok("학기 정보"); }, fail("학기 정보")),
      subscribeTeams(semesterId, (value) => { setTeams(value); ok("사역팀"); }, fail("사역팀")),
      subscribeTrainingClasses(semesterId, (value) => { setTrainingClasses(value); ok("훈련 반"); }, fail("훈련 반")),
      subscribeSessions(semesterId, (value) => { setSessions(value); ok("회차"); }, fail("회차")),
      subscribeApplications(semesterId, (value) => { setApplications(value); ok("신청 명단"); }, fail("신청 명단")),
    ];
    return () => unsubs.forEach((unsubscribe) => unsubscribe());
  }, [allowed, fail, ok, semesterId, user]);

  const teamById = useMemo(() => new Map(teams.map((team) => [team.id, team])), [teams]);
  const visibleTabs = useMemo<readonly TabName[]>(
    () => canEdit ? SEMESTER_TRAINING_TABS : SEMESTER_TRAINING_TABS.filter((name) => name !== "설정"),
    [canEdit],
  );
  const defaultTab = isMobileView ? "출석" : validInitialTab(initialTab);
  const activeTab = pickedTab && visibleTabs.includes(pickedTab)
    ? pickedTab
    : visibleTabs.includes(defaultTab) ? defaultTab : visibleTabs[0];
  const mobileSection = mobileSectionOf(activeTab);

  function selectMobileSection(section: MobileSection) {
    if (section === "신청·배치") {
      setPickedTab(activeTab === "신청" || activeTab === "배치" ? activeTab : "신청");
      return;
    }
    if (section === "운영") {
      const operatingTab = activeTab === "아카이브" || activeTab === "설정" ? activeTab : "아카이브";
      setPickedTab(operatingTab === "설정" && !canEdit ? "아카이브" : operatingTab);
      return;
    }
    setPickedTab(section);
  }

  if (authLoading) return <main className="min-h-screen flex items-center justify-center text-slate-500">불러오는 중…</main>;
  if (!user) return <main className="min-h-screen flex flex-col items-center justify-center gap-4"><p className="text-sm text-slate-500">로그인이 필요합니다</p><LoginButton signIn={signIn} /></main>;
  if (!allowed) {
    return <main className="min-h-screen flex flex-col items-center justify-center gap-3 px-6 text-center"><h1 className="text-xl font-bold text-slate-800">학기 화면 접근 권한이 없습니다</h1><p className="text-sm text-slate-500">이가드팀 계정은 현장 운영 화면만 사용할 수 있습니다.</p><button onClick={() => router.push("/")} className="btn-secondary">통합 홈으로</button></main>;
  }

  return (
    <div className="semester-scope">
      <header className="workspace-sticky-header">
        <div className="workspace-header">
          <div className="mx-auto max-w-6xl px-4">
            <div className="flex min-w-0 items-center gap-1.5 py-3 sm:gap-3">
              <button onClick={() => router.push("/semesters")} className="shrink-0 rounded-lg px-2 py-1.5 text-[11px] text-slate-400 transition-colors hover:bg-white/10 hover:text-white sm:text-xs" aria-label="학기 목록으로 돌아가기">← 목록</button>
              <button onClick={() => router.push("/semesters")} className="shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold sm:px-2 sm:text-xs" style={{ background: "var(--color-badge-bg)", color: "var(--color-badge-text)", border: "1px solid var(--color-badge-border)" }} aria-label="학기 선택">{semesterId}</button>
              <h1 className="min-w-0 flex-1 truncate text-xs font-bold text-white sm:text-base">{meta?.title ?? "학기 중 사역"}</h1>
              {!canEdit && <span className="shrink-0 rounded-full bg-amber-400/15 px-2 py-0.5 text-[10px] font-semibold text-amber-200 sm:text-xs">조회 전용</span>}
            </div>
          </div>
        </div>
        <div className="workspace-tabs">
          <div className="mx-auto max-w-6xl px-0 sm:px-4">
            {isMobileView ? (
              <div className="mobile-workspace-tabs" role="tablist" aria-label="학기 중 사역 주요 업무">
                {MOBILE_SECTIONS.map((section) => <button key={section} role="tab" aria-selected={mobileSection === section} aria-controls="tab-content-panel" onClick={() => selectMobileSection(section)}>{section}</button>)}
              </div>
            ) : (
              <div className="tab-scroll-container flex gap-0 overflow-x-auto scrollbar-hide" role="tablist" aria-label="훈련·사역팀 탭">
                {visibleTabs.map((name) => <button key={name} role="tab" aria-selected={activeTab === name} aria-controls="tab-content-panel" onClick={() => setPickedTab(name)} className="workspace-tab">{tabLabel(name)}</button>)}
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
        {loadError && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">⚠ 로드 오류: {loadError}</div>}
        {isMobileView && mobileSection === "신청·배치" && (
          <div className="mobile-subtabs" role="tablist" aria-label="신청과 배치">
            {(["신청", "배치"] as const).map((name) => <button key={name} role="tab" aria-selected={activeTab === name} onClick={() => setPickedTab(name)}>{name === "신청" ? "신청 및 삭제" : name}</button>)}
          </div>
        )}
        {isMobileView && mobileSection === "운영" && (
          <div className="mobile-subtabs" role="tablist" aria-label="학기 운영">
            <button role="tab" aria-selected={activeTab === "아카이브"} onClick={() => setPickedTab("아카이브")}>자료 보관</button>
            {canEdit && <button role="tab" aria-selected={activeTab === "설정"} onClick={() => setPickedTab("설정")}>학기 설정</button>}
          </div>
        )}
        <div className="mb-5 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div><p className="section-kicker">{tabLabel(activeTab)}</p><h2 className="mt-1 text-xl font-bold text-slate-900 sm:text-2xl">{TAB_INTRO[activeTab].title}</h2><p className="mt-1 text-sm text-slate-500">{TAB_INTRO[activeTab].description}</p></div>
          <p className="mt-2 text-xs text-slate-400 sm:mt-0">신청 {applications.filter((item) => item.status !== "취소").length}명 · 사역팀 {teams.length}개 · 훈련 반 {trainingClasses.length}개 · 주차 {sessions.filter((session) => session.type !== "휴강").length}주{sessions.some((session) => session.type === "휴강") ? ` · 휴강 ${sessions.filter((session) => session.type === "휴강").length}일` : ""}</p>
        </div>
        <div role="tabpanel" id="tab-content-panel" className="min-h-[360px]">
          {!canEdit && <ReadOnlyBanner what="학기 사역 자료" why="편집은 행정팀·스탭팀장·교역자·통합관리자만 가능합니다." />}
          <SemesterEditProvider canEdit={canEdit}>
            {activeTab === "신청" && <IntakeTab sid={semesterId} teams={teams} trainingClasses={trainingClasses} applications={applications} />}
            {activeTab === "배치" && <AssignTab sid={semesterId} teams={teams} trainingClasses={trainingClasses} applications={applications} teamById={teamById} />}
            {activeTab === "출석" && <AttendanceTab sid={semesterId} meta={meta} teams={teams} trainingClasses={trainingClasses} sessions={sessions} applications={applications} teamById={teamById} />}
            {activeTab === "커리큘럼" && <CurriculumTab sid={semesterId} teams={teams} trainingClasses={trainingClasses} sessions={sessions} />}
            {activeTab === "아카이브" && <ArchiveTab sid={semesterId} />}
            {activeTab === "설정" && canEdit && <SettingsTab sid={semesterId} meta={meta} teams={teams} trainingClasses={trainingClasses} sessions={sessions} applications={applications} />}
          </SemesterEditProvider>
        </div>
      </main>
    </div>
  );
}
