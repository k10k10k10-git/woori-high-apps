"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowRight } from "@phosphor-icons/react";
import { useAuth } from "@/context/AuthContext";
import { subscribeApplications, subscribeSemesters, subscribeSessions, subscribeTeams } from "@/features/semester/db";
import { featuredTerm, TERM_PHASE_LABEL, type TermPhase } from "@/features/semester/termPhase";
import type { Application, Semester, Session, Team } from "@/features/semester/types";
import { semesterRoster, splitStudentsAndStaff } from "@/features/semester/roster";
import { sessionDateLabel } from "@/features/semester/sessionDate";
import { sessionDisplayLabel } from "@/features/semester/sessionKind";
import { canManageAnnualFinance } from "@/features/portal/accessPolicy";
import { sundayTeamOf, type SundayTeamKey } from "@/features/portal/featureCatalog";
import { activeTeamKeys, canAccessTeam, canBrowseEveryTeam, canBrowseTeam, canEditTeam, membershipLabel, semesterTeamForKey } from "./teamModel";
import { TeamAccessState } from "./TeamAccessState";
import { useLoadErrors } from "@/lib/useLoadErrors";
import styles from "./TeamWorkspace.module.css";

type TermTeams = Record<string, Team[]>;
const TERM_ACTIONS = [
  { section: "roster", label: "명단·연락처", description: "선택한 학기의 팀원과 연락처 확인" },
  { section: "attendance", label: "출석", description: "회차별 팀 출석 기록 확인" },
  { section: "curriculum", label: "커리큘럼", description: "선택한 학기의 진행 내용 확인" },
  { section: "records", label: "자료·기록", description: "팀에서 사용하는 학기 공용 자료 확인" },
] as const;
const WEEKLY_TASKS: Record<SundayTeamKey, string> = {
  admin: "학생 출석 현황·행정 변동 사항 확인·연간 수입·지출과 정산",
  barnabas: "새친구 접수·등록 현황 확인·처리 대기 건 관리",
  worship: "주일 자리 배치·예배 담당표·예배 자료 준비",
  praise: "이번 모임 학생 출결·주일 스탭 참석·조편성·등단표 입력",
  media: "상시 운영 화면은 준비 중입니다. 학기 명단과 기록을 먼저 확인하세요.",
  design: "상시 운영 화면은 준비 중입니다. 학기 명단과 기록을 먼저 확인하세요.",
};

export default function TeamWorkspace({ teamKey }: { teamKey: SundayTeamKey }) {
  const { user, loading, roleError, roles, teamMemberships } = useAuth();
  const scope = `${loading}:${!!roleError}:${user?.uid ?? "guest"}:${roles.semester}:${roles.retreat}:${JSON.stringify(teamMemberships)}:${teamKey}`;
  return <TeamWorkspaceForScope key={scope} teamKey={teamKey} />;
}

function TeamWorkspaceForScope({ teamKey }: { teamKey: SundayTeamKey }) {
  const [attempt, setAttempt] = useState(0);
  const [pickedSemesterId, setPickedSemesterId] = useState("");
  // 연결 재시도는 선택을 유지하고, 계정·권한·팀이 바뀌면 위 scope가 선택도 폐기한다.
  return <TeamWorkspaceContent key={attempt} teamKey={teamKey} pickedSemesterId={pickedSemesterId} onSelectSemester={setPickedSemesterId} onRetry={() => setAttempt((value) => value + 1)} />;
}

