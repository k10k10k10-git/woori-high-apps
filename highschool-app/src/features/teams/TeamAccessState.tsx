"use client";

import Link from "next/link";
import LoginButton from "@/components/LoginButton";
import { useAuth } from "@/context/AuthContext";

export function TeamAccessState({ allowed, children }: { allowed: boolean; children: React.ReactNode }) {
  const { user, loading, roleError, retryRoles, signIn } = useAuth();
  if (loading) return <main className="team-first-state" role="status">담당 팀을 확인하고 있습니다…</main>;
  if (!user) return <main className="team-first-state">
    <h1 className="page-title">팀 업무를 보려면 로그인해 주세요.</h1>
    <p>고등부에 등록한 Google 계정으로 로그인하면 연결된 팀을 확인할 수 있습니다.</p>
    <LoginButton signIn={signIn} />
    <Link className="btn-secondary" href="/library/help#access">로그인·담당 팀 안내</Link>
  </main>;
  if (roleError) return <main className="team-first-state" role="alert">
    <h1 className="page-title">담당 팀을 확인하지 못했습니다.</h1>
    <p>계정 정보를 불러오지 못해 팀 배정 여부를 아직 확인할 수 없습니다. 다시 시도해 주세요.</p>
    <button className="btn-primary" onClick={retryRoles}>다시 시도</button>
    <Link className="btn-secondary" href="/library/help#connection">접속 문제 도움말</Link>
  </main>;
  if (!allowed) return <main className="team-first-state">
    <h1 className="page-title">이 팀에 연결된 계정이 아닙니다.</h1>
    {user.email && <p>로그인한 계정: <strong>{user.email}</strong></p>}
    <p>고등부에 등록한 계정인지 확인해 주세요. 계정이 맞다면 교역자 또는 통합관리자에게 이 이메일과 담당 팀을 알려 연결을 요청해 주세요.</p>
    <Link className="btn-primary" href="/teams">내 팀 목록으로</Link>
    <Link className="btn-secondary" href="/library/help#access">계정 확인·담당자 문의 방법</Link>
  </main>;
  return children;
}
