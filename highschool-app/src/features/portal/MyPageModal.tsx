"use client";

import Link from "next/link";
import { lazy, Suspense, useEffect, useId, useRef, useState, type KeyboardEvent, type MouseEvent } from "react";
import { CaretRight, ChartBar, ChatCircleText, ClockCounterClockwise, EnvelopeSimple, SquaresFour, UsersThree, X } from "@phosphor-icons/react";
import { useAuth } from "@/context/AuthContext";
import { useIsDesktop } from "@/lib/useIsDesktop";
import WorkspaceAccessGate from "@/components/WorkspaceAccessGate";
import OverlayShell from "@/components/OverlayShell";
import { canManageRolesOf, canManageSiteRequests, canViewActivityLogs } from "./accessPolicy";
import { describeTeamRoles } from "@/features/teams/teamModel";
import { friendlyMinistryName } from "./dailyMinistryMessage";

const AdminDashboard = lazy(() => import("./AdminDashboardPanel"));
const RoleDashboardPanel = lazy(() => import("./RoleDashboardPanel"));
const MyMinistryPanel = lazy(() => import("./MyMinistryPanel"));
const MyRequestsPanel = lazy(() => import("./MyRequestsPanel"));

export type MyPageTab = "dashboard" | "ministry" | "myRequests" | "team" | "requests" | "activity";
type Props = { onClose: () => void; initialTab?: MyPageTab };

const PERSONAL_TABS = [
  { id: "dashboard", label: "대시보드", icon: ChartBar },
  { id: "ministry", label: "내 사역", icon: SquaresFour },
  { id: "myRequests", label: "내 요청", icon: ChatCircleText },
] as const;

function OperationsShortcut({ title, description, href }: { title: string; description: string; href: string }) {
  return <section className="team-first-state workspace-access-state is-embedded">
    <h2 className="page-title">{title}</h2>
    <p>{description} 이 업무는 운영센터에서 이어서 진행합니다.</p>
    <Link className="btn-primary" href={href} prefetch={false}>운영센터에서 {title} 열기<CaretRight size={16} aria-hidden="true" /></Link>
  </section>;
}

export default function MyPageModal(props: Props) {
  const { user, roles } = useAuth();
  // 계정이나 권한 변경 즉시 개인 데이터와 관리 화면의 상태를 모두 폐기한다.
  return <MyPageWorkspace key={`${user?.uid ?? "anonymous"}:${roles.semester}:${roles.retreat}`} {...props} />;
}

