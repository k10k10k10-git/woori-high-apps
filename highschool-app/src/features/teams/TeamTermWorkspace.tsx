"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import WorkspaceSkeleton from "@/components/WorkspaceSkeleton";
import ReadOnlyBanner from "@/components/ReadOnlyBanner";
import { useAuth } from "@/context/AuthContext";
import { subscribeApplications, subscribeSemesterMeta, subscribeSessions, subscribeTeams, subscribeTrainingClasses } from "@/features/semester/db";
import type { Application, SemesterMeta, Session, Team, TrainingClass } from "@/features/semester/types";
import { sundayTeamOf, type SundayTeamKey } from "@/features/portal/featureCatalog";
import { canAccessTeam, canEditTeam, semesterTeamForKey } from "./teamModel";
import { TeamAccessState } from "./TeamAccessState";
import { SemesterEditProvider } from "@/features/semester/EditContext";
import AttendanceTab from "@/app/semester/[id]/AttendanceTab";
import CurriculumTab from "@/app/semester/[id]/CurriculumTab";
import ArchiveTab from "@/app/semester/[id]/ArchiveTab";

export type TeamTermSection = "overview" | "roster" | "attendance" | "curriculum" | "records";

const SECTIONS: Array<{ key: TeamTermSection; label: string }> = [
  { key: "overview", label: "개요" },
  { key: "roster", label: "명단" },
  { key: "attendance", label: "출석" },
  { key: "curriculum", label: "커리큘럼" },
  { key: "records", label: "자료·기록" },
];

