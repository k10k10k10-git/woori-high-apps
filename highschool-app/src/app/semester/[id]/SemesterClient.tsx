"use client";

// 탭 라우터 + 공용 구독 단일 지점 — 하위 탭 컴포넌트는 직접 구독하지 않고 props로 받는다
// (이가드 useRetreatData 패턴 축소판). 모든 구독은 onError를 loadError에 배선한다.
// 셸 구조(sticky 2단 헤더 + 탭바)는 수련회 행정·이가드 화면과 동일하고 색만 초록이다(.semester-scope).

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { canAccessPortalArea, canEditPortalArea } from "@/features/portal/accessPolicy";
import {
  subscribeSemesterMeta,
  subscribeTeams,
  subscribeSessions,
  subscribeApplications,
} from "@/features/semester/db";
import { Application, SemesterMeta, Session, Team } from "@/features/semester/types";
import { SemesterEditProvider } from "@/features/semester/EditContext";
import IntakeTab from "./IntakeTab";
import LoginButton from "@/components/LoginButton";
import AssignTab from "./AssignTab";
import AttendanceTab from "./AttendanceTab";
import CompletionTab from "./CompletionTab";
import CurriculumTab from "./CurriculumTab";
import ArchiveTab from "./ArchiveTab";
import SettingsTab from "./SettingsTab";
import { SEMESTER_TABS } from "@/features/portal/featureCatalog";

type TabName = (typeof SEMESTER_TABS)[number];

export default function SemesterClient({ semesterId }: { semesterId: string }) {
  const router = useRouter();
  const { user, loading: authLoading, role, signIn } = useAuth();
  const allowed = canAccessPortalArea("semester", role);
  const canEdit = canEditPortalArea("semester", role);
  const [tab, setTab] = useState<TabName>("접수");
  const [meta, setMeta] = useState<SemesterMeta | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [applications, setApplications] = useState<Application[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!user || !allowed) return;
    const fail = (e: Error) => setLoadError(e.message);
    const unsubs = [
      subscribeSemesterMeta(semesterId, setMeta, fail),
      subscribeTeams(semesterId, setTeams, fail),
      subscribeSessions(semesterId, setSessions, fail),
      subscribeApplications(semesterId, setApplications, fail),
    ];
    return () => unsubs.forEach((u) => u());
  }, [semesterId, user, allowed]);

  const teamById = useMemo(() => new Map(teams.map((team) => [team.id, team])), [teams]);

  // 설정 탭은 편집 전용이다 — 조회 권한만 있는 역할에게는 노출하지 않는다.
  const visibleTabs = useMemo<readonly TabName[]>(
    () => (canEdit ? SEMESTER_TABS : SEMESTER_TABS.filter((name) => name !== "설정")),
    [canEdit],
  );
  // 허용되지 않은 탭(조회 전용 역할이 설정 탭에 있던 경우)은 파생값으로 되돌린다 —
  // effect에서 setState하면 cascading render가 된다.
  const activeTab = visibleTabs.includes(tab) ? tab : visibleTabs[0];

  if (authLoading) {
    return <main className="min-h-screen flex items-center justify-center text-slate-500">불러오는 중…</main>;
  }
  if (!user) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center gap-4">
        <p className="text-sm text-slate-500">로그인이 필요합니다</p>
        <LoginButton signIn={signIn} />
      </main>
    );
  }
  if (!allowed) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center gap-3 px-6 text-center">
        <h1 className="text-xl font-bold text-slate-800">학기 화면 접근 권한이 없습니다</h1>
        <p className="text-sm text-slate-500">이가드팀 계정은 현장 운영 화면만 사용할 수 있습니다.</p>
        <button onClick={() => router.push("/")} className="btn-secondary">통합 홈으로</button>
      </main>
    );
  }

  return (
    <div className="semester-scope">
      <header className="sticky top-14 z-20">
        {/* 1단: 다크 배경 — 타이틀 */}
        <div style={{ background: "var(--color-header-bg)" }}>
          <div className="max-w-6xl mx-auto px-4">
            <div className="pt-2 sm:pt-3 pb-1.5 sm:pb-2 flex items-center gap-1.5 sm:gap-3 min-w-0">
              <button
                onClick={() => router.push("/semesters")}
                className="shrink-0 px-1 py-1 text-[11px] text-slate-400 transition-colors hover:text-emerald-200 sm:text-xs"
                aria-label="학기 목록으로 돌아가기"
              >
                ← 목록
              </button>
              <span
                className="shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold sm:px-2 sm:text-xs"
                style={{ background: "var(--color-badge-bg)", color: "var(--color-primary-light)", border: "1px solid var(--color-badge-border)" }}
              >
                {semesterId}
              </span>
              <h1 className="min-w-0 flex-1 truncate text-xs font-bold text-white sm:text-base">{meta?.title ?? "학기 중 사역"}</h1>
              {!canEdit && (
                <span className="shrink-0 rounded-full bg-amber-400/15 px-2 py-0.5 text-[10px] font-semibold text-amber-200 sm:text-xs">
                  조회 전용
                </span>
              )}
            </div>
          </div>
        </div>

        {/* 2단: 흰 배경 — 탭 (행정 화면 소그룹 탭과 동일 패턴) */}
        <div className="border-b bg-white" style={{ borderColor: "var(--color-border)" }}>
          <div className="max-w-6xl mx-auto px-0 sm:px-4">
            <div className="flex gap-0 overflow-x-auto scrollbar-hide tab-scroll-container" role="tablist" aria-label="학기 탭">
              {visibleTabs.map((name) => (
                <button
                  key={name}
                  role="tab"
                  aria-selected={activeTab === name}
                  aria-controls="tab-content-panel"
                  onClick={() => setTab(name)}
                  className="min-h-11 whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-medium transition-colors"
                  style={activeTab === name
                    ? { borderColor: "var(--color-primary)", color: "var(--color-primary)" }
                    : { borderColor: "transparent", color: "var(--color-text-muted)" }}
                >
                  {name}
                </button>
              ))}
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-5 sm:py-6">
        {loadError && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            ⚠ 로드 오류: {loadError}
          </div>
        )}

        <div role="tabpanel" id="tab-content-panel">
          <SemesterEditProvider canEdit={canEdit}>
            {activeTab === "접수" && <IntakeTab sid={semesterId} teams={teams} applications={applications} />}
            {activeTab === "배치" && <AssignTab sid={semesterId} teams={teams} applications={applications} teamById={teamById} />}
            {activeTab === "출석" && (
              <AttendanceTab sid={semesterId} teams={teams} sessions={sessions} applications={applications} teamById={teamById} />
            )}
            {activeTab === "수료" && (
              <CompletionTab sid={semesterId} meta={meta} sessions={sessions} applications={applications} teamById={teamById} />
            )}
            {activeTab === "커리큘럼" && <CurriculumTab sid={semesterId} teams={teams} sessions={sessions} />}
            {activeTab === "아카이브" && <ArchiveTab sid={semesterId} />}
            {activeTab === "설정" && canEdit && (
              <SettingsTab sid={semesterId} meta={meta} teams={teams} sessions={sessions} applications={applications} />
            )}
          </SemesterEditProvider>
        </div>
      </main>
    </div>
  );
}
