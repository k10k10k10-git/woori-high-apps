"use client";

import { ArrowLeft, ClipboardText, ShieldCheck, UsersThree } from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import type { Retreat } from "@/lib/types";

type Props = {
  retreat: Retreat;
  fieldAllowed: boolean;
  onNavigate?: (href: string) => void;
};

export default function ProgramWorkspaceHeader({ retreat, fieldAllowed, onNavigate }: Props) {
  const router = useRouter();
  const navigate = onNavigate ?? ((href: string) => router.push(href));
  const items = [
    { label: "행정", icon: UsersThree, href: `/retreat/${encodeURIComponent(retreat.id)}` },
    { label: "프로그램 준비", icon: ClipboardText, href: `/retreat/${encodeURIComponent(retreat.id)}/programs`, current: true },
    ...(fieldAllowed ? [{ label: "이가드", icon: ShieldCheck, href: `/retreat/${encodeURIComponent(retreat.id)}/field` }] : []),
  ];

  return (
    <header className="workspace-sticky-header workspace-header program-workspace-header">
      <div className="mx-auto max-w-6xl px-3 sm:px-4">
        <div className="program-workspace-title-row">
          <button type="button" onClick={() => navigate("/programs")} className="program-header-back" aria-label="프로그램 준비 수련회 목록으로">
            <ArrowLeft aria-hidden="true" size={16} weight="bold" />
            <span>목록</span>
          </button>
          <span className="program-year-badge">{retreat.year}년</span>
          <h1>{retreat.name}</h1>
        </div>
        <nav className="program-area-nav" aria-label="수련회 업무 영역">
          {items.map((item) => {
            const Icon = item.icon;
            return (
              <button key={item.label} type="button" aria-current={item.current ? "page" : undefined} onClick={() => navigate(item.href)}>
                <Icon aria-hidden="true" size={17} weight={item.current ? "fill" : "regular"} />
                {item.label}
              </button>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
