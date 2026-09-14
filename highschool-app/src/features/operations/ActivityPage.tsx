"use client";

import ActivityLogPanel from "@/features/portal/ActivityLogPanel";
import { useAuth } from "@/context/AuthContext";
import { canViewActivityLogs } from "@/features/portal/accessPolicy";
import OperationsGate from "./OperationsGate";

export default function ActivityPage() {
  const { roles } = useAuth();
  return <OperationsGate allowed={canViewActivityLogs(roles)}><main className="team-first-page"><header className="team-first-page-header"><div><p className="section-kicker">ACTIVITY</p><h1>활동 로그</h1><p>운영 데이터의 변경 주체, 대상과 세부 내용을 확인합니다.</p></div></header><ActivityLogPanel /></main></OperationsGate>;
}
