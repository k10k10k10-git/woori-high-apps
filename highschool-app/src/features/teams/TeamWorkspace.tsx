"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowRight, CalendarBlank, ClockCounterClockwise } from "@phosphor-icons/react";
import { useAuth } from "@/context/AuthContext";
import { subscribeSemesters, subscribeTeams } from "@/features/semester/db";
import { featuredTerm, TERM_PHASE_LABEL } from "@/features/semester/termPhase";
import type { Semester, Team } from "@/features/semester/types";
import { sundayTeamOf, type SundayTeamKey } from "@/features/portal/featureCatalog";
import { activeTeamKeys, canAccessTeam, canBrowseEveryTeam, canBrowseTeam, membershipLabel, semesterTeamForKey } from "./teamModel";
import { TeamAccessState } from "./TeamAccessState";

type TermTeams = Record<string, Team[]>;

export default function TeamWorkspace({ teamKey }: { teamKey: SundayTeamKey }) {
  const { user, roles } = useAuth();
  return <TeamWorkspaceContent key={`${user?.uid ?? "guest"}:${roles.semester}:${roles.retreat}:${teamKey}`} teamKey={teamKey} />;
}

function TeamWorkspaceContent({ teamKey }: { teamKey: SundayTeamKey }) {
  const { roles, teamMemberships } = useAuth();
  const [semesters, setSemesters] = useState<Semester[]>([]);
  const [termTeams, setTermTeams] = useState<TermTeams>({});
  const [termLoaded, setTermLoaded] = useState<Record<string, boolean>>({});
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const allowed = canBrowseTeam(teamKey, roles, teamMemberships);
  const assigned = canAccessTeam(teamKey, roles, teamMemberships);
  const teamMeta = sundayTeamOf(teamKey)!;

  useEffect(() => {
    if (!allowed) return;
    return subscribeSemesters((items) => { setSemesters(items); setLoaded(true); setError(null); }, (reason) => { setError(reason.message); setLoaded(true); });
  }, [allowed]);

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
      }, (reason) => {
        setError(reason.message);
        setTermLoaded((current) => ({ ...current, [id]: true }));
      }));
      return () => unsubs.forEach((unsubscribe) => unsubscribe());
    })();
  }, [allowed, semesterIds]);

  const teamsReady = visibleSemesters.every((semester) => termLoaded[semester.id]);
  const connectedTerms = visibleSemesters.filter((semester) => semesterTeamForKey(termTeams[semester.id] ?? [], teamKey));
  const featured = featuredTerm(connectedTerms, new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" }));

  return <TeamAccessState allowed={allowed}><main className="team-first-page">
    <header className="team-workspace-header">
      <div className="team-workspace-title"><Link href="/teams">팀</Link><span>/</span><span>{teamMeta.label}</span></div>
      <div className="team-workspace-heading"><div><span className="team-directory-mark">{teamMeta.label.slice(0, 1)}</span><div><p className="section-kicker">TEAM WORKSPACE</p><h1>{teamMeta.label}</h1><p>{teamMeta.hint}</p></div></div><span className="team-role-badge">{membershipLabel(teamMemberships[teamKey])}</span></div>
    </header>

    {error && <div className="team-first-alert" role="alert">팀 정보를 불러오지 못했습니다: {error}</div>}
    {!loaded || (!teamsReady && !error) ? <div className="team-first-state" role="status">학기 연결을 확인하는 중입니다…</div> : error ? null : <>
      <section className="team-action-grid">
        {assigned ? <Link href={`/teams/${teamKey}/ongoing`} className="team-action-card is-primary"><div><span>상시 운영</span><h2>{teamMeta.status === "planned" ? "팀 업무 준비" : "이번 주 업무"}</h2><p>{teamMeta.hint}</p></div><ArrowRight size={18} aria-hidden="true" /></Link> : <div className="team-action-card is-muted"><div><span>상시 운영</span><h2>담당 팀 전용</h2><p>다른 팀의 주일 운영 기록은 담당 팀 계정만 엽니다.</p></div></div>}
        {featured ? <Link href={`/teams/${teamKey}/terms/${encodeURIComponent(featured.semester.id)}/overview`} className="team-action-card"><div><span>{TERM_PHASE_LABEL[featured.phase]}</span><h2>{featured.semester.meta.title}</h2><p>명단, 출석, 커리큘럼과 기록</p></div><ArrowRight size={18} aria-hidden="true" /></Link> : <div className="team-action-card is-muted"><div><span>학기 기록</span><h2>연결된 학기가 없습니다</h2><p>운영센터에서 이 팀을 학기에 연결해 주세요.</p></div></div>}
      </section>

      <section className="team-term-section">
        <div className="team-section-heading"><div><h2>학기</h2><p>이 팀의 확정 명단과 학기별 기록입니다.</p></div><ClockCounterClockwise size={20} aria-hidden="true" /></div>
        <div className="team-term-list">
          {connectedTerms.map((semester) => <Link key={semester.id} href={`/teams/${teamKey}/terms/${encodeURIComponent(semester.id)}/overview`} className="team-term-row"><CalendarBlank size={18} aria-hidden="true" /><span><strong>{semester.meta.title}</strong><small>{semester.meta.startDate && semester.meta.endDate ? `${semester.meta.startDate} — ${semester.meta.endDate}` : semester.id}</small></span><ArrowRight size={16} aria-hidden="true" /></Link>)}
          {connectedTerms.length === 0 && <div className="team-first-empty is-compact"><p>연결된 학기 기록이 없습니다.</p></div>}
        </div>
      </section>
    </>}
  </main></TeamAccessState>;
}
