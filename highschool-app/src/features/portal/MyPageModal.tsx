"use client";

import { useEffect, useRef, useState } from "react";
import TeamModal from "./TeamModal";
import SiteRequestsPanel from "./SiteRequestsPanel";

type Tab = "team" | "requests";

export default function MyPageModal({ onClose, initialTab = "team" }: { onClose: () => void; initialTab?: Tab }) {
  const [tab, setTab] = useState<Tab>(initialTab);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus();
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusable = [...dialogRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      )].filter((element) => !element.hasAttribute("hidden"));
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      previousFocus?.focus();
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/60 p-3 backdrop-blur-sm" onClick={onClose}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="통합관리자 마이페이지"
        tabIndex={-1}
        className="max-h-[92vh] w-full max-w-6xl overflow-y-auto rounded-2xl bg-slate-50 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 px-4 pt-4 backdrop-blur sm:px-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-bold tracking-[0.14em] text-emerald-600">ADMIN MY PAGE</p>
              <h2 className="mt-1 text-xl font-bold text-slate-950">통합관리자 마이페이지</h2>
              <p className="mt-1 text-xs text-slate-500">팀원 권한과 사이트 요청사항을 한곳에서 관리합니다.</p>
            </div>
            <button onClick={onClose} className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-slate-100 text-xl text-slate-500 hover:bg-slate-200" aria-label="마이페이지 닫기">×</button>
          </div>
          <div className="mt-4 flex gap-1" role="tablist" aria-label="마이페이지 메뉴">
            <TabButton selected={tab === "team"} onClick={() => setTab("team")}>팀원 관리</TabButton>
            <TabButton selected={tab === "requests"} onClick={() => setTab("requests")}>요청사항</TabButton>
          </div>
        </header>

        <div role="tabpanel" className="p-3 sm:p-5">
          {tab === "team" ? <TeamModal embedded /> : <SiteRequestsPanel />}
        </div>
      </div>
    </div>
  );
}

function TabButton({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={selected}
      onClick={onClick}
      className={`border-b-2 px-4 py-3 text-sm font-bold ${selected ? "border-emerald-600 text-emerald-700" : "border-transparent text-slate-500 hover:text-slate-800"}`}
    >
      {children}
    </button>
  );
}
