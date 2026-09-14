"use client";

import SiteRequestsPanel from "@/features/portal/SiteRequestsPanel";
import { useAuth } from "@/context/AuthContext";
import { canManageSiteRequests } from "@/features/portal/accessPolicy";
import OperationsGate from "./OperationsGate";

export default function RequestsPage() {
  const { roles } = useAuth();
  return <OperationsGate allowed={canManageSiteRequests(roles)}><main className="team-first-page"><header className="team-first-page-header"><div><p className="section-kicker">REQUESTS</p><h1>요청 관리</h1><p>사용자가 보낸 문제 제보를 확인하고 처리 결과를 남깁니다.</p></div></header><SiteRequestsPanel /></main></OperationsGate>;
}
