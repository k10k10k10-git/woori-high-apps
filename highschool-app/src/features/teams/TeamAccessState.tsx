"use client";

import WorkspaceAccessGate from "@/components/WorkspaceAccessGate";

export function TeamAccessState({ allowed, children }: { allowed: boolean; children: React.ReactNode }) {
  return <WorkspaceAccessGate allowed={allowed} area="팀 업무" backHref="/teams" backLabel="팀 목록으로">{children}</WorkspaceAccessGate>;
}
