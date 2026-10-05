"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowRight, CalendarBlank, ClockCounterClockwise } from "@phosphor-icons/react";
import { useAuth } from "@/context/AuthContext";
import { subscribeApplications, subscribeSemesters, subscribeSessions, subscribeTeams } from "@/features/semester/db";
import { featuredTerm, TERM_PHASE_LABEL, type TermPhase } from "@/features/semester/termPhase";
import type { Application, Semester, Session, Team } from "@/features/semester/types";
import { semesterRoster, splitStudentsAndStaff } from "@/features/semester/roster";
import { sessionDateLabel } from "@/features/semester/sessionDate";
import { sessionDisplayLabel } from "@/features/semester/sessionKind";
import { sundayTeamOf, type SundayTeamKey } from "@/features/portal/featureCatalog";
import { activeTeamKeys, canAccessTeam, canBrowseEveryTeam, canBrowseTeam, canEditTeam, membershipLabel, semesterTeamForKey } from "./teamModel";
import { TeamAccessState } from "./TeamAccessState";
import { useLoadErrors } from "@/lib/useLoadErrors";
import { FirstVisitGuide } from "./FirstVisitGuide";
import styles from "./TeamWorkspace.module.css";

type TermTeams = Record<string, Team[]>;
const WEEKLY_TASKS: Record<SundayTeamKey, string> = {
  admin: "학생 주일 출석부 확인·행정 변동 사항 기록",
  barnabas: "새친구 접수·등록 현황 확인·처리 대기 건 관리",
  worship: "주일 자리 배치·예배 담당표·예배 자료 준비",
  praise: "이번 모임 학생 출결·주일 스탭 참석·조편성·등단표 입력",
  media: "상시 운영 화면은 준비 중입니다. 학기 명단과 기록을 먼저 확인하세요.",
  design: "상시 운영 화면은 준비 중입니다. 학기 명단과 기록을 먼저 확인하세요.",
};

export default function TeamWorkspace({ teamKey }: { teamKey: SundayTeamKey }) {
  const { user, roles, teamMemberships } = useAuth();
  const [attempt, setAttempt] = useState(0);
  return <TeamWorkspaceContent key={`${user?.uid ?? "guest"}:${roles.semester}:${roles.retreat}:${JSON.stringify(teamMemberships)}:${teamKey}:${attempt}`} teamKey={teamKey} onRetry={() => setAttempt((value) => value + 1)} />;
}

