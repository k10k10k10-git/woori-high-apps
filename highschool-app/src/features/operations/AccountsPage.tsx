"use client";

import TeamModal from "@/features/portal/TeamModal";
import { useAuth } from "@/context/AuthContext";
import { canManageRolesOf } from "@/features/portal/accessPolicy";
import OperationsGate from "./OperationsGate";

export default function AccountsPage() {
  const { roles } = useAuth();
  return <OperationsGate allowed={canManageRolesOf(roles)}><main className="team-first-page"><header className="team-first-page-header"><div><p className="section-kicker">ACCOUNTS</p><h1>계정·권한</h1><p>사이트 권한과 담당 팀, 팀 내 역할을 각각 지정합니다.</p></div></header><TeamModal embedded /></main></OperationsGate>;
}
