import { useState } from "react";
import { createRoot } from "react-dom/client";
import { UIProvider } from "@/context/UIContext";
import TeamWorkspace from "@/features/teams/TeamWorkspace";
import TeamsHome from "@/features/teams/TeamsHome";
import SiteHelp from "@/features/library/SiteHelp";
import { HomeStart } from "@/features/portal/HomeStart";
import { canEditTeam } from "@/features/teams/teamModel";
import { PraiseAttendance } from "@/features/praise/components/PraiseAttendance";
import { praiseFixture } from "@/features/praise/components/praiseTestFixtures";
import type { PraiseCommand, PraiseView } from "@/features/praise/types";
import { qa, setQaAuth, useAuth } from "./mocks";
import "@/app/globals.css";
import "@/app/portal-surfaces.css";
import "@/app/theme-compat.css";
import "@/app/interaction-controls.css";
import "@/app/team-first.css";
import "@/features/praise/praise.css";

declare global {
  interface Window { __NEW_STAFF_QA__: typeof qa & { setAuth: typeof setQaAuth }; }
}

const params = new URLSearchParams(window.location.search);
document.documentElement.dataset.theme = params.get("theme") ?? "light";
document.documentElement.style.colorScheme = params.get("theme") ?? "light";
window.__NEW_STAFF_QA__ = Object.assign(qa, { setAuth: setQaAuth });

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

function Fixture() {
  const scenario = params.get("scenario") ?? (window.location.pathname === "/library/help" ? "help" : "team");
  return <UIProvider>
    <p className="sr-only" role="note">이 화면은 실제 인증과 운영 DB를 연결하지 않는 합성 UI 검증입니다.</p>
    {scenario === "attendance" ? <main className="team-first-page"><Attendance /></main>
      : scenario === "homeGuide" ? <HomeGuide />
      : scenario === "help" ? <SiteHelp />
        : scenario === "teams" ? <TeamsHome /> : <TeamWorkspace teamKey={params.get("team") === "media" ? "media" : "praise"} />}
  </UIProvider>;
}

createRoot(document.getElementById("root")!).render(<Fixture />);
