"use client";

import Link from "next/link";
import { ArrowRight, UsersThree } from "@phosphor-icons/react";
import LoginButton from "@/components/LoginButton";
import { useAuth } from "@/context/AuthContext";
import { SUNDAY_MINISTRY_TEAMS } from "@/features/portal/featureCatalog";
import { accessibleTeamKeys, membershipLabel } from "./teamModel";
import { TeamAccessState } from "./TeamAccessState";
import { canAccessArea } from "@/features/portal/accessPolicy";

export default function TeamsHome() {
  const { user, loading, roles, teamMemberships, signIn, roleError } = useAuth();
  if (loading) return <main className="team-first-state" role="status">팀 목록을 불러오는 중입니다…</main>;
  if (!user) return <main className="team-first-state"><p>로그인이 필요합니다.</p><LoginButton signIn={signIn} /></main>;
  if (roleError) return <TeamAccessState allowed>{null}</TeamAccessState>;

  const keys = accessibleTeamKeys(roles, teamMemberships);
  const hasApprovedRole = canAccessArea("home", roles);

  return <main className="team-first-page">
    <header className="team-first-page-header">
      <div><h1>사역팀</h1><p>팀을 선택해 학기 명단과 출석, 주일 업무를 이어가세요.</p></div>
      <span className="team-first-count">{SUNDAY_MINISTRY_TEAMS.length}개 팀</span>
    </header>
    {keys.length === 0 && <section className="team-first-empty is-compact"><UsersThree size={24} aria-hidden="true" /><h2>{hasApprovedRole ? "담당 팀 연결이 필요합니다" : "접근 승인이 필요합니다"}</h2><p>{hasApprovedRole ? "사용할 수 있는 역할은 확인됐지만 이 계정에 담당 팀이 연결되지 않았습니다." : "로그인은 완료됐지만 사용할 역할과 담당 팀이 아직 연결되지 않았습니다."}</p><p>교역자 또는 통합관리자에게 로그인 이메일과 담당 팀 이름을 알려 주세요. 담당자가 운영센터의 계정·권한에서 확인할 수 있습니다.</p><Link className="btn-secondary" href="/library/help#access">승인·팀 연결 방법 보기</Link><Link className="btn-secondary" href="/help/feedback">연결 문제 문의하기</Link></section>}
      <section className="team-directory-grid" aria-label="전체 팀 목록">
        {SUNDAY_MINISTRY_TEAMS.map((team) => <Link key={team.key} href={`/teams/${team.key}`} prefetch={keys.includes(team.key) ? undefined : false} className="team-directory-card">
          <div className="team-directory-card__top"><span className="team-directory-mark">{team.label.slice(0, 1)}</span><span className={`team-directory-status${team.status === "planned" ? " is-planned" : ""}`}>{team.status === "planned" ? "기획 중" : "운영 중"}</span></div>
          <div><h2>{team.label}</h2><p>{team.status === "planned" ? "상시 운영 화면은 준비 중입니다. 연결된 학기의 명단과 기록은 팀 안에서 확인할 수 있습니다." : team.hint}</p></div>
          <footer><span>{keys.includes(team.key) ? membershipLabel(teamMemberships[team.key]) : "권한 필요"}</span><ArrowRight size={16} aria-hidden="true" /></footer>
        </Link>)}
      </section>
  </main>;
}
