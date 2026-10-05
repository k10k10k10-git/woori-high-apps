"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import LoadFailureNotice from "@/components/LoadFailureNotice";
import WorkspaceSkeleton from "@/components/WorkspaceSkeleton";
import ReadOnlyBanner from "@/components/ReadOnlyBanner";
import { useAuth } from "@/context/AuthContext";
import { subscribeApplications, subscribeApplicationsPrivate, subscribeSemesterMeta, subscribeSessions, subscribeTeams, subscribeTrainingClasses } from "@/features/semester/db";
import type { Application, ApplicationPrivate, SemesterMeta, Session, Team, TrainingClass } from "@/features/semester/types";
import { resolvedContact, type RosterContact } from "@/features/semester/rosterContact";
import { sundayTeamOf, type SundayTeamKey } from "@/features/portal/featureCatalog";
import { canAccessTeam, canBrowseTeam, canEditTeam, canReadSemesterPrivate, canReadTeamContacts, semesterTeamForKey } from "./teamModel";
import { semesterSummaryMeta } from "@/features/semester/termPhase";
import { praiseReturnHref } from "@/features/praise/navigation";
import { fetchTeamRosterContacts } from "./teamContacts";
import { TeamAccessState } from "./TeamAccessState";
import { SemesterEditProvider } from "@/features/semester/EditContext";
import AttendanceTab from "@/app/semester/[id]/AttendanceTab";
import CurriculumTab from "@/app/semester/[id]/CurriculumTab";
import ArchiveTab from "@/app/semester/[id]/ArchiveTab";
import { useLoadErrors } from "@/lib/useLoadErrors";
import { REQUIRED_WORKSPACE_SOURCES, WORKSPACE_SOURCE_LABELS } from "@/features/semester/workspaceSources";

export type TeamTermSection = "overview" | "roster" | "attendance" | "curriculum" | "records";

const SECTIONS: Array<{ key: TeamTermSection; label: string }> = [
  { key: "overview", label: "개요" },
  { key: "roster", label: "명단" },
  { key: "attendance", label: "출석" },
  { key: "curriculum", label: "커리큘럼" },
  { key: "records", label: "자료·기록" },
];

export default function TeamTermWorkspace({ teamKey, semesterId, section }: { teamKey: SundayTeamKey; semesterId: string; section: TeamTermSection }) {
  const { user, loading, roleError, roles, teamMemberships } = useAuth();
  const [attempt, setAttempt] = useState(0);
  return <TeamTermWorkspaceForUser key={`${loading}:${!!roleError}:${user?.uid ?? "anonymous"}:${roles.semester}:${roles.retreat}:${JSON.stringify(teamMemberships)}:${teamKey}:${semesterId}:${attempt}`} teamKey={teamKey} semesterId={semesterId} section={section} onRetry={() => setAttempt((value) => value + 1)} />;
}

