"use client";

import TeamModal from "@/features/portal/TeamModal";
import { useAuth } from "@/context/AuthContext";
import { canManageRolesOf } from "@/features/portal/accessPolicy";
import OperationsGate from "./OperationsGate";

export default function AccountsPage() {
  const { roles } = useAuth();
  return <OperationsGate allowed={canManageRolesOf(roles)}><main className="team-first-page"><header className="team-first-page-header"><div><h1>계정·권한</h1><p>기본 권한과 담당 사역팀을 한눈에 확인하고 배정합니다.</p></div></header><TeamModal embedded /></main></OperationsGate>;
}
