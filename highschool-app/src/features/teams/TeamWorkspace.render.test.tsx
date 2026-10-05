/** @vitest-environment jsdom */
import { act, cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { Application, Semester, Session, Team } from "@/features/semester/types";
import type { MinistryRoles } from "@/features/portal/accessPolicy";
import type { TeamMemberships } from "./teamModel";

const mocks = vi.hoisted(() => ({
  semesters: vi.fn(), teams: vi.fn(), applications: vi.fn(), sessions: vi.fn(),
  auth: { user: { uid: "summary-member" }, loading: false, roleError: false, roles: { semester: "praise", retreat: "none" } as MinistryRoles, teamMemberships: { praise: { role: "staff", active: true } } as TeamMemberships },
}));
vi.mock("@/context/AuthContext", () => ({ useAuth: () => mocks.auth }));
vi.mock("@/features/semester/db", () => ({ subscribeSemesters: mocks.semesters, subscribeTeams: mocks.teams, subscribeApplications: mocks.applications, subscribeSessions: mocks.sessions }));

import TeamWorkspace from "./TeamWorkspace";
import TeamsHome from "./TeamsHome";

const term = { id: "current", meta: { title: "현재 운영 학기", startDate: "2026-08-01", endDate: "2026-11-30" } } as Semester;
const oldTerm = { id: "old", meta: { title: "지난 운영 학기", startDate: "2025-01-01", endDate: "2025-05-31" } } as Semester;
const team = { id: "praise-team", teamKey: "praise", name: "찬양팀", goal: "함께 예배를 준비해요", room: "찬양 연습실" } as Team;
const app = (id: string, extra: Partial<Application> = {}) => ({ id, teamId: team.id, status: "배치", bu: "1부", ...extra }) as Application;

beforeEach(() => {
  vi.clearAllMocks(); localStorage.clear();
  vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-05T00:00:00Z"));
  mocks.auth.roles = { semester: "praise", retreat: "none" };
  mocks.auth.teamMemberships = { praise: { role: "staff", active: true } };
  [mocks.semesters, mocks.teams, mocks.applications, mocks.sessions].forEach((subscribe) => subscribe.mockReturnValue(() => {}));
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

function connectTerms() {
  act(() => mocks.semesters.mock.calls[0][0]([term, oldTerm]));
  act(() => mocks.teams.mock.calls.find(([id]) => id === "current")![1]([team]));
  act(() => mocks.teams.mock.calls.find(([id]) => id === "old")![1]([team]));
}

it("팀 현황을 업무보다 먼저 보여주며 대표 학기의 학생·스탭과 다음 모임을 요약한다", () => {
  render(<TeamWorkspace teamKey="praise" />);
  connectTerms();
  const summary = screen.getByRole("region", { name: "팀 전체 현황" });
  expect(summary.compareDocumentPosition(screen.getByRole("region", { name: "찬양팀, 이렇게 시작해요" })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(mocks.applications.mock.calls.map(([id]) => id)).toEqual(["current"]);
  expect(mocks.sessions.mock.calls.map(([id]) => id)).toEqual(["current"]);
  act(() => mocks.applications.mock.calls[0][1]([app("student"), app("staff", { bu: "스탭" }), app("cancelled", { status: "취소" }), app("training", { trainingOnly: true }), app("other", { teamId: "other-team" })]));
  act(() => mocks.sessions.mock.calls[0][1]([
    { id: "future", date: "2026-10-10", type: "정규" },
    { id: "holiday", date: "2026-10-05", type: "휴강" },
    { id: "ongoing", date: "2026-10-04", endDate: "2026-10-05", type: "행사", label: "함께 모이는 날" },
  ] as Session[]));
  expect(within(summary).getAllByText("1명")).toHaveLength(2);
  expect(within(summary).getByText("2026-10-04 ~ 2026-10-05")).toBeInTheDocument();
  expect(within(summary).getByText("함께 예배를 준비해요")).toBeInTheDocument();
  expect(within(summary).getByText("찬양 연습실")).toBeInTheDocument();
  expect(screen.getAllByRole("link", { name: /이번 주 업무/ })[0]).toHaveAttribute("href", "/teams/praise/ongoing?semester=current");
});

it("명단·일정 실패를 0명·예정 모임 없음으로 오인하지 않는다", () => {
  render(<TeamWorkspace teamKey="praise" />);
  connectTerms();
  const summary = screen.getByRole("region", { name: "팀 전체 현황" });
  act(() => mocks.applications.mock.calls[0][2](new Error("조회 실패")));
  act(() => mocks.sessions.mock.calls[0][2](new Error("조회 실패")));
  expect(within(summary).getAllByText("확인 필요")).toHaveLength(3);
  expect(within(summary).queryByText("0명")).not.toBeInTheDocument();
  expect(within(summary).queryByText("예정된 모임 없음")).not.toBeInTheDocument();
  expect(within(summary).getByRole("alert")).toHaveTextContent("실제 인원이 없는 상태와 다릅니다");
});

it("권한 없는 계정과 승인된 미배정 계정의 안내를 구분한다", () => {
  mocks.auth.roles = { semester: "none", retreat: "none" };
  mocks.auth.teamMemberships = {};
  const unapproved = render(<TeamsHome />);
  expect(screen.getByRole("heading", { name: "접근 승인이 필요합니다" })).toBeInTheDocument();
  expect(screen.queryByText(/계정 승인은 완료/)).not.toBeInTheDocument();
  expect(screen.getByRole("link", { name: "승인·팀 연결 방법 보기" })).toHaveAttribute("href", "/library/help#access");
  unapproved.unmount();
  mocks.auth.roles = { semester: "staff", retreat: "none" };
  render(<TeamsHome />);
  expect(screen.getByRole("heading", { name: "담당 팀 연결이 필요합니다" })).toBeInTheDocument();
});

it("미디어팀의 준비 중 상시 업무 대신 연결된 학기 명단으로 업무를 시작한다", () => {
  mocks.auth.roles = { semester: "media", retreat: "none" };
  mocks.auth.teamMemberships = { media: { role: "staff", active: true } };
  render(<TeamWorkspace teamKey="media" />);
  act(() => mocks.semesters.mock.calls[0][0]([term]));
  act(() => mocks.teams.mock.calls[0][1]([{ ...team, id: "media-team", teamKey: "media", name: "미디어팀" }]));
  const actions = within(screen.getByRole("region", { name: "주간 업무와 학기 기록" }));
  expect(actions.getByRole("link", { name: /학기 명단·기록 열기/ })).toHaveAttribute("href", "/teams/media/terms/current/roster");
  expect(actions.getByRole("heading", { name: "주간·주일 운영 준비 중" })).toBeInTheDocument();
  expect(screen.getAllByRole("link").some((link) => link.getAttribute("href") === "/teams/media/ongoing")).toBe(false);
});

it("학기가 없는 기획디자인팀은 준비 중과 문의를 명확히 안내한다", () => {
  mocks.auth.roles = { semester: "design", retreat: "none" };
  mocks.auth.teamMemberships = { design: { role: "staff", active: true } };
  render(<TeamWorkspace teamKey="design" />);
  act(() => mocks.semesters.mock.calls[0][0]([]));
  const actions = within(screen.getByRole("region", { name: "주간 업무와 학기 기록" }));
  expect(actions.getByText(/주간·주일 운영 화면은 준비 중입니다/)).toBeInTheDocument();
  expect(actions.getByRole("link", { name: "팀 기능 문의하기" })).toHaveAttribute("href", "/help/feedback");
  expect(screen.queryByRole("link", { name: /팀 업무 준비/ })).not.toBeInTheDocument();
});

it.each([
  ["past", "2025-01-01", "2025-05-31", "지난 학기 주간·주일 기록", "지난 학기의"],
  ["future", "2027-01-01", "2027-05-31", "예정 학기 업무 준비", "예정 학기의"],
])("%s 대표 학기를 이번 주로 오인시키지 않고 같은 학기 업무를 연다", (id, startDate, endDate, heading, description) => {
  render(<TeamWorkspace teamKey="praise" />);
  act(() => mocks.semesters.mock.calls[0][0]([{ ...term, id, meta: { ...term.meta, title: "선택한 찬양 학기", startDate, endDate } }]));
  act(() => mocks.teams.mock.calls[0][1]([team]));
  const actions = within(screen.getByRole("region", { name: "주간 업무와 학기 기록" }));
  expect(actions.getByRole("heading", { name: heading })).toBeInTheDocument();
  expect(actions.getByRole("link", { name: new RegExp(heading) })).toHaveAttribute("href", `/teams/praise/ongoing?semester=${id}`);
  expect(screen.queryByText("이번 주 업무")).not.toBeInTheDocument();
  expect(screen.queryByText(/이번 학기 학생/)).not.toBeInTheDocument();
  expect(actions.getByText(new RegExp(description))).toBeInTheDocument();
});

it("과거 학기를 선택해도 바나바 상시 업무를 그 학기 기록으로 오인시키지 않는다", () => {
  mocks.auth.roles = { semester: "barnabas", retreat: "none" };
  mocks.auth.teamMemberships = { barnabas: { role: "staff", active: true } };
  render(<TeamWorkspace teamKey="barnabas" />);
  act(() => mocks.semesters.mock.calls[0][0]([oldTerm]));
  act(() => mocks.teams.mock.calls[0][1]([{ ...team, teamKey: "barnabas", name: "바나바팀" }]));
  const actions = within(screen.getByRole("region", { name: "주간 업무와 학기 기록" }));
  expect(actions.getByRole("heading", { name: "주간·주일 업무" })).toBeInTheDocument();
  expect(actions.getByRole("link", { name: /주간·주일 업무/ })).toHaveAttribute("href", "/teams/barnabas/ongoing");
  expect(actions.queryByRole("heading", { name: "지난 학기 주간·주일 기록" })).not.toBeInTheDocument();
});

it("조회자의 팀 안내와 카드에서는 입력 대신 기록 조회를 설명한다", () => {
  mocks.auth.teamMemberships = { praise: { role: "viewer", active: true } };
  render(<TeamWorkspace teamKey="praise" />);
  connectTerms();
  expect(screen.getAllByText(/모임 출결·조 편성·등단 기록을 조회합니다/)).toHaveLength(2);
  expect(screen.queryByText(/이번 모임 학생 출결·주일 스탭 참석.*입력/)).not.toBeInTheDocument();
});
