"use client";

import Link from "next/link";
import LoginButton from "@/components/LoginButton";
import { useAuth } from "@/context/AuthContext";

export default function OperationsGate({ allowed, children }: { allowed: boolean; children: React.ReactNode }) {
  const { user, loading, signIn } = useAuth();
  if (loading) return <main className="team-first-state" role="status">운영 권한을 확인하고 있습니다…</main>;
  if (!user) return <main className="team-first-state"><p>로그인이 필요합니다.</p><LoginButton signIn={signIn} /></main>;
  if (!allowed) return <main className="team-first-state"><strong>운영센터 접근 권한이 없습니다.</strong><p>담당 팀 업무는 팀 화면에서 확인해 주세요.</p><Link href="/teams" className="btn-secondary">팀으로 이동</Link></main>;
  return children;
}
