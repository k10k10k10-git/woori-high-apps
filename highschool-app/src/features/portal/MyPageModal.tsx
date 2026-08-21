"use client";

import { useEffect, useRef, useState } from "react";
import { X } from "@phosphor-icons/react";
import { useAuth } from "@/context/AuthContext";
import AdminDashboard from "./AdminDashboardPanel";
import TeamModal from "./TeamModal";
import SiteRequestsPanel from "./SiteRequestsPanel";
import RoleDashboardPanel from "./RoleDashboardPanel";
import MyMinistryPanel from "./MyMinistryPanel";
import MyRequestsPanel from "./MyRequestsPanel";
import { canManageRolesOf, canManageSiteRequests, describeRoles } from "./accessPolicy";
import { friendlyMinistryName } from "./dailyMinistryMessage";

export type MyPageTab = "dashboard" | "ministry" | "myRequests" | "team" | "requests";

export default function MyPageModal({ onClose, initialTab = "dashboard" }: { onClose: () => void; initialTab?: MyPageTab }) {
  const { user, roles, memberName } = useAuth();
  const canManageTeam = canManageRolesOf(roles);
  const canManageRequests = canManageSiteRequests(roles);
  const [tab, setTab] = useState<MyPageTab>(() => {
    if (initialTab === "team" && !canManageTeam) return "dashboard";
    if (initialTab === "requests" && !canManageRequests) return "dashboard";
    return initialTab;
  });
  const dialogRef = useRef<HTMLDivElement>(null);
  const displayName = friendlyMinistryName(memberName || user?.displayName);

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
        aria-label="마이페이지"
        tabIndex={-1}
        className="admin-mypage-dialog max-h-[92vh] w-full max-w-6xl overflow-y-auto bg-slate-50 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="admin-mypage-header sticky top-0 z-20 border-b border-slate-200 bg-white/95 px-4 pt-4 backdrop-blur sm:px-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-xl font-bold text-slate-950">{displayName || "사용자"} 마이페이지</h2>
              <p className="mt-1 text-xs text-slate-500">{describeRoles(roles)} 역할의 일정, 배정과 요청 상태를 확인합니다.</p>
            </div>
            <button onClick={onClose} className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200" aria-label="마이페이지 닫기"><X size={18} weight="bold" /></button>
          </div>
          <div className="admin-mypage-tabs mt-4 flex gap-1" role="tablist" aria-label="마이페이지 메뉴">
            <TabButton selected={tab === "dashboard"} onClick={() => setTab("dashboard")}>대시보드</TabButton>
            <TabButton selected={tab === "ministry"} onClick={() => setTab("ministry")}>내 사역</TabButton>
            <TabButton selected={tab === "myRequests"} onClick={() => setTab("myRequests")}>내 요청</TabButton>
            {canManageTeam && <TabButton selected={tab === "team"} onClick={() => setTab("team")}>팀원 관리</TabButton>}
            {canManageRequests && <TabButton selected={tab === "requests"} onClick={() => setTab("requests")}>요청사항</TabButton>}
          </div>
        </header>

        <div role="tabpanel" className="admin-mypage-content p-3 sm:p-5">
          {tab === "dashboard" && (canManageRequests ? <AdminDashboard onNavigate={setTab} /> : <RoleDashboardPanel />)}
          {tab === "ministry" && <MyMinistryPanel />}
          {tab === "myRequests" && <MyRequestsPanel />}
          {tab === "team" && canManageTeam && <TeamModal embedded />}
          {tab === "requests" && canManageRequests && <SiteRequestsPanel />}
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
