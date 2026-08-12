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
import { SemesterEditProvider } from "@/features/semester/EditContext";
import { SEMESTER_TRAINING_TABS } from "@/features/portal/featureCatalog";
import LoginButton from "@/components/LoginButton";
import IntakeTab from "./IntakeTab";
import AssignTab from "./AssignTab";
import AttendanceTab from "./AttendanceTab";
import CompletionTab from "./CompletionTab";
import CurriculumTab from "./CurriculumTab";
import ArchiveTab from "./ArchiveTab";
import SettingsTab from "./SettingsTab";

type TabName = (typeof SEMESTER_TRAINING_TABS)[number];

const TAB_INTRO: Record<TabName, { title: string; description: string }> = {
  신청: { title: "훈련·사역팀 신청", description: "이름으로 찾아 훈련 반과 사역팀 지망, 연락처를 접수합니다." },
  배치: { title: "사역팀 배치", description: "희망 팀을 확인하고 팀별 명단을 완성합니다." },
  출석: { title: "출석부", description: "사역팀 출석부와 훈련 출석부를 나눠 회차별로 기록합니다." },
  수료: { title: "훈련 및 사역팀 수료 현황", description: "출석 점수에 따른 수료 여부와 후속 제작 사역을 확인합니다." },
  커리큘럼: { title: "사역팀 커리큘럼", description: "각 팀의 회차별 모임 계획을 작성하고 공유합니다." },
  아카이브: { title: "사역 자료 보관", description: "파일을 직접 업로드하거나 외부 문서·영상 링크를 연결합니다." },
  설정: { title: "학기 운영 설정", description: "학기 제목, 사역팀, 훈련 반, 회차와 수료 기준을 관리합니다." },
};

function validInitialTab(value?: string): TabName {
  return value && (SEMESTER_TRAINING_TABS as readonly string[]).includes(value)
    ? value as TabName
    : SEMESTER_TRAINING_TABS[0];
}

export default function SemesterClient({ semesterId, initialTab }: { semesterId: string; initialTab?: string }) {
  const router = useRouter();
  const { user, loading: authLoading, roles, signIn } = useAuth();
  const allowed = canAccessArea("semester", roles);
  const canEdit = canEditArea("semester", roles);
  const [tab, setTab] = useState<TabName>(() => validInitialTab(initialTab));
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
  const activeTab = visibleTabs.includes(tab) ? tab : visibleTabs[0];

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
              <span className="shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold sm:px-2 sm:text-xs" style={{ background: "var(--color-badge-bg)", color: "var(--color-primary-light)", border: "1px solid var(--color-badge-border)" }}>{semesterId}</span>
              <h1 className="min-w-0 flex-1 truncate text-xs font-bold text-white sm:text-base">{meta?.title ?? "학기 중 사역"}</h1>
              {!canEdit && <span className="shrink-0 rounded-full bg-amber-400/15 px-2 py-0.5 text-[10px] font-semibold text-amber-200 sm:text-xs">조회 전용</span>}
            </div>
          </div>
        </div>
        <div className="workspace-tabs">
          <div className="mx-auto max-w-6xl px-0 sm:px-4">
            <div className="tab-scroll-container flex gap-0 overflow-x-auto scrollbar-hide" role="tablist" aria-label="훈련·사역팀 탭">
              {visibleTabs.map((name) => <button key={name} role="tab" aria-selected={activeTab === name} aria-controls="tab-content-panel" onClick={() => setTab(name)} className="workspace-tab">{name}</button>)}
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
        {loadError && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">⚠ 로드 오류: {loadError}</div>}
        <div className="mb-5 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div><p className="section-kicker">{activeTab}</p><h2 className="mt-1 text-xl font-bold text-slate-900 sm:text-2xl">{TAB_INTRO[activeTab].title}</h2><p className="mt-1 text-sm text-slate-500">{TAB_INTRO[activeTab].description}</p></div>
          <p className="mt-2 text-xs text-slate-400 sm:mt-0">신청 {applications.filter((item) => item.status !== "취소").length}명 · 사역팀 {teams.length}개 · 훈련 반 {trainingClasses.length}개 · 회차 {sessions.length}회</p>
        </div>
        <div role="tabpanel" id="tab-content-panel" className="min-h-[360px]">
          <SemesterEditProvider canEdit={canEdit}>
            {activeTab === "신청" && <IntakeTab sid={semesterId} teams={teams} trainingClasses={trainingClasses} applications={applications} />}
            {activeTab === "배치" && <AssignTab sid={semesterId} teams={teams} trainingClasses={trainingClasses} applications={applications} teamById={teamById} />}
            {activeTab === "출석" && <AttendanceTab sid={semesterId} teams={teams} trainingClasses={trainingClasses} sessions={sessions} applications={applications} teamById={teamById} />}
            {activeTab === "수료" && <CompletionTab sid={semesterId} meta={meta} sessions={sessions} applications={applications} teamById={teamById} />}
            {activeTab === "커리큘럼" && <CurriculumTab sid={semesterId} teams={teams} trainingClasses={trainingClasses} sessions={sessions} />}
            {activeTab === "아카이브" && <ArchiveTab sid={semesterId} />}
            {activeTab === "설정" && canEdit && <SettingsTab sid={semesterId} meta={meta} teams={teams} trainingClasses={trainingClasses} sessions={sessions} applications={applications} />}
          </SemesterEditProvider>
        </div>
      </main>
    </div>
  );
}
