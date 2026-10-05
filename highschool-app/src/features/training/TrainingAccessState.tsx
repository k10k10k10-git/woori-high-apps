"use client";

import WorkspaceAccessGate from "@/components/WorkspaceAccessGate";

export default function TrainingAccessState({ allowed, children }: { allowed: boolean; children: React.ReactNode }) {
  return <WorkspaceAccessGate allowed={allowed} area="훈련 기록" backHref="/training" backLabel="훈련 목록으로">{children}</WorkspaceAccessGate>;
}