function MyPageWorkspace({ onClose, initialTab = "dashboard" }: Props) {
  const { user, roles, memberName, teamMemberships } = useAuth();
  const canManageTeam = canManageRolesOf(roles);
  const canManageRequests = canManageSiteRequests(roles);
  const canViewActivity = canViewActivityLogs(roles);
  const tabs = [
    ...PERSONAL_TABS,
    { id: "team" as const, label: "팀원 관리", icon: UsersThree },
    { id: "requests" as const, label: "요청사항", icon: EnvelopeSimple },
    { id: "activity" as const, label: "활동 로그", icon: ClockCounterClockwise },
  ];
  const allowedTab = (id: MyPageTab) => id === "team" ? canManageTeam : id === "requests" ? canManageRequests : id === "activity" ? canViewActivity : true;
  const [requestedTab, setTab] = useState<MyPageTab>(initialTab);
  const tab = tabs.find((item) => item.id === requestedTab) ?? tabs[0];
  const displayName = friendlyMinistryName(memberName || user?.displayName) || "사용자";
  const id = useId();
  const desktop = useIsDesktop();
  const tabRefs = useRef<Partial<Record<MyPageTab, HTMLButtonElement | null>>>({});

  useEffect(() => {
    if (!desktop) tabRefs.current[tab.id]?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
  }, [desktop, tab.id]);

  function moveTab(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let next: number;
    if (event.key === "Home") next = 0;
    else if (event.key === "End") next = tabs.length - 1;
    else if (event.key === "ArrowDown" || event.key === "ArrowRight") next = (index + 1) % tabs.length;
    else if (event.key === "ArrowUp" || event.key === "ArrowLeft") next = (index - 1 + tabs.length) % tabs.length;
    else return;
    event.preventDefault();
    setTab(tabs[next].id);
    tabRefs.current[tabs[next].id]?.focus();
  }

  function followShortcut(event: MouseEvent<HTMLDivElement>) {
    if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || event.defaultPrevented) return;
    const link = (event.target as Element).closest<HTMLAnchorElement>("a[href]");
    if (!link || link.hasAttribute("download") || (link.target && link.target !== "_self")) return;
    if (new URL(link.href, window.location.href).origin === window.location.origin) onClose();
  }

  return (
    <OverlayShell label="마이페이지" onClose={onClose} variant="fullscreen-mobile" panelClassName="admin-mypage-dialog mypage-workspace">
      <aside className="mypage-workspace-sidebar" aria-label="마이페이지 탐색">
        <div className="mypage-workspace-brand">
          <span className="mypage-workspace-mark"><SquaresFour size={19} weight="fill" aria-hidden="true" /></span>
          <span><strong>서현고등부</strong><small>마이페이지</small></span>
        </div>
        <div className="mypage-workspace-nav" role="tablist" aria-label="마이페이지 메뉴" aria-orientation={desktop ? "vertical" : "horizontal"}>
          {tabs.map((item, index) => (
            <div key={item.id} role="presentation" className={index === 3 ? "mypage-workspace-admin-start" : undefined}>
              {index === 0 && <span className="mypage-workspace-group" aria-hidden="true">나의 워크스페이스</span>}
              {index === 3 && <span className="mypage-workspace-group" aria-hidden="true">운영 관리</span>}
              <button
                ref={(element) => { tabRefs.current[item.id] = element; }}
                type="button"
                role="tab"
                id={`${id}-tab-${item.id}`}
                aria-controls={`${id}-panel`}
                aria-selected={tab.id === item.id}
                tabIndex={tab.id === item.id ? 0 : -1}
                onClick={() => setTab(item.id)}
                onKeyDown={(event) => moveTab(event, index)}
                className="mypage-workspace-nav-item"
              >
                <item.icon size={18} weight={tab.id === item.id ? "fill" : "regular"} aria-hidden="true" />
                <span>{item.label}{!allowedTab(item.id) && <small> · 권한 필요</small>}</span>
              </button>
            </div>
          ))}
        </div>
        <div className="mypage-workspace-account">
          <span className="mypage-workspace-avatar" aria-hidden="true">{Array.from(displayName)[0]}</span>
          <div><strong title={displayName}>{displayName}</strong><small title={describeTeamRoles(roles, teamMemberships)}>{describeTeamRoles(roles, teamMemberships)}</small></div>
        </div>
      </aside>
      <div className="mypage-workspace-main">
        <header className="mypage-workspace-topbar">
          <div className="mypage-workspace-breadcrumb"><span>마이페이지</span><CaretRight size={12} aria-hidden="true" /><h2>{tab.label}</h2></div>
          <button type="button" onClick={onClose} className="mypage-workspace-close" aria-label="마이페이지 닫기"><span>닫기</span><X size={18} aria-hidden="true" /></button>
        </header>
        <div key={tab.id} id={`${id}-panel`} role="tabpanel" aria-labelledby={`${id}-tab-${tab.id}`} tabIndex={0} className="mypage-workspace-content" onClickCapture={followShortcut}>
          <WorkspaceAccessGate allowed area={tab.label} embedded><Suspense fallback={<div role="status" className="mypage-workspace-loading">{tab.label}을 불러오고 있습니다…</div>}>
            {tab.id === "dashboard" && (canManageRequests ? <AdminDashboard onNavigate={setTab} /> : <RoleDashboardPanel />)}
            {tab.id === "ministry" && <MyMinistryPanel />}
            {tab.id === "myRequests" && <MyRequestsPanel />}
            {tab.id === "team" && <WorkspaceAccessGate allowed={canManageTeam} area="팀원 관리" embedded><OperationsShortcut title="계정·권한" description="팀원의 사이트 권한과 담당 팀을 관리합니다." href="/operations/accounts" /></WorkspaceAccessGate>}
            {tab.id === "requests" && <WorkspaceAccessGate allowed={canManageRequests} area="요청 관리" embedded><OperationsShortcut title="요청 관리" description="접수된 문제 제보를 확인하고 처리 결과를 남깁니다." href="/operations/requests" /></WorkspaceAccessGate>}
            {tab.id === "activity" && <WorkspaceAccessGate allowed={canViewActivity} area="활동 로그" embedded><OperationsShortcut title="활동 로그" description="누가 어떤 업무를 변경했는지 확인합니다." href="/operations/activity" /></WorkspaceAccessGate>}
          </Suspense></WorkspaceAccessGate>
        </div>
      </div>
    </OverlayShell>
  );
}
