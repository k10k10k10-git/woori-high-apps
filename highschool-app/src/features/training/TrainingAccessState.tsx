"use client";

import Link from "next/link";
import LoginButton from "@/components/LoginButton";
import { useAuth } from "@/context/AuthContext";

export default function TrainingAccessState({ allowed, children }: { allowed: boolean; children: React.ReactNode }) {
  const { user, loading, signIn } = useAuth();
  if (loading) return <main className="team-first-state" role="status">훈련 권한을 확인하고 있습니다…</main>;
  if (!user) return <main className="team-first-state"><p>로그인이 필요합니다.</p><LoginButton signIn={signIn} /></main>;
  if (!allowed) return <main className="team-first-state"><strong>훈련 기록을 볼 수 없는 계정입니다.</strong><p>운영센터 담당자에게 학기 역할을 요청해 주세요.</p><Link className="btn-secondary" href="/">홈으로</Link></main>;
  return children;
}
