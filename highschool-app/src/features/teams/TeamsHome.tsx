"use client";

import Link from "next/link";
import { ArrowRight, UsersThree } from "@phosphor-icons/react";
import LoginButton from "@/components/LoginButton";
import { useAuth } from "@/context/AuthContext";
import { SUNDAY_MINISTRY_TEAMS } from "@/features/portal/featureCatalog";
import { accessibleTeamKeys, membershipLabel } from "./teamModel";

export default function TeamsHome() {
  const { user, loading, roles, teamMemberships, signIn } = useAuth();
  if (loading) return <main className="team-first-state" role="status">팀 목록을 불러오는 중입니다…</main>;
  if (!user) return <main className="team-first-state"><p>로그인이 필요합니다.</p><LoginButton signIn={signIn} /></main>;

  const keys = accessibleTeamKeys(roles, teamMemberships);
  const teams = SUNDAY_MINISTRY_TEAMS.filter((team) => keys.includes(team.key));

  return <main className="team-first-page">
    <header className="team-first-page-header">
      <div><p className="section-kicker">TEAMS</p><h1>팀</h1><p>학기가 바뀌어도 같은 팀 공간에서 명단, 출석, 자료와 주간 업무를 이어갑니다.</p></div>
      <span className="team-first-count">{teams.length}개 팀</span>
    </header>
    {teams.length === 0 ? <section className="team-first-empty"><UsersThree size={24} aria-hidden="true" /><h2>담당 팀 연결이 필요합니다</h2><p>계정 승인은 완료됐지만 담당 팀이 지정되지 않았습니다. 통합관리자가 운영센터의 계정·권한에서 연결할 수 있습니다.</p></section> :
      <section className="team-directory-grid" aria-label="접근 가능한 팀">
        {teams.map((team) => <Link key={team.key} href={`/teams/${team.key}`} className="team-directory-card">
          <div className="team-directory-card__top"><span className="team-directory-mark">{team.label.slice(0, 1)}</span><span className={`team-directory-status${team.status === "planned" ? " is-planned" : ""}`}>{team.status === "planned" ? "공통 공간" : "운영 중"}</span></div>
          <div><h2>{team.label}</h2><p>{team.hint}</p></div>
          <footer><span>{membershipLabel(teamMemberships[team.key])}</span><ArrowRight size={16} aria-hidden="true" /></footer>
        </Link>)}
      </section>}
  </main>;
}