export default function TeamTermWorkspace({ teamKey, semesterId, section }: { teamKey: SundayTeamKey; semesterId: string; section: TeamTermSection }) {
  const { user, roles, teamMemberships } = useAuth();
  const allowed = canAccessTeam(teamKey, roles, teamMemberships);
  const [meta, setMeta] = useState<SemesterMeta | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [trainingClasses, setTrainingClasses] = useState<TrainingClass[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [applications, setApplications] = useState<Application[]>([]);
  const [ready, setReady] = useState(new Set<string>());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user || !allowed) return;
    const mark = (key: string) => setReady((current) => new Set(current).add(key));
    const fail = (key: string) => (reason: Error) => { setError(reason.message); mark(key); };
    return (() => {
      const unsubs = [
        subscribeSemesterMeta(semesterId, (value) => { setMeta(value); mark("meta"); }, fail("meta")),
        subscribeTeams(semesterId, (value) => { setTeams(value); mark("teams"); }, fail("teams")),
        subscribeTrainingClasses(semesterId, (value) => { setTrainingClasses(value); mark("training"); }, fail("training")),
        subscribeSessions(semesterId, (value) => { setSessions(value); mark("sessions"); }, fail("sessions")),
        subscribeApplications(semesterId, (value) => { setApplications(value); mark("applications"); }, fail("applications")),
      ];
      return () => unsubs.forEach((unsubscribe) => unsubscribe());
    })();
  }, [allowed, semesterId, user]);

  const team = semesterTeamForKey(teams, teamKey);
  const teamById = useMemo(() => new Map(teams.map((item) => [item.id, item])), [teams]);
  const roster = useMemo(() => team ? applications.filter((item) => item.status !== "취소" && item.teamId === team.id) : [], [applications, team]);
  const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });
  const past = !!meta?.endDate && meta.endDate < today;
  const broadEditor = roles.semester === "superAdmin" || roles.semester === "pastor";
  const editable = canEditTeam(teamKey, roles, teamMemberships) && (!past || broadEditor);
  const loaded = ready.size === 5;
  const teamMeta = sundayTeamOf(teamKey)!;

  return <TeamAccessState allowed={allowed}><main className="team-term-page">
    <header className="team-term-header">
      <div className="team-workspace-title"><Link href="/teams">팀</Link><span>/</span><Link href={`/teams/${teamKey}`}>{teamMeta.label}</Link><span>/</span><span>{semesterId}</span></div>
      <div className="team-term-heading"><div><p className="section-kicker">TERM</p><h1>{teamMeta.label} · {meta?.title ?? semesterId}</h1><p>현재 팀과 학기를 고정해 다른 팀 기록을 잘못 수정하지 않도록 했습니다.</p></div>{past && <span className="team-role-badge">지난 학기</span>}</div>
      <nav className="team-term-tabs" aria-label={`${teamMeta.label} ${semesterId} 메뉴`}>{SECTIONS.map((item) => <Link key={item.key} href={`/teams/${teamKey}/terms/${encodeURIComponent(semesterId)}/${item.key}`} aria-current={section === item.key ? "page" : undefined}>{item.label}</Link>)}</nav>
    </header>
    <section className="team-term-content">
      {error && <div className="team-first-alert" role="alert">학기 정보를 불러오지 못했습니다: {error}</div>}
      {!loaded ? <WorkspaceSkeleton label="팀 학기 정보를 불러오는 중입니다." rows={7} variant="page" /> : !team ? <div className="team-first-empty"><h2>이 학기에 연결된 팀이 없습니다</h2><p>운영센터의 학기 설정에서 {teamMeta.label}의 영구 팀 키를 연결해 주세요.</p></div> : <>
        {!editable && <ReadOnlyBanner what={`${teamMeta.label} ${semesterId} 기록`} why={past ? "지난 학기는 기본적으로 조회 전용입니다." : "조회 역할은 이 팀 기록을 수정할 수 없습니다."} />}
        <SemesterEditProvider canEdit={editable}>
          {section === "overview" && <TeamTermOverview team={team} roster={roster} sessions={sessions} />}
          {section === "roster" && <TeamRoster team={team} roster={roster} />}
          {section === "attendance" && <AttendanceTab sid={semesterId} meta={meta} teams={teams} trainingClasses={trainingClasses} sessions={sessions} applications={applications} teamById={teamById} lockedTeamId={team.id} />}
          {section === "curriculum" && <CurriculumTab sid={semesterId} teams={teams} trainingClasses={trainingClasses} sessions={sessions} lockedTeamId={team.id} />}
          {section === "records" && <div><div className="team-context-note"><strong>학기 공용 자료</strong><span>현재 자료 원장을 그대로 사용하며 팀 중심 화면에서 함께 확인합니다.</span></div><ArchiveTab sid={semesterId} /></div>}
        </SemesterEditProvider>
      </>}
    </section>
  </main></TeamAccessState>;
}

function TeamTermOverview({ team, roster, sessions }: { team: Team; roster: Application[]; sessions: Session[] }) {
  const upcoming = sessions.find((session) => session.date >= new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" }));
  return <div className="team-overview-grid"><section className="team-stat-card"><span>확정 명단</span><strong>{roster.length}명</strong><p>취소 신청을 제외한 현재 팀원</p></section><section className="team-stat-card"><span>학기 회차</span><strong>{sessions.length}회</strong><p>{upcoming ? `다음 모임 ${upcoming.date}` : "예정된 회차 없음"}</p></section><section className="team-goal-card"><span>이번 학기 목표</span><p>{team.goal?.trim() || "아직 입력된 목표가 없습니다."}</p></section></div>;
}

function TeamRoster({ team, roster }: { team: Team; roster: Application[] }) {
  return <section className="team-roster-panel"><header><div><h2>{team.name} 명단</h2><p>운영센터에서 확정된 배치 결과를 실시간으로 표시합니다.</p></div><span>{roster.length}명</span></header>{roster.length === 0 ? <div className="team-first-empty is-compact"><p>배치된 팀원이 없습니다.</p></div> : <div className="team-roster-list">{roster.map((person) => <div key={person.id}><strong>{person.name}</strong><span>{person.bu === "스탭" ? "스탭" : `${person.bu} ${person.grade}학년 ${person.class}반`}</span></div>)}</div>}</section>;
}
