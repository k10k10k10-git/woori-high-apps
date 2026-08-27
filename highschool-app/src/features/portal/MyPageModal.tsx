"use client";

import { useState } from "react";
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
import OverlayShell from "@/components/OverlayShell";

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
  const displayName = friendlyMinistryName(memberName || user?.displayName);

  return (
    <OverlayShell
      label="마이페이지"
      onClose={onClose}
      variant="fullscreen-mobile"
      panelClassName="admin-mypage-dialog flex max-h-[92dvh] w-full max-w-6xl flex-col overflow-hidden bg-slate-50 shadow-2xl"
    >
      <div
        className="flex min-h-0 flex-1 flex-col"
      >
        <header className="admin-mypage-header sticky top-0 z-20 border-b border-slate-200 bg-white/95 px-4 pt-4 backdrop-blur sm:px-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-xl font-bold text-slate-950">{displayName || "사용자"} 마이페이지</h2>
              <p className="mt-1 text-xs text-slate-500">{describeRoles(roles)} 역할의 일정, 배정과 요청 상태를 확인합니다.</p>
            </div>
            <button onClick={onClose} className="compact-icon-control shrink-0 rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200" aria-label="마이페이지 닫기"><X aria-hidden="true" size={18} weight="bold" /></button>
          </div>
          <div className="admin-mypage-tabs mt-4 flex gap-1" role="tablist" aria-label="마이페이지 메뉴">
            <TabButton selected={tab === "dashboard"} onClick={() => setTab("dashboard")}>대시보드</TabButton>
            <TabButton selected={tab === "ministry"} onClick={() => setTab("ministry")}>내 사역</TabButton>
            <TabButton selected={tab === "myRequests"} onClick={() => setTab("myRequests")}>내 요청</TabButton>
            {canManageTeam && <TabButton selected={tab === "team"} onClick={() => setTab("team")}>팀원 관리</TabButton>}
            {canManageRequests && <TabButton selected={tab === "requests"} onClick={() => setTab("requests")}>요청사항</TabButton>}
          </div>
        </header>

        <div role="tabpanel" className="admin-mypage-content min-h-0 flex-1 overflow-y-auto overscroll-contain p-3 sm:p-5">
          {tab === "dashboard" && (canManageRequests ? <AdminDashboard onNavigate={setTab} /> : <RoleDashboardPanel />)}
          {tab === "ministry" && <MyMinistryPanel />}
          {tab === "myRequests" && <MyRequestsPanel />}
          {tab === "team" && canManageTeam && <TeamModal embedded />}
          {tab === "requests" && canManageRequests && <SiteRequestsPanel />}
        </div>
      </div>
    </OverlayShell>
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