function TeamTermWorkspaceForUser({ teamKey, semesterId, section, onRetry }: { teamKey: SundayTeamKey; semesterId: string; section: TeamTermSection; onRetry: () => void }) {
  const { user, loading, roleError, roles, teamMemberships } = useAuth();
  const allowed = canBrowseTeam(teamKey, roles, teamMemberships, semesterId);
  const contactAllowed = canReadTeamContacts(teamKey, roles, teamMemberships, semesterId);
  const privateAllowed = canReadSemesterPrivate(roles, teamMemberships);
  const query = useSearchParams();
  const praiseBack = teamKey === "praise" ? praiseReturnHref(new URLSearchParams(query.toString())) : null;
  const weeklyAllowed = canAccessTeam(teamKey, roles, teamMemberships, semesterId);
  const weeklyHref = `/teams/${teamKey}/ongoing?semester=${encodeURIComponent(semesterId)}`;
  const attendanceQuery = praiseBack ? new URLSearchParams(praiseBack.split("?")[1]) : new URLSearchParams();
  attendanceQuery.set("semester", semesterId);
  attendanceQuery.set("tab", "attendance");
  const praiseAttendanceHref = `/teams/praise/ongoing?${attendanceQuery}`;
  const [meta, setMeta] = useState<SemesterMeta | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [trainingClasses, setTrainingClasses] = useState<TrainingClass[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [applications, setApplications] = useState<Application[]>([]);
  const [applicationPrivates, setApplicationPrivates] = useState<Record<string, ApplicationPrivate>>({});
  const [rosterContacts, setRosterContacts] = useState<Record<string, RosterContact>>({});
  const [ready, setReady] = useState(new Set<string>());
  const { fail: recordFailure, ok, errors, message: error } = useLoadErrors(`${teamKey}:${semesterId}`);

  useEffect(() => {
    if (!user || loading || roleError || !allowed) return;
    const mark = (key: string, success = true) => { setReady((current) => new Set(current).add(key)); if (success) ok(WORKSPACE_SOURCE_LABELS[key]); };
    const fail = (key: string) => (reason: Error) => { recordFailure(WORKSPACE_SOURCE_LABELS[key])(reason); mark(key, false); };
    if (!privateAllowed) mark("private");
    if (!contactAllowed) mark("contacts");
    const controller = new AbortController();
    return (() => {
      const unsubs = [
        subscribeSemesterMeta(semesterId, (value) => { setMeta(value); mark("meta"); }, fail("meta")),
        subscribeTeams(semesterId, (value) => { setTeams(value); mark("teams"); }, fail("teams")),
        subscribeTrainingClasses(semesterId, (value) => { setTrainingClasses(value); mark("training"); }, fail("training")),
        subscribeSessions(semesterId, (value) => { setSessions(value); mark("sessions"); }, fail("sessions")),
        subscribeApplications(semesterId, (value) => { setApplications(value); mark("applications"); }, fail("applications")),
      ];
      if (contactAllowed) {
        let pending = false;
        const refresh = () => {
          if (pending) return;
          pending = true;
          void fetchTeamRosterContacts(user, semesterId, teamKey, controller.signal)
            .then((value) => { if (!controller.signal.aborted) { setRosterContacts(value); mark("contacts"); } })
            .catch((reason) => { if (!controller.signal.aborted) fail("contacts")(reason); })
            .finally(() => { pending = false; });
        };
        const onVisible = () => { if (document.visibilityState === "visible") refresh(); };
        refresh();
        window.addEventListener("focus", refresh);
        document.addEventListener("visibilitychange", onVisible);
        unsubs.push(() => {
          window.removeEventListener("focus", refresh);
          document.removeEventListener("visibilitychange", onVisible);
        });
      }
      if (privateAllowed) {
        unsubs.push(
          subscribeApplicationsPrivate(semesterId, (value) => { setApplicationPrivates(value); mark("private"); }, fail("private")),
        );
      }
      return () => { controller.abort(); unsubs.forEach((unsubscribe) => unsubscribe()); };
    })();
  }, [loading, roleError, allowed, contactAllowed, privateAllowed, roles, semesterId, teamKey, teamMemberships, user, ok, recordFailure]);

  const team = semesterTeamForKey(teams, teamKey);
  const teamById = useMemo(() => new Map(teams.map((item) => [item.id, item])), [teams]);
  const roster = useMemo(() => team ? applications.filter((item) => item.status !== "취소" && item.teamId === team.id) : [], [applications, team]);
  const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });
  const displayMeta = meta ? semesterSummaryMeta(meta, Object.fromEntries(sessions.map((session) => [session.id, session]))) : null;
  const past = !!displayMeta?.endDate && displayMeta.endDate < today;
  const broadEditor = roles.semester === "superAdmin" || roles.semester === "pastor";
  const editable = canEditTeam(teamKey, roles, teamMemberships, semesterId) && (!past || broadEditor);
  const loaded = ready.size === 7;
  const blocked = REQUIRED_WORKSPACE_SOURCES.some((key) => errors[WORKSPACE_SOURCE_LABELS[key]]);
  const teamMeta = sundayTeamOf(teamKey)!;

  return <TeamAccessState allowed={allowed}><main className="team-term-page">
    <header className="team-term-header">
      <div className="team-workspace-title"><Link href="/teams">팀</Link><span>/</span><Link href={`/teams/${teamKey}`}>{teamMeta.label}</Link><span>/</span><span>{semesterId}</span></div>
      <div className="team-term-heading"><div><h1>{teamMeta.label} · {meta?.title ?? semesterId}</h1><p>이 학기의 {teamMeta.label} 명단, 출석과 자료를 확인합니다.</p></div>{past && <span className="team-role-badge">지난 학기</span>}</div>
      {weeklyAllowed && <div className="team-context-note"><strong>{teamKey === "praise" ? "모임 출결은 주간 업무에서 입력하며 같은 학기 출석 원장에 저장됩니다." : "학기 기록과 주간·주일 업무를 같은 팀 공간에서 이어갑니다."}</strong><Link className="btn-secondary" href={praiseBack ?? weeklyHref}>{praiseBack ? "같은 모임 업무로 돌아가기" : "주간·주일 업무 열기"}</Link></div>}
      <nav className="team-term-tabs" aria-label={`${teamMeta.label} ${semesterId} 메뉴`}>{SECTIONS.map((item) => <Link key={item.key} href={item.key === "attendance" && teamKey === "praise" && weeklyAllowed ? praiseAttendanceHref : `/teams/${teamKey}/terms/${encodeURIComponent(semesterId)}/${item.key}`} aria-current={section === item.key ? "page" : undefined}>{item.label}</Link>)}</nav>
    </header>
    <section className="team-term-content">
      {error && <LoadFailureNotice title="일부 학기 정보를 불러오지 못했습니다." sources={Object.keys(errors)} onRetry={onRetry} />}
      {!loaded ? <WorkspaceSkeleton label="팀 학기 정보를 불러오는 중입니다." rows={7} variant="page" /> : blocked ? <div className="team-first-state">학기 명단과 회차를 확인한 뒤 기록을 열 수 있습니다. 다시 불러오기를 눌러 주세요.</div> : !team ? <div className="team-first-empty"><h2>이 학기에 연결된 팀이 없습니다</h2><p>운영센터의 학기 팀 설정에서 {teamMeta.label}을 이 학기에 연결해 주세요.</p></div> : <>
        {!editable && <ReadOnlyBanner what={`${teamMeta.label} ${semesterId} 기록`} why={past ? "지난 학기는 기본적으로 조회 전용입니다." : "조회 역할은 이 팀 기록을 수정할 수 없습니다."} />}
        <SemesterEditProvider canEdit={editable}>
          {section === "overview" && <TeamTermOverview team={team} roster={roster} sessions={sessions} />}
          {section === "roster" && <TeamRoster team={team} roster={roster} applicationPrivates={privateAllowed ? applicationPrivates : {}} rosterContacts={rosterContacts} showContacts={contactAllowed} />}
          {section === "attendance" && (teamKey === "praise" && weeklyAllowed ? <div className="team-first-empty"><h2>찬양팀 모임 출결</h2><p>조별 출결과 주일 준비를 같은 화면에서 이어갑니다. 기존 학기 출석 기록은 그대로 사용합니다.</p><Link className="btn-primary" href={praiseAttendanceHref}>이 학기 모임 출결 열기</Link></div> : <AttendanceTab sid={semesterId} meta={meta} teams={teams} trainingClasses={trainingClasses} sessions={sessions} applications={applications} teamById={teamById} lockedTeamId={team.id} />)}
          {section === "curriculum" && <CurriculumTab sid={semesterId} teams={teams} trainingClasses={trainingClasses} sessions={sessions} lockedTeamId={team.id} />}
          {section === "records" && <div><div className="team-context-note"><strong>학기 공용 자료</strong><span>{broadEditor ? "교역자와 통합관리자는 이 화면에서 공용 자료를 추가·삭제할 수 있습니다." : "팀 화면에서는 공용 자료를 조회만 합니다. 추가와 삭제는 운영센터에서 진행합니다."}</span></div><SemesterEditProvider canEdit={broadEditor}><ArchiveTab sid={semesterId} /></SemesterEditProvider></div>}
        </SemesterEditProvider>
      </>}
    </section>
  </main></TeamAccessState>;
}

