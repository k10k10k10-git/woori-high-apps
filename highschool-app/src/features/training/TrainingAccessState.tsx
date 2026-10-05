"use client";

import Link from "next/link";
import LoginButton from "@/components/LoginButton";
import { useAuth } from "@/context/AuthContext";

export default function TrainingAccessState({ allowed, children }: { allowed: boolean; children: React.ReactNode }) {
  const { user, loading, roleError, retryRoles, signIn } = useAuth();
  if (loading) return <main className="team-first-state" role="status">훈련 권한을 확인하고 있습니다…</main>;
  if (!user) return <main className="team-first-state">
    <h1 className="page-title">훈련 기록을 보려면 로그인해 주세요.</h1>
    <p>고등부에 등록한 Google 계정으로 로그인해 주세요.</p>
    <LoginButton signIn={signIn} />
    <Link className="btn-secondary" href="/library/help#access">로그인·권한 안내</Link>
  </main>;
  if (roleError) return <main className="team-first-state" role="alert">
    <h1 className="page-title">훈련 권한을 확인하지 못했습니다.</h1>
    <p>계정 정보를 불러오지 못해 승인 여부를 아직 확인할 수 없습니다. 다시 시도해 주세요.</p>
    <button className="btn-primary" onClick={retryRoles}>다시 시도</button>
    <Link className="btn-secondary" href="/library/help#connection">접속 문제 도움말</Link>
  </main>;
  if (!allowed) return <main className="team-first-state">
    <h1 className="page-title">훈련 기록을 볼 수 없는 계정입니다.</h1>
    {user.email && <p>로그인한 계정: <strong>{user.email}</strong></p>}
    <p>고등부에 등록한 계정인지 확인해 주세요. 계정이 맞다면 교역자 또는 통합관리자에게 이 이메일과 맡은 훈련반을 알려 권한을 요청해 주세요.</p>
    <Link className="btn-primary" href="/">홈으로</Link>
    <Link className="btn-secondary" href="/library/help#access">계정 확인·담당자 문의 방법</Link>
  </main>;
  return children;
}
