"use client";

import Link from "next/link";
import LoginButton from "@/components/LoginButton";
import { useAuth } from "@/context/AuthContext";

export function TeamAccessState({ allowed, children }: { allowed: boolean; children: React.ReactNode }) {
  const { user, loading, signIn } = useAuth();
  if (loading) return <main className="team-first-state" role="status">담당 팀을 확인하고 있습니다…</main>;
  if (!user) return <main className="team-first-state"><p>로그인이 필요합니다.</p><LoginButton signIn={signIn} /></main>;
  if (!allowed) return <main className="team-first-state"><strong>이 팀에 연결된 계정이 아닙니다.</strong><p>운영센터 담당자에게 담당 팀 연결을 요청해 주세요.</p><Link className="btn-secondary" href="/teams">내 팀 목록으로</Link></main>;
  return children;
}
