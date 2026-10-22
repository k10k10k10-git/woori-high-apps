"use client";

import { ArrowLeft } from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import RetreatAreaNav from "@/features/portal/RetreatAreaNav";
import type { Retreat } from "@/lib/types";

type Props = {
  retreat: Retreat;
  fieldAllowed: boolean;
  onNavigate?: (href: string) => void;
};

export default function ProgramWorkspaceHeader({ retreat, fieldAllowed, onNavigate }: Props) {
  const router = useRouter();
  const navigate = onNavigate ?? ((href: string) => router.push(href));
  return (
    <header className="workspace-sticky-header workspace-header program-workspace-header">
      <div className="mx-auto max-w-6xl px-3 sm:px-4">
        <div className="program-workspace-title-row">
          <button type="button" onClick={() => navigate(`/events?retreat=${encodeURIComponent(retreat.id)}`)} className="program-header-back" aria-label="이 수련회 업무 선택으로">
            <ArrowLeft aria-hidden="true" size={16} weight="bold" />
            <span>수련회</span>
          </button>
          <span className="program-year-badge">{retreat.year}년</span>
          <h1>{retreat.name}</h1>
          <RetreatAreaNav retreatId={retreat.id} current="programs" adminAllowed fieldAllowed={fieldAllowed} onNavigate={navigate} />
        </div>
      </div>
    </header>
  );
}
