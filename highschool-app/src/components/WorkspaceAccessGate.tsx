"use client";

import Link from "next/link";
import LoginButton from "./LoginButton";
import { useAuth } from "@/context/AuthContext";

/** 메뉴를 숨기지 않아도 보호된 하위 화면은 권한 확인 후에만 마운트한다. */
export default function WorkspaceAccessGate({ allowed, area, children, backHref = "/", backLabel = "홈으로", embedded = false }: {
  allowed: boolean;
  area: string;
  children: React.ReactNode;
  backHref?: string;
  backLabel?: string;
  embedded?: boolean;
}) {
  const { user, loading, roleError, retryRoles, signIn } = useAuth();
  const Heading = embedded ? "h2" : "h1";
  const Container = embedded ? "section" : "main";
  if (loading) return <Container className={`team-first-state workspace-access-state${embedded ? " is-embedded" : ""}`} role="status">{area} 권한을 확인하고 있습니다…</Container>;
  if (!user) return <Container className={`team-first-state workspace-access-state${embedded ? " is-embedded" : ""}`}>
    <Heading className="page-title">{area} 화면을 보려면 로그인해 주세요.</Heading>
    <p>고등부에 등록한 이메일 계정으로 로그인해 주세요.</p>
    <LoginButton signIn={signIn} />
    <Link className="btn-secondary" href="/library/help#access">로그인·권한 안내</Link>
  </Container>;
  if (roleError) return <Container className={`team-first-state workspace-access-state${embedded ? " is-embedded" : ""}`} role="alert">
    <Heading className="page-title">{area} 권한을 확인하지 못했습니다.</Heading>
    <p>계정 정보를 불러오지 못해 접근 가능 여부를 아직 확인할 수 없습니다. 다시 시도해 주세요.</p>
    <button type="button" className="btn-primary" onClick={retryRoles}>다시 시도</button>
    <Link className="btn-secondary" href="/library/help#connection">접속 문제 도움말</Link>
  </Container>;
  if (!allowed) return <Container className={`team-first-state workspace-access-state${embedded ? " is-embedded" : ""}`}>
    <Heading className="page-title">{area} 접근 권한이 필요합니다.</Heading>
    {user.email && <p>로그인한 계정: <strong>{user.email}</strong></p>}
    <p>메뉴는 모든 스탭에게 보이지만, 내용은 담당 역할에 따라 열립니다. 계정이 맞다면 교역자 또는 통합관리자에게 이 이메일과 필요한 업무를 알려 권한을 요청해 주세요.</p>
    <Link className="btn-primary" href={backHref}>{backLabel}</Link>
    <Link className="btn-secondary" href="/library/help#access">계정 확인·담당자 문의 방법</Link>
  </Container>;
  return children;
}
