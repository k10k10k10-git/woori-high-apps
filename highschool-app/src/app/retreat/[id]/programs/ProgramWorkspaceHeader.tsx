"use client";

import { ArrowLeft } from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import RetreatAreaNav from "@/features/portal/RetreatAreaNav";
import type { Retreat } from "@/lib/types";

type Props = {
  retreat: Retreat;
  fieldAllowed: boolean;
  onNavigate?: (href: string) => void;
  /** 2단 탭 — 행정·이가드와 같이 sticky 헤더 안에서 흰 띠로 붙는다. */
  children?: React.ReactNode;
};

export default function ProgramWorkspaceHeader({ retreat, fieldAllowed, onNavigate, children }: Props) {
  const router = useRouter();
  const navigate = onNavigate ?? ((href: string) => router.push(href));
  return (
    <header className="workspace-sticky-header workspace-header program-workspace-header">
      <div className="mx-auto max-w-6xl px-3 sm:px-4">
        <div className="program-workspace-title-row">
          <button type="button" onClick={() => navigate("/events")} className="program-header-back" aria-label="행사 목록으로">
            <ArrowLeft aria-hidden="true" size={16} weight="bold" />
            <span>목록</span>
          </button>
          <span className="program-year-badge">{retreat.year}년</span>
          <h1>{retreat.name}</h1>
          <RetreatAreaNav retreatId={retreat.id} current="programs" adminAllowed fieldAllowed={fieldAllowed} onNavigate={navigate} />
        </div>
      </div>
      {children}
    </header>
  );
}