function TeamWorkspaceContent({ teamKey, pickedSemesterId, onSelectSemester, onRetry }: { teamKey: SundayTeamKey; pickedSemesterId: string; onSelectSemester: (id: string) => void; onRetry: () => void }) {
  const { user, loading, roleError, roles, teamMemberships } = useAuth();
  const uid = user?.uid;
  const [semesters, setSemesters] = useState<Semester[]>([]);
  const [termTeams, setTermTeams] = useState<TermTeams>({});
  const [termLoaded, setTermLoaded] = useState<Record<string, boolean>>({});
  const [loaded, setLoaded] = useState(false);
  const { fail, ok, message: error } = useLoadErrors(teamKey);
  const allowed = canBrowseTeam(teamKey, roles, teamMemberships);
  const assigned = canAccessTeam(teamKey, roles, teamMemberships);
  const teamMeta = sundayTeamOf(teamKey)!;

  useEffect(() => {
    if (!uid || loading || roleError || !allowed) return;
    let active = true;
    const unsubscribe = subscribeSemesters((items) => { if (!active) return; setSemesters(items); setLoaded(true); ok("학기 목록"); }, (reason) => { if (!active) return; fail("학기 목록")(reason); setLoaded(true); });
    return () => { active = false; unsubscribe(); };
  }, [uid, loading, roleError, allowed, fail, ok]);

  const visibleSemesters = useMemo(() => canBrowseEveryTeam(roles)
    ? semesters
    : semesters.filter((semester) => activeTeamKeys(teamMemberships, semester.id).includes(teamKey)),
  [roles, semesters, teamKey, teamMemberships]);
  const semesterIds = useMemo(() => visibleSemesters.map((semester) => semester.id).join("\u0000"), [visibleSemesters]);
  useEffect(() => {
    if (!uid || loading || roleError || !allowed || !semesterIds) return;
    const ids = semesterIds.split("\u0000");
    let active = true;
    return (() => {
      const unsubs = ids.map((id) => subscribeTeams(id, (teams) => {
        if (!active) return;
        setTermTeams((current) => ({ ...current, [id]: teams }));
        setTermLoaded((current) => ({ ...current, [id]: true }));
        ok(`${id} 팀 연결`);
      }, (reason) => {
        if (!active) return;
        fail(`${id} 팀 연결`)(reason);
        setTermLoaded((current) => ({ ...current, [id]: true }));
      }));
      return () => { active = false; unsubs.forEach((unsubscribe) => unsubscribe()); };
    })();
  }, [uid, loading, roleError, allowed, semesterIds, fail, ok]);

  const teamsReady = visibleSemesters.every((semester) => termLoaded[semester.id]);
  const connectedTerms = visibleSemesters.filter((semester) => semesterTeamForKey(termTeams[semester.id] ?? [], teamKey));
  const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });
  const pickedSemester = connectedTerms.find((semester) => semester.id === pickedSemesterId);
  const pickedMissing = loaded && teamsReady && !error && !!pickedSemesterId && !pickedSemester;
  useEffect(() => {
    if (pickedMissing) onSelectSemester("");
  }, [pickedMissing, onSelectSemester]);
  const selectedTerm = teamsReady ? featuredTerm(pickedSemester ? [pickedSemester] : connectedTerms, today) : null;
  const selectedTeam = selectedTerm ? semesterTeamForKey(termTeams[selectedTerm.semester.id] ?? [], teamKey) : null;
  const termBase = selectedTerm ? `/teams/${teamKey}/terms/${encodeURIComponent(selectedTerm.semester.id)}` : undefined;
  const weeklySemesterId = teamKey === "praise" ? selectedTerm?.semester.id : undefined;
  const weeklyAllowed = canAccessTeam(teamKey, roles, teamMemberships, weeklySemesterId);
  const weeklyViewOnly = !(teamKey === "admin" && canManageAnnualFinance(roles)) && !canEditTeam(teamKey, roles, teamMemberships, weeklySemesterId);
  const weeklyHref = `/teams/${teamKey}/ongoing${selectedTerm && teamKey === "praise" ? `?semester=${encodeURIComponent(selectedTerm.semester.id)}` : ""}`;
  const attendanceHref = teamKey === "praise" && weeklyAllowed && selectedTerm ? `${weeklyHref}&tab=attendance` : `${termBase}/attendance`;
  const roleLabel = teamMemberships[teamKey] ? membershipLabel(teamMemberships[teamKey]) : assigned ? "전체 운영" : "학기 기록 조회";
  const viewOnly = !canEditTeam(teamKey, roles, teamMemberships, selectedTerm?.semester.id);
  const planned = teamMeta.status === "planned";
  const periodLabel = selectedTerm ? TERM_PHASE_LABEL[selectedTerm.phase] : "학기";
  const weeklyTitle = teamKey === "admin" ? "행정 업무" : teamKey !== "praise" ? "주간·주일 업무" : selectedTerm?.phase === "past" ? "지난 학기 주간·주일 기록" : selectedTerm?.phase === "upcoming" ? "예정 학기 업무 준비" : selectedTerm?.phase === "current" ? "이번 주 업무" : "주간·주일 업무";
  const weeklyDescription = teamKey !== "praise" ? WEEKLY_TASKS[teamKey] : selectedTerm?.phase === "past" ? `지난 학기의 ${teamMeta.hint} 기록을 확인합니다.` : selectedTerm?.phase === "upcoming" ? `예정 학기의 ${teamMeta.hint} 준비와 기록을 확인합니다.` : selectedTerm?.phase === "unscheduled" ? `운영 기간이 미등록된 학기의 ${teamMeta.hint} 업무입니다. 학기와 모임 날짜를 먼저 확인하세요.` : WEEKLY_TASKS[teamKey];
  const weeklyPurpose = weeklyViewOnly ? `${teamKey === "praise" && selectedTerm ? `${periodLabel}의 ` : ""}${teamMeta.hint} 기록을 조회합니다.` : weeklyDescription;

  return <TeamAccessState allowed={allowed}><main className="team-first-page">
    <header className="team-workspace-header">
      <div className="team-workspace-title"><Link href="/teams">팀</Link><span>/</span><span>{teamMeta.label}</span></div>
      <div className="team-workspace-heading"><div><span className="team-directory-mark">{teamMeta.label.slice(0, 1)}</span><div><h1>{teamMeta.label}</h1></div></div><span className="team-role-badge">{roleLabel}</span></div>
      {viewOnly && <p className={styles.permissionNote}>선택한 학기 기록은 조회 권한으로 이용 중입니다. 기록 변경이 필요하면 담당 팀장에게 알려 주세요.</p>}
    </header>

    {error && <div className="team-first-alert" role="alert">팀 정보를 확인하지 못했습니다. 다시 불러오거나 접속 문제 도움말을 확인해 주세요.<button className="btn-secondary" onClick={onRetry}>다시 불러오기</button><Link className="btn-secondary" href="/library/help#connection">접속 문제 도움말</Link></div>}
    <div className={styles.overviewHeader}>
        <label className={styles.termPicker}><span>운영 학기</span><select className="input" value={selectedTerm?.semester.id ?? ""} disabled={!loaded || !teamsReady || connectedTerms.length === 0} onChange={(event) => onSelectSemester(event.target.value)}>
          {!selectedTerm && <option value="">{error ? "학기 연결 확인 필요" : !loaded || !teamsReady ? "학기를 확인하는 중…" : "연결된 학기 없음"}</option>}
          {connectedTerms.map((semester) => <option key={semester.id} value={semester.id}>{semester.meta.title} · {TERM_PHASE_LABEL[featuredTerm([semester], today)!.phase]}</option>)}
        </select></label>
    </div>
    <section id="team-work-actions" className={styles.workActions} aria-label="주간 업무와 학기 기록">
      {!planned && (weeklyAllowed ? <Link href={weeklyHref} className={`team-action-card is-primary ${styles.weeklyWork}`}><div><span>{weeklyViewOnly ? "주간·주일 조회" : "주간·주일 업무"}</span><h2>{weeklyTitle}</h2><p>{weeklyPurpose}</p></div><ArrowRight size={18} aria-hidden="true" /></Link> : <div className={`team-action-card ${styles.weeklyWork}`}><div><span>주간·주일 업무</span><h2>담당 팀 전용</h2><p>다른 팀의 주일 운영 기록은 담당 팀 계정만 엽니다.</p></div></div>)}
      <nav className={styles.termLinks} aria-label="선택 학기 업무">{TERM_ACTIONS.map((item) => {
        const content = <><div><h2>{item.label}</h2>{selectedTerm && <p>{item.description}</p>}</div>{selectedTerm && <ArrowRight size={18} aria-hidden="true" />}</>;
        return selectedTerm ? <Link key={item.section} href={item.section === "attendance" ? attendanceHref : `${termBase}/${item.section}`} className={styles.termLink} aria-label={`선택 학기 ${item.label} 열기`}>{content}</Link> : <div key={item.section} className={styles.termLink} aria-disabled="true">{content}<span>{error ? "학기 확인 필요" : !loaded || !teamsReady ? "학기 확인 중" : "학기 연결 필요"}</span></div>;
      })}</nav>
      {planned && <div className={`team-action-card ${styles.weeklyWork}`}><div><span>상시 업무 준비 중</span><h2>주간·주일 운영 준비 중</h2><p>주간·주일 운영 화면은 준비 중입니다. 현재 사용할 수 있는 업무는 위 학기 명단·기록에서 이어가세요.</p><Link href="/help/feedback" className={styles.overviewLink}>팀 기능 문의하기</Link></div></div>}
    </section>
    <section className={styles.overview} aria-label="팀 전체 현황">
      <div className={styles.overviewHeader}><div><h2>팀 전체 현황</h2><p>{selectedTerm ? `${periodLabel} · ${selectedTerm.semester.meta.title}` : "이 팀에 연결된 학기를 확인합니다."}</p></div></div>
      {selectedTerm && selectedTeam ? <TeamOverview key={`${selectedTerm.semester.id}:${selectedTeam.id}`} semester={selectedTerm.semester} team={selectedTeam} phase={selectedTerm.phase} onRetry={onRetry} /> : <div className={styles.overviewState} role={!error && (!loaded || !teamsReady) ? "status" : undefined}>{error ? "학기 현황을 확인하지 못했습니다. 다시 불러오기를 눌러 주세요." : !loaded || !teamsReady ? "학기 연결을 확인하는 중입니다…" : "연결된 학기가 없습니다. 담당자에게 학기 연결을 요청해 주세요."}</div>}
    </section>
  </main></TeamAccessState>;
}

