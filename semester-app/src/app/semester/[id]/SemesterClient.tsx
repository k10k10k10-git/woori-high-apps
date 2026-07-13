"use client";

// 탭 라우터 + 공용 구독 단일 지점 — 하위 탭 컴포넌트는 직접 구독하지 않고 props로 받는다
// (이가드 useRetreatData 패턴 축소판). 모든 구독은 onError를 loadError에 배선한다.

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import {
  subscribeSemesterMeta,
  subscribeTeams,
  subscribeSessions,
  subscribeApplications,
} from "@/lib/db";
import { Application, SemesterMeta, Session, Team } from "@/lib/types";
import IntakeTab from "./IntakeTab";
import LoginButton from "@/components/LoginButton";
import AssignTab from "./AssignTab";
import AttendanceTab from "./AttendanceTab";
import CompletionTab from "./CompletionTab";
import CurriculumTab from "./CurriculumTab";
import ArchiveTab from "./ArchiveTab";
import SettingsTab from "./SettingsTab";

const TABS = ["접수", "배치", "출석", "수료", "커리큘럼", "아카이브", "설정"] as const;
type TabName = (typeof TABS)[number];

export default function SemesterClient({ semesterId }: { semesterId: string }) {
  const { user, loading: authLoading, accessLevel, signIn } = useAuth();
  const [tab, setTab] = useState<TabName>("접수");
  const [meta, setMeta] = useState<SemesterMeta | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [applications, setApplications] = useState<Application[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!user || accessLevel === "none") return;
    const fail = (e: Error) => setLoadError(e.message);
    const unsubs = [
      subscribeSemesterMeta(semesterId, setMeta, fail),
      subscribeTeams(semesterId, setTeams, fail),
      subscribeSessions(semesterId, setSessions, fail),
      subscribeApplications(semesterId, setApplications, fail),
    ];
    return () => unsubs.forEach((u) => u());
  }, [semesterId, user, accessLevel]);

  const teamById = useMemo(() => new Map(teams.map((t) => [t.id, t])), [teams]);

  if (authLoading) {
    return <main className="min-h-screen flex items-center justify-center text-gray-500">불러오는 중…</main>;
  }
  if (!user) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center gap-4">
        <p className="text-sm text-gray-500">로그인이 필요합니다</p>
        <LoginButton signIn={signIn} />
      </main>
    );
  }
  if (accessLevel === "none") {
    return (
      <main className="min-h-screen flex items-center justify-center text-sm text-gray-500">
        접근 권한이 없습니다 (행정팀 멤버 전용)
      </main>
    );
  }

  return (
    <main className="max-w-5xl mx-auto p-4 sm:p-6">
      <header className="mb-4">
        <Link href="/" className="text-xs text-gray-400 hover:text-gray-600">
          ← 학기 목록
        </Link>
        <h1 className="text-xl font-bold mt-1">{meta?.title ?? semesterId}</h1>
      </header>

      {loadError && (
        <div className="mb-4 bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
          ⚠ 로드 오류: {loadError}
        </div>
      )}

      <nav role="tablist" aria-label="학기 탭" className="flex gap-1 overflow-x-auto mb-5 pb-1">
        {TABS.map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={`px-3.5 py-2 rounded-lg text-sm whitespace-nowrap font-medium ${
              tab === t ? "bg-blue-100 text-blue-900" : "text-gray-500 hover:bg-gray-100"
            }`}
          >
            {t}
          </button>
        ))}
      </nav>

      <div role="tabpanel" id="tab-content-panel">
        {tab === "접수" && <IntakeTab sid={semesterId} teams={teams} applications={applications} />}
        {tab === "배치" && <AssignTab sid={semesterId} teams={teams} applications={applications} teamById={teamById} />}
        {tab === "출석" && (
          <AttendanceTab sid={semesterId} teams={teams} sessions={sessions} applications={applications} teamById={teamById} />
        )}
        {tab === "수료" && (
          <CompletionTab sid={semesterId} meta={meta} sessions={sessions} applications={applications} teamById={teamById} />
        )}
        {tab === "커리큘럼" && <CurriculumTab sid={semesterId} teams={teams} sessions={sessions} />}
        {tab === "아카이브" && <ArchiveTab sid={semesterId} />}
        {tab === "설정" && <SettingsTab sid={semesterId} meta={meta} teams={teams} sessions={sessions} applications={applications} />}
      </div>
    </main>
  );
}
