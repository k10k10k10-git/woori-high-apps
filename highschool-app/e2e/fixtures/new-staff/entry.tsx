import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { UIProvider } from "@/context/UIContext";
import { ThemeProvider } from "@/context/ThemeContext";
import { ViewModeProvider } from "@/context/ViewModeContext";
import TeamWorkspace from "@/features/teams/TeamWorkspace";
import TeamsHome from "@/features/teams/TeamsHome";
import SiteHelp from "@/features/library/SiteHelp";
import { HomeStart } from "@/features/portal/HomeStart";
import { canEditTeam } from "@/features/teams/teamModel";
import { canManageRolesOf } from "@/features/portal/accessPolicy";
import { sundayTeamOf } from "@/features/portal/featureCatalog";
import GlobalPortalHeader from "@/features/portal/GlobalPortalHeader";
import PortalHome from "@/features/portal/PortalHome";
import MyPageModal, { type MyPageTab } from "@/features/portal/MyPageModal";
import ProgramPreparationClient from "@/app/retreat/[id]/programs/ProgramPreparationClient";
import RetreatAreaNav from "@/features/portal/RetreatAreaNav";
import OperationsHome from "@/features/operations/OperationsHome";
import OperationsGate from "@/features/operations/OperationsGate";
import { PraiseAttendance } from "@/features/praise/components/PraiseAttendance";
import { praiseFixture } from "@/features/praise/components/praiseTestFixtures";
import type { PraiseCommand, PraiseView } from "@/features/praise/types";
import { qa, setQaAuth, useAuth } from "./mocks";
import "@/app/globals.css";
import "@/app/portal-surfaces.css";
import "@/app/theme-compat.css";
import "@/app/interaction-controls.css";
import "@/app/team-first.css";
import "@/app/program-preparation.css";
import "@/app/operations-tables.css";
import "@/app/my-page-workspace.css";
import "@/features/praise/praise.css";

declare global {
  interface Window { __NEW_STAFF_QA__: typeof qa & { setAuth: typeof setQaAuth }; }
}

const params = new URLSearchParams(window.location.search);
document.documentElement.dataset.theme = params.get("theme") ?? "light";
document.documentElement.style.colorScheme = params.get("theme") ?? "light";
window.__NEW_STAFF_QA__ = Object.assign(qa, { setAuth: setQaAuth });
// Next primitive의 이동 기록만 대체한다. 모달 닫기와 권한 판정은 실제 구현이다.
qa.recordLinkNavigation = params.get("scenario") === "actualMyPage";

function Attendance() {
  const [view, setView] = useState<PraiseView>(() => {
    const initial = praiseFixture();
    initial.attendance = { "meeting-1": { "student-1": { status: "PRESENT", revision: 5, groupVersionId: "groups-1", updatedAt: 1788656400000, updatedBy: "manager-uid" } } };
    return initial;
  });
  async function execute(command: PraiseCommand) {
    qa.writes.push(command);
    if (command.type === "attendance.set") {
      setView((current) => ({ ...current, attendance: { ...current.attendance, [command.meetingId]: { ...current.attendance[command.meetingId], [command.personId]: { ...current.attendance[command.meetingId]?.[command.personId], status: command.status, revision: 6, groupVersionId: "groups-1", updatedAt: Date.now(), updatedBy: "synthetic-actor" } } } }));
    }
    return true;
  }
  return <div className="praise-workspace"><PraiseAttendance view={view} meeting={view.meetings[0]} execute={execute} busy={false} /></div>;
}

function HomeGuide() {
  const { user, roles, teamMemberships } = useAuth();
  const viewOnly = !canEditTeam("praise", roles, teamMemberships);
  return <main className="team-first-page"><h1>합성 홈 업무 안내</h1><HomeStart userId={user?.uid ?? "guest"} roleLabel={viewOnly ? "찬양팀 조회자" : "찬양팀 스탭"} viewOnly={viewOnly} entry={{ href: "/teams/praise", title: "찬양팀 업무 시작", description: "합성 팀 업무를 시작합니다.", steps: ["팀 전체 현황 확인", "담당 업무 선택", "저장 결과 확인"] }} /></main>;
}

function RestrictedMountProbe() {
  useEffect(() => { qa.childMounts += 1; qa.subscriptions.push("protected-child-mount-probe"); }, []);
  return <main><h1>합성 제한 데이터 자녀</h1></main>;
}

function OperationsMountProbe() {
  const { roles } = useAuth();
  return <OperationsGate allowed={canManageRolesOf(roles)}><RestrictedMountProbe /></OperationsGate>;
}

function MyPageFixture() {
  const [opened, setOpened] = useState(false);
  return <main className="team-first-page">
    <h1>합성 마이페이지 검증</h1>
    <button type="button" className="btn-primary" onClick={() => setOpened(true)}>마이페이지 열기</button>
    {opened && <MyPageModal initialTab={(params.get("tab") ?? "dashboard") as MyPageTab} onClose={() => { qa.closeCalls += 1; setOpened(false); }} />}
  </main>;
}

function Fixture() {
  const pathname = window.location.pathname;
  const teamMatch = /^\/teams\/([^/]+)$/.exec(pathname);
  const scenario = params.get("scenario") ?? (pathname === "/library/help" ? "help" : pathname === "/teams" ? "teams" : pathname === "/operations" ? "operations" : "team");
  const teamKey = sundayTeamOf(params.get("team") ?? teamMatch?.[1] ?? "praise")?.key ?? "praise";
  const showHeader = scenario === "header" || scenario === "actualHome" || scenario === "actualProgram" || pathname.startsWith("/teams") || pathname === "/operations";
  const content = <>
    {showHeader && <GlobalPortalHeader />}
    <p className="sr-only" role="note">이 화면은 실제 인증과 운영 DB를 연결하지 않는 합성 UI 검증입니다.</p>
    {scenario === "attendance" ? <main className="team-first-page"><Attendance /></main>
      : scenario === "homeGuide" ? <HomeGuide />
      : scenario === "actualHome" ? <PortalHome />
      : scenario === "actualMyPage" ? <MyPageFixture />
      : scenario === "actualProgram" ? <ProgramPreparationClient />
      : scenario === "help" ? <SiteHelp />
      : scenario === "operations" ? <OperationsHome />
      : scenario === "operationsGateProbe" ? <OperationsMountProbe />
      : scenario === "retreatNav" ? <main className="team-first-page"><h1>합성 수련회 메뉴 검증</h1><RetreatAreaNav retreatId="synthetic-retreat" current="programs" adminAllowed={false} fieldAllowed={false} /></main>
      : scenario === "retreatNavSurface" ? <main className="team-first-page"><h1>합성 수련회 메뉴 표면 검증</h1><RetreatAreaNav retreatId="synthetic-retreat" tone="surface" adminAllowed={false} fieldAllowed={false} /></main>
      : scenario === "teams" || scenario === "header" ? <TeamsHome /> : <TeamWorkspace teamKey={teamKey} />}
  </>;
  return <UIProvider>
    {showHeader ? <ThemeProvider><ViewModeProvider>{content}</ViewModeProvider></ThemeProvider> : content}
  </UIProvider>;
}

createRoot(document.getElementById("root")!).render(<Fixture />);