function TeamWorkspaceContent({ teamKey, onRetry }: { teamKey: SundayTeamKey; onRetry: () => void }) {
  const { user, roles, teamMemberships } = useAuth();
  const [semesters, setSemesters] = useState<Semester[]>([]);
  const [termTeams, setTermTeams] = useState<TermTeams>({});
  const [termLoaded, setTermLoaded] = useState<Record<string, boolean>>({});
  const [loaded, setLoaded] = useState(false);
  const { fail, ok, message: error } = useLoadErrors(teamKey);
  const allowed = canBrowseTeam(teamKey, roles, teamMemberships);
  const assigned = canAccessTeam(teamKey, roles, teamMemberships);
  const teamMeta = sundayTeamOf(teamKey)!;

  useEffect(() => {
    if (!allowed) return;
    return subscribeSemesters((items) => { setSemesters(items); setLoaded(true); ok("학기 목록"); }, (reason) => { fail("학기 목록")(reason); setLoaded(true); });
  }, [allowed, fail, ok]);

  const visibleSemesters = useMemo(() => canBrowseEveryTeam(roles)
    ? semesters
    : semesters.filter((semester) => activeTeamKeys(teamMemberships, semester.id).includes(teamKey)),
  [roles, semesters, teamKey, teamMemberships]);
  const semesterIds = useMemo(() => visibleSemesters.map((semester) => semester.id).join("\u0000"), [visibleSemesters]);
  useEffect(() => {
    if (!allowed || !semesterIds) return;
    const ids = semesterIds.split("\u0000");
    return (() => {
      const unsubs = ids.map((id) => subscribeTeams(id, (teams) => {
        setTermTeams((current) => ({ ...current, [id]: teams }));
        setTermLoaded((current) => ({ ...current, [id]: true }));
        ok(`${id} 팀 연결`);
      }, (reason) => {
        fail(`${id} 팀 연결`)(reason);
        setTermLoaded((current) => ({ ...current, [id]: true }));
      }));
      return () => unsubs.forEach((unsubscribe) => unsubscribe());
    })();
  }, [allowed, semesterIds, fail, ok]);

  const teamsReady = visibleSemesters.every((semester) => termLoaded[semester.id]);
  const connectedTerms = visibleSemesters.filter((semester) => semesterTeamForKey(termTeams[semester.id] ?? [], teamKey));
  const featured = featuredTerm(connectedTerms, new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" }));
  const featuredTeam = featured ? semesterTeamForKey(termTeams[featured.semester.id] ?? [], teamKey) : null;
  const termHref = featured ? `/teams/${teamKey}/terms/${encodeURIComponent(featured.semester.id)}/overview` : undefined;
  const weeklyHref = `/teams/${teamKey}/ongoing${featured && teamKey === "praise" ? `?semester=${encodeURIComponent(featured.semester.id)}` : ""}`;
  const roleLabel = teamMemberships[teamKey] ? membershipLabel(teamMemberships[teamKey]) : assigned ? "전체 운영" : "학기 기록 조회";
  const viewOnly = !canEditTeam(teamKey, roles, teamMemberships, featured?.semester.id);
  const planned = teamMeta.status === "planned";
  const periodLabel = featured ? TERM_PHASE_LABEL[featured.phase] : "학기";
  const weeklyTitle = teamKey !== "praise" ? "주간·주일 업무" : featured?.phase === "past" ? "지난 학기 주간·주일 기록" : featured?.phase === "upcoming" ? "예정 학기 업무 준비" : featured?.phase === "current" ? "이번 주 업무" : "주간·주일 업무";
  const weeklyDescription = teamKey !== "praise" ? WEEKLY_TASKS[teamKey] : featured?.phase === "past" ? `지난 학기의 ${teamMeta.hint} 기록을 확인합니다.` : featured?.phase === "upcoming" ? `예정 학기의 ${teamMeta.hint} 준비와 기록을 확인합니다.` : featured?.phase === "unscheduled" ? `운영 기간이 미등록된 학기의 ${teamMeta.hint} 업무입니다. 학기와 모임 날짜를 먼저 확인하세요.` : WEEKLY_TASKS[teamKey];
  const weeklyPurpose = viewOnly ? `${teamKey === "praise" && featured ? `${periodLabel}의 ` : ""}${teamMeta.hint} 기록을 조회합니다. 변경은 담당 팀장에게 문의해 주세요.` : weeklyDescription;

  return <TeamAccessState allowed={allowed}><main className="team-first-page">
    <header className="team-workspace-header">
      <div className="team-workspace-title"><Link href="/teams">팀</Link><span>/</span><span>{teamMeta.label}</span></div>
      <div className="team-workspace-heading"><div><span className="team-directory-mark">{teamMeta.label.slice(0, 1)}</span><div><h1>{teamMeta.label}</h1><p>팀 전체 현황을 살펴보고 주간 업무와 학기 기록을 이어갑니다.</p></div></div><span className="team-role-badge">{roleLabel}</span></div>
      <nav className={styles.quickLinks} aria-label="팀 화면 바로가기"><a className={styles.overviewLink} href="#team-first-guide">처음이라면 사용 안내로 이동</a><a className={styles.overviewLink} href="#team-work-actions">업무 바로가기</a></nav>
      {viewOnly && <p className={styles.permissionNote}>조회 권한으로 이용 중입니다. 기록 변경이 필요하면 담당 팀장에게 알려 주세요.</p>}
    </header>

    {error && <div className="team-first-alert" role="alert">팀 정보를 확인하지 못했습니다. 다시 불러오거나 접속 문제 도움말을 확인해 주세요.<button className="btn-secondary" onClick={onRetry}>다시 불러오기</button><Link className="btn-secondary" href="/library/help#connection">접속 문제 도움말</Link></div>}
    <section className={styles.overview} aria-label="팀 전체 현황">
      <div className={styles.overviewHeader}><div><h2>팀 전체 현황</h2><p>{featured ? featured.semester.meta.title : "이 팀에 연결된 학기를 확인합니다."}</p></div><span className="team-role-badge">{teamMeta.status === "planned" ? "상시 업무 준비 중" : "상시 업무 운영 중"}</span></div>
      {featured && featuredTeam ? <TeamOverview key={`${featured.semester.id}:${featuredTeam.id}`} semester={featured.semester} team={featuredTeam} phase={featured.phase} teamKey={teamKey} onRetry={onRetry} /> : <div className={styles.overviewState}>{error ? "학기 현황을 확인하지 못했습니다. 다시 불러오기를 눌러 주세요." : !loaded || !teamsReady ? "팀 현황을 확인하는 중입니다…" : "연결된 학기가 없습니다. 담당자에게 학기 연결을 요청해 주세요."}</div>}
    </section>
    {user && <FirstVisitGuide key={`${user.uid}:${teamKey}`} userId={user.uid} teamKey={teamKey} teamLabel={teamMeta.label} roleLabel={roleLabel} steps={[
      { title: "팀 전체 현황 확인", description: "위에서 학생·스탭 수와 모임 일정, 팀 목표를 확인하세요." },
      { title: planned ? "상시 업무 준비 상태 확인" : weeklyTitle, description: planned ? "상시 운영 화면은 준비 중입니다. 학기 명단·기록부터 확인하세요." : !assigned ? "다른 팀의 학기 명단과 기록을 조회할 수 있습니다. 주간·주일 입력은 담당 팀에서 이용하세요." : weeklyPurpose, ...(assigned && !planned ? { href: weeklyHref, action: `${weeklyTitle} 열기` } : !featured ? { href: "/help/feedback", action: "팀 기능 문의하기" } : {}) },
      { title: "명단·연락처·기록 확인", description: "명단에서 팀원·연락처를 찾고, 학기 안에서 누적 출석과 진행 내용을 확인하세요.", ...(featured ? { href: `/teams/${teamKey}/terms/${encodeURIComponent(featured.semester.id)}/roster`, action: "학기 명단·연락처 보기" } : {}) },
    ]} />}
      <section id="team-work-actions" className="team-action-grid" aria-label="주간 업무와 학기 기록">
        {planned ? featured ? <Link href={`/teams/${teamKey}/terms/${encodeURIComponent(featured.semester.id)}/roster`} className="team-action-card is-primary"><div><span>{periodLabel}</span><h2>학기 명단·기록 열기</h2><p>{featured.semester.meta.title} · 팀원·연락처를 확인하고 출석·커리큘럼·자료로 이동합니다.</p></div><ArrowRight size={18} aria-hidden="true" /></Link> : <div className="team-action-card is-muted"><div><span>상시 업무 준비 중</span><h2>{error ? "학기 연결 확인 필요" : !loaded || !teamsReady ? "학기 연결을 확인하는 중입니다…" : "연결된 학기가 없습니다"}</h2><p>주간·주일 운영 화면은 준비 중입니다. 담당자에게 학기 연결과 필요한 팀 업무를 알려 주세요.</p><Link href="/help/feedback" className={styles.overviewLink}>팀 기능 문의하기</Link></div></div> : assigned ? <Link href={weeklyHref} className="team-action-card is-primary"><div><span>{viewOnly ? "주간·주일 조회" : "주간·주일 업무"}</span><h2>{weeklyTitle}</h2><p>{weeklyPurpose}</p></div><ArrowRight size={18} aria-hidden="true" /></Link> : <div className="team-action-card is-muted"><div><span>주간·주일 업무</span><h2>담당 팀 전용</h2><p>다른 팀의 주일 운영 기록은 담당 팀 계정만 엽니다.</p></div></div>}
        {planned ? featured && <div className="team-action-card is-muted"><div><span>기능 준비 안내</span><h2>주간·주일 운영 준비 중</h2><p>상시 운영 화면은 아직 준비 중입니다. 현재 사용할 수 있는 업무는 학기 명단·기록에서 이어가세요.</p><Link href="/help/feedback" className={styles.overviewLink}>필요한 팀 기능 문의하기</Link></div></div> : featured ? <Link href={termHref!} className="team-action-card"><div><span>{periodLabel}</span><h2>{featured.semester.meta.title}</h2><p>팀원 명단·연락처, 누적 출석, 커리큘럼과 자료 확인</p></div><ArrowRight size={18} aria-hidden="true" /></Link> : <div className="team-action-card is-muted"><div><span>학기 기록</span><h2>{error ? "학기 연결 확인 필요" : !loaded || !teamsReady ? "학기 연결을 확인하는 중입니다…" : "연결된 학기가 없습니다"}</h2><p>{error ? "다시 불러오기를 눌러 주세요. 주간·주일 업무는 계속 열 수 있습니다." : "운영센터에서 이 팀을 학기에 연결해 주세요."}</p></div></div>}
      </section>
    {!loaded || (!teamsReady && !error) ? <div className="team-first-state" role="status">학기 연결을 확인하는 중입니다…</div> : <>
      <section className="team-term-section">
        <div className="team-section-heading"><div><h2>학기</h2><p>이 팀의 확정 명단과 학기별 기록입니다.</p></div><ClockCounterClockwise size={20} aria-hidden="true" /></div>
        <div className="team-term-list">
          {connectedTerms.map((semester) => <Link key={semester.id} href={`/teams/${teamKey}/terms/${encodeURIComponent(semester.id)}/overview`} className="team-term-row"><CalendarBlank size={18} aria-hidden="true" /><span><strong>{semester.meta.title}</strong><small>{semester.meta.startDate && semester.meta.endDate ? `${semester.meta.startDate} — ${semester.meta.endDate}` : semester.id}</small></span><ArrowRight size={16} aria-hidden="true" /></Link>)}
          {connectedTerms.length === 0 && !error && <div className="team-first-empty is-compact"><p>연결된 학기 기록이 없습니다.</p></div>}
        </div>
      </section>
    </>}
  </main></TeamAccessState>;
}

/** 대표 학기 한 개의 공개 명단·회차만 읽는다. 다른 학기의 명단·연락처·출결 원장은 추가로 읽지 않는다. */
function TeamOverview({ semester, team, phase, teamKey, onRetry }: {
  semester: Semester; team: Team; phase: TermPhase; teamKey: SundayTeamKey; onRetry: () => void;
}) {
  const [applications, setApplications] = useState<Application[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [ready, setReady] = useState({ roster: false, sessions: false });
  const { fail, ok, errors } = useLoadErrors(`${semester.id}:${team.id}`);
  useEffect(() => {
    let active = true;
    const subscriptions = [
      subscribeApplications(semester.id, (items) => { if (active) { setApplications(items); setReady((value) => ({ ...value, roster: true })); ok("팀 명단"); } }, (reason) => { if (active) fail("팀 명단")(reason); }),
      subscribeSessions(semester.id, (items) => { if (active) { setSessions(items); setReady((value) => ({ ...value, sessions: true })); ok("다음 모임"); } }, (reason) => { if (active) fail("다음 모임")(reason); }),
    ];
    return () => { active = false; subscriptions.forEach((unsubscribe) => unsubscribe()); };
  }, [semester.id, fail, ok]);
  const roster = splitStudentsAndStaff(semesterRoster(applications, "team").filter((person) => person.teamId === team.id));
  const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });
  const upcoming = sessions.filter((session) => session.type !== "휴강" && (session.endDate ?? session.date) >= today).sort((a, b) => a.date.localeCompare(b.date))[0];
  const pastSessions = sessions.filter((session) => session.type !== "휴강").sort((a, b) => b.date.localeCompare(a.date));
  const rosterState = errors["팀 명단"] ? "확인 필요" : !ready.roster ? "불러오는 중…" : null;
  const nextState = errors["다음 모임"] ? "확인 필요" : !ready.sessions ? "불러오는 중…" : null;
  const termBase = `/teams/${teamKey}/terms/${encodeURIComponent(semester.id)}`;
  return <>
    <dl className={styles.stats}>
      <div className={styles.stat}><dt>학기 팀원 · 학생</dt><dd>{rosterState ?? `${roster.students.length}명`}<span>취소·훈련 전용 신청 제외</span></dd></div>
      <div className={styles.stat}><dt>학기 팀원 · 교사·스탭</dt><dd>{rosterState ?? `${roster.staff.length}명`}<span>학기 팀에 배치된 운영 인력</span></dd></div>
      <div className={styles.stat}><dt>{phase === "past" ? "지난 학기 모임 · 휴강 제외" : phase === "upcoming" ? "예정 학기 다음 모임 · 휴강 제외" : "다음 모임 · 휴강 제외"}</dt><dd>{nextState ?? (phase === "past" ? `${pastSessions.length}회` : upcoming ? sessionDateLabel(upcoming) : "예정된 모임 없음")}<span>{!nextState && phase === "past" ? pastSessions[0] ? `마지막 모임 ${sessionDateLabel(pastSessions[0])}` : "기록된 모임이 없습니다." : upcoming && !nextState ? sessionDisplayLabel(upcoming) : "학기에 등록된 모임 일정"}</span></dd></div>
    </dl>
    {(errors["팀 명단"] || errors["다음 모임"]) && <div className="team-first-alert" role="alert">팀 현황 일부를 확인하지 못했습니다. 실제 인원이 없는 상태와 다릅니다.<button type="button" className="btn-secondary" onClick={onRetry}>현황 다시 불러오기</button></div>}
    <dl className={styles.overviewContext}><div><dt>운영 기간</dt><dd>{semester.meta.startDate && semester.meta.endDate ? `${semester.meta.startDate} — ${semester.meta.endDate}` : "운영 기간 미등록"}</dd></div><div><dt>모임 장소</dt><dd>{team.room?.trim() || "장소 미등록"}</dd></div><div><dt>팀 목표</dt><dd>{team.goal?.trim() || "아직 입력된 목표가 없습니다."}</dd></div></dl>
    <Link className={styles.overviewLink} href={`${termBase}/roster`}>이 학기 명단·연락처 확인</Link>
  </>;
}