/** 선택 학기 한 개의 공개 명단·회차만 읽는다. 다른 학기의 명단·연락처·출결 원장은 추가로 읽지 않는다. */
function TeamOverview({ semester, team, phase, onRetry }: {
  semester: Semester; team: Team; phase: TermPhase; onRetry: () => void;
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
  return <>
    <dl className={styles.stats}>
      <div className={styles.stat}><dt>학기 팀원 · 학생</dt><dd>{rosterState ?? `${roster.students.length}명`}<span>취소·훈련 전용 신청 제외</span></dd></div>
      <div className={styles.stat}><dt>학기 팀원 · 교사·스탭</dt><dd>{rosterState ?? `${roster.staff.length}명`}<span>학기 팀에 배치된 운영 인력</span></dd></div>
      <div className={styles.stat}><dt>{phase === "past" ? "지난 학기 모임 · 휴강 제외" : phase === "upcoming" ? "예정 학기 다음 모임 · 휴강 제외" : "다음 모임 · 휴강 제외"}</dt><dd>{nextState ?? (phase === "past" ? `${pastSessions.length}회` : upcoming ? sessionDateLabel(upcoming) : "예정된 모임 없음")}<span>{!nextState && phase === "past" ? pastSessions[0] ? `마지막 모임 ${sessionDateLabel(pastSessions[0])}` : "기록된 모임이 없습니다." : upcoming && !nextState ? sessionDisplayLabel(upcoming) : "학기에 등록된 모임 일정"}</span></dd></div>
    </dl>
    {(errors["팀 명단"] || errors["다음 모임"]) && <div className="team-first-alert" role="alert">팀 현황 일부를 확인하지 못했습니다. 실제 인원이 없는 상태와 다릅니다.<button type="button" className="btn-secondary" onClick={onRetry}>현황 다시 불러오기</button></div>}
    <dl className={styles.overviewContext}><div><dt>운영 기간</dt><dd>{semester.meta.startDate && semester.meta.endDate ? `${semester.meta.startDate} — ${semester.meta.endDate}` : "운영 기간 미등록"}</dd></div><div><dt>모임 장소</dt><dd>{team.room?.trim() || "장소 미등록"}</dd></div><div><dt>팀 목표</dt><dd>{team.goal?.trim() || "아직 입력된 목표가 없습니다."}</dd></div></dl>
  </>;
}
