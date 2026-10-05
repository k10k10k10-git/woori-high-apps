"use client";

import Link from "next/link";
import FieldHomeClient from "@/app/field/FieldHomeClient";
import RetreatsHome from "@/app/RetreatsHome";
import CenterSpinner from "@/components/CenterSpinner";
import { useAuth } from "@/context/AuthContext";
import { canAccessArea } from "@/features/portal/accessPolicy";

/**
 * 수련회 행정과 현장 운영이 같은 행사 목록에서 시작하도록 만드는 통합 진입점이다.
 * 행정 권한이 있으면 전체 운영 화면을, 현장 권한만 있으면 현장 화면을 연다.
 */
export default function EventsHome() {
  const { user, loading, roles, roleError, retryRoles } = useAuth();
  if (loading) return <CenterSpinner />;
  if (user && roleError) return <main className="team-first-state" role="alert">
    <h1 className="page-title">행사 이용 권한을 확인하지 못했습니다.</h1>
    <p>계정 정보를 불러오지 못해 승인 여부를 아직 확인할 수 없습니다. 다시 시도해 주세요.</p>
    <button className="btn-primary" onClick={retryRoles}>다시 시도</button>
    <Link className="btn-secondary" href="/library/help#connection">접속 문제 도움말</Link>
  </main>;
  return canAccessArea("retreat-admin", roles) ? <RetreatsHome /> : <FieldHomeClient />;
}