function TeamTermOverview({ team, roster, sessions }: { team: Team; roster: Application[]; sessions: Session[] }) {
  const upcoming = sessions.find((session) => session.type !== "휴강" && session.date >= new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" }));
  return <div className="team-overview-grid"><section className="team-stat-card"><span>확정 명단</span><strong>{roster.length}명</strong><p>취소 신청을 제외한 현재 팀원</p></section><section className="team-stat-card"><span>학기 회차</span><strong>{sessions.length}회</strong><p>{upcoming ? `다음 모임 ${upcoming.date}` : "예정된 회차 없음"}</p></section><section className="team-goal-card"><span>이번 학기 목표</span><p>{team.goal?.trim() || "아직 입력된 목표가 없습니다."}</p></section></div>;
}

function TeamRoster({ team, roster, applicationPrivates, rosterContacts, showContacts }: { team: Team; roster: Application[]; applicationPrivates: Record<string, ApplicationPrivate>; rosterContacts: Record<string, RosterContact>; showContacts: boolean }) {
  const [query, setQuery] = useState("");
  const normalized = query.normalize("NFC").replace(/\s/g, "").toLocaleLowerCase();
  const filtered = roster.filter((person) => person.name.normalize("NFC").replace(/\s/g, "").toLocaleLowerCase().includes(normalized));
  return <section className="team-roster-panel"><header><div><h2>{team.name} 명단</h2><p>{showContacts ? "확정된 팀 배치와 연락처를 함께 확인합니다." : "확정된 팀 배치 결과를 표시합니다."}</p></div><span role="status">{filtered.length} / {roster.length}명</span></header><div className="team-roster-filters"><label>이름 검색<input className="input" type="search" placeholder="이름으로 검색" value={query} onChange={(event) => setQuery(event.target.value)} /></label></div>{filtered.length === 0 ? <div className="team-first-empty is-compact"><p>{query ? "검색 결과가 없습니다. 이름을 다시 확인해 주세요." : "배치된 팀원이 없습니다."}</p></div> : <div className="team-roster-list">{filtered.map((person) => {
    const contact = resolvedContact(applicationPrivates[person.id], rosterContacts[person.id]);
    return <div key={person.id} className="team-roster-person"><span><strong>{person.name}</strong><small>{person.bu === "스탭" ? "스탭" : `${person.bu} ${person.grade}학년 ${person.class}반`}</small></span>{showContacts && <span className="team-contact-list">{contact?.phone ? <a href={`tel:${contact.phone}`}>{contact.phone}</a> : <em>연락처 없음</em>}{contact?.parentPhone && <small>보호자 <a href={`tel:${contact.parentPhone}`}>{contact.parentPhone}</a></small>}</span>}</div>;
  })}</div>}</section>;
}
