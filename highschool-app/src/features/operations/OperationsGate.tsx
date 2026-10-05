"use client";

import WorkspaceAccessGate from "@/components/WorkspaceAccessGate";

export default function OperationsGate({ allowed, children }: { allowed: boolean; children: React.ReactNode }) {
  return <WorkspaceAccessGate allowed={allowed} area="운영센터" backHref="/operations" backLabel="운영센터 메뉴로">{children}</WorkspaceAccessGate>;
}
