/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
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
const futureTerm = { id: "future", meta: { title: "예정 운영 학기", startDate: "2027-01-01", endDate: "2027-05-31" } } as Semester;
const team = { id: "praise-team", teamKey: "praise", name: "찬양팀", goal: "함께 예배를 준비해요", room: "찬양 연습실" } as Team;
const app = (id: string, extra: Partial<Application> = {}) => ({ id, teamId: team.id, status: "배치", bu: "1부", ...extra }) as Application;

beforeEach(() => {
  vi.clearAllMocks(); localStorage.clear();
  vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-05T00:00:00Z"));
  mocks.auth.user = { uid: "summary-member" };
  mocks.auth.loading = false;
  mocks.auth.roleError = false;
  mocks.auth.roles = { semester: "praise", retreat: "none" };
  mocks.auth.teamMemberships = { praise: { role: "staff", active: true } };
  [mocks.semesters, mocks.teams, mocks.applications, mocks.sessions].forEach((subscribe) => subscribe.mockReturnValue(() => {}));
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

function connectTerms(terms = [term, oldTerm], connectedTeam = team) {
  act(() => mocks.semesters.mock.calls.at(-1)![0](terms));
  for (const semester of terms) act(() => mocks.teams.mock.calls.filter(([id]) => id === semester.id).at(-1)![1]([connectedTeam]));
}

it("운영 학기 다음에 업무를 먼저 보여주고 선택 학기의 현황도 유지한다", () => {
  render(<TeamWorkspace teamKey="praise" />);
  connectTerms();
  const summary = screen.getByRole("region", { name: "팀 전체 현황" });
  const actions = screen.getByRole("region", { name: "주간 업무와 학기 기록" });
  expect(screen.getByRole("combobox", { name: "운영 학기" }).compareDocumentPosition(actions) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(actions.compareDocumentPosition(summary) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(screen.queryByRole("button", { name: "안내 닫기" })).not.toBeInTheDocument();
  expect(screen.queryByRole("link", { name: "처음이라면 사용 안내로 이동" })).not.toBeInTheDocument();
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
  expect(actions.getByRole("link", { name: "선택 학기 명단·연락처 열기" })).toHaveAttribute("href", "/teams/media/terms/current/roster");
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

it("조회자의 업무 카드에서는 입력 대신 기록 조회를 표시한다", () => {
  mocks.auth.teamMemberships = { praise: { role: "viewer", active: true } };
  render(<TeamWorkspace teamKey="praise" />);
  connectTerms();
  expect(screen.getAllByText(/모임 출결·조 편성·등단 기록을 조회합니다/)).toHaveLength(1);
  expect(screen.queryByText(/이번 모임 학생 출결·주일 스탭 참석.*입력/)).not.toBeInTheDocument();
});

it("운영 학기를 한 곳에서 고르고 현재 학기 네 업무를 바로 연다", () => {
  render(<TeamWorkspace teamKey="praise" />);
  connectTerms([oldTerm, futureTerm, term]);
  expect(screen.getAllByRole("combobox")).toHaveLength(1);
  expect(screen.getByRole("combobox", { name: "운영 학기" })).toHaveValue("current");
  const links = within(screen.getByRole("navigation", { name: "선택 학기 업무" })).getAllByRole("link");
  expect(links.map((link) => link.getAttribute("href"))).toEqual([
    "/teams/praise/terms/current/roster", "/teams/praise/ongoing?semester=current&tab=attendance",
    "/teams/praise/terms/current/curriculum", "/teams/praise/terms/current/records",
  ]);
  expect(screen.getAllByRole("link").filter((link) => link.getAttribute("href")?.endsWith("/overview"))).toHaveLength(0);
  expect(mocks.applications.mock.calls.map(([id]) => id)).toEqual(["current"]);
  expect(mocks.sessions.mock.calls.map(([id]) => id)).toEqual(["current"]);
});

it.each([
  ["old", "지난 학기 주간·주일 기록"], ["future", "예정 학기 업무 준비"],
])("%s 학기를 고르면 모든 업무와 찬양 출결을 같은 학기로 연결한다", (id, weeklyTitle) => {
  render(<TeamWorkspace teamKey="praise" />);
  connectTerms([term, oldTerm, futureTerm]);
  fireEvent.change(screen.getByRole("combobox", { name: "운영 학기" }), { target: { value: id } });
  const actions = within(screen.getByRole("navigation", { name: "선택 학기 업무" }));
  expect(actions.getByRole("link", { name: "선택 학기 명단·연락처 열기" })).toHaveAttribute("href", `/teams/praise/terms/${id}/roster`);
  expect(actions.getByRole("link", { name: "선택 학기 출석 열기" })).toHaveAttribute("href", `/teams/praise/ongoing?semester=${id}&tab=attendance`);
  expect(actions.getByRole("link", { name: "선택 학기 커리큘럼 열기" })).toHaveAttribute("href", `/teams/praise/terms/${id}/curriculum`);
  expect(actions.getByRole("link", { name: "선택 학기 자료·기록 열기" })).toHaveAttribute("href", `/teams/praise/terms/${id}/records`);
  expect(screen.getAllByRole("link", { name: new RegExp(weeklyTitle) })[0]).toHaveAttribute("href", `/teams/praise/ongoing?semester=${id}`);
  expect(mocks.applications.mock.calls.map(([sid]) => sid)).toEqual(["current", id]);
  expect(mocks.sessions.mock.calls.map(([sid]) => sid)).toEqual(["current", id]);
});

it("학기를 바꾸면 이전 명단·회차 구독을 닫고 뒤늦은 성공과 실패를 버린다", () => {
  const stopApplications = vi.fn();
  const stopSessions = vi.fn();
  mocks.applications.mockReturnValue(stopApplications);
  mocks.sessions.mockReturnValue(stopSessions);
  render(<TeamWorkspace teamKey="praise" />);
  connectTerms();
  const previousApplications = mocks.applications.mock.calls[0];
  const previousSessions = mocks.sessions.mock.calls[0];
  fireEvent.change(screen.getByRole("combobox", { name: "운영 학기" }), { target: { value: "old" } });
  expect(stopApplications).toHaveBeenCalledTimes(1);
  expect(stopSessions).toHaveBeenCalledTimes(1);
  act(() => mocks.applications.mock.calls.at(-1)![1]([app("old-student") ]));
  act(() => mocks.sessions.mock.calls.at(-1)![1]([]));
  act(() => previousApplications[1]([app("stale-a"), app("stale-b") ]));
  act(() => previousApplications[2](new Error("이전 학기 오류")));
  act(() => previousSessions[1]([{ id: "stale", date: "2026-10-10", type: "정규" }]));
  act(() => previousSessions[2](new Error("이전 회차 오류")));
  const summary = within(screen.getByRole("region", { name: "팀 전체 현황" }));
  expect(summary.getByText("1명")).toBeInTheDocument();
  expect(summary.queryByText("2명")).not.toBeInTheDocument();
  expect(summary.getByText("0회")).toBeInTheDocument();
  expect(summary.queryByRole("alert")).not.toBeInTheDocument();
});

it("연결 목록 갱신과 재조회는 선택 학기를 유지하고 이전 응답은 폐기한다", () => {
  render(<TeamWorkspace teamKey="praise" />);
  connectTerms();
  fireEvent.change(screen.getByRole("combobox", { name: "운영 학기" }), { target: { value: "old" } });
  act(() => mocks.semesters.mock.calls[0][0]([{ ...term, meta: { ...term.meta, title: "수정된 현재 학기" } }, oldTerm]));
  expect(screen.getByRole("combobox", { name: "운영 학기" })).toHaveValue("old");
  const previousList = mocks.semesters.mock.calls[0];
  const previousTeam = mocks.teams.mock.calls[0];
  act(() => mocks.applications.mock.calls.at(-1)![2](new Error("합성 연결 실패")));
  fireEvent.click(screen.getByRole("button", { name: "현황 다시 불러오기" }));
  connectTerms();
  expect(screen.getByRole("combobox", { name: "운영 학기" })).toHaveValue("old");
  expect(mocks.applications.mock.calls.at(-1)![0]).toBe("old");
  act(() => previousList[0]([]));
  act(() => previousList[1](new Error("이전 목록 실패")));
  act(() => previousTeam[1]([]));
  act(() => previousTeam[2](new Error("이전 연결 실패")));
  expect(screen.getByRole("combobox", { name: "운영 학기" })).toHaveValue("old");
  expect(screen.queryByRole("button", { name: "다시 불러오기" })).not.toBeInTheDocument();
});

it.each(["account", "roles", "team"] as const)("%s가 바뀌면 이전 선택을 초기화한다", (change) => {
  const view = render(<TeamWorkspace teamKey="praise" />);
  connectTerms();
  fireEvent.change(screen.getByRole("combobox", { name: "운영 학기" }), { target: { value: "old" } });
  let nextKey: "praise" | "barnabas" = "praise";
  if (change === "account") mocks.auth.user = { uid: "another-member" };
  if (change === "roles") mocks.auth.roles = { semester: "pastor", retreat: "pastor" };
  if (change === "team") {
    nextKey = "barnabas";
    mocks.auth.teamMemberships = { barnabas: { role: "staff", active: true } };
  }
  view.rerender(<TeamWorkspace teamKey={nextKey} />);
  connectTerms([term, oldTerm], { ...team, teamKey: nextKey });
  expect(screen.getByRole("combobox", { name: "운영 학기" })).toHaveValue("current");
  expect(mocks.applications.mock.calls.at(-1)![0]).toBe("current");
});

it("팀의 허용 학기 밖은 selector와 팀 연결 구독에 추가하지 않는다", () => {
  mocks.auth.teamMemberships = { praise: { role: "staff", active: true, semesters: { current: true } } };
  render(<TeamWorkspace teamKey="praise" />);
  act(() => mocks.semesters.mock.calls[0][0]([term, oldTerm, futureTerm]));
  expect(mocks.teams.mock.calls.map(([id]) => id)).toEqual(["current"]);
  act(() => mocks.teams.mock.calls[0][1]([team]));
  const picker = within(screen.getByRole("combobox", { name: "운영 학기" }));
  expect(picker.getAllByRole("option")).toHaveLength(1);
  expect(picker.queryByRole("option", { name: /지난 운영 학기/ })).not.toBeInTheDocument();
  expect(picker.queryByRole("option", { name: /예정 운영 학기/ })).not.toBeInTheDocument();
});

it.each(["loading", "roleError", "denied"] as const)("%s 중에는 업무 데이터 구독을 시작하지 않는다", (state) => {
  if (state === "denied") { mocks.auth.roles = { semester: "none", retreat: "none" }; mocks.auth.teamMemberships = {}; }
  else mocks.auth[state] = true;
  render(<TeamWorkspace teamKey="praise" />);
  for (const subscribe of [mocks.semesters, mocks.teams, mocks.applications, mocks.sessions]) expect(subscribe).not.toHaveBeenCalled();
});

it("연결이 사라진 선택은 기본 학기로 돌아가고 같은 학기가 다시 연결돼도 부활하지 않는다", () => {
  render(<TeamWorkspace teamKey="praise" />);
  connectTerms();
  fireEvent.change(screen.getByRole("combobox", { name: "운영 학기" }), { target: { value: "old" } });
  act(() => mocks.teams.mock.calls.find(([id]) => id === "old")![1]([]));
  expect(screen.getByRole("combobox", { name: "운영 학기" })).toHaveValue("current");
  act(() => mocks.teams.mock.calls.find(([id]) => id === "old")![1]([team]));
  expect(screen.getByRole("combobox", { name: "운영 학기" })).toHaveValue("current");
});

it("지난 학기 선택이 바나바의 연중 업무 권한·설명을 바꾸지 않는다", () => {
  mocks.auth.roles = { semester: "leader", retreat: "none" };
  mocks.auth.teamMemberships = { barnabas: { role: "staff", active: true, semesters: { current: true } } };
  render(<TeamWorkspace teamKey="barnabas" />);
  connectTerms([term, oldTerm], { ...team, teamKey: "barnabas", name: "바나바팀" });
  fireEvent.change(screen.getByRole("combobox", { name: "운영 학기" }), { target: { value: "old" } });
  const weekly = within(screen.getByRole("region", { name: "주간 업무와 학기 기록" })).getByRole("link", { name: /주간·주일 업무/ });
  expect(weekly).toHaveAttribute("href", "/teams/barnabas/ongoing");
  expect(weekly).toHaveTextContent("새친구 접수·등록 현황 확인·처리 대기 건 관리");
  expect(weekly).not.toHaveTextContent("주간·주일 조회");
  const actions = within(screen.getByRole("navigation", { name: "선택 학기 업무" }));
  expect(actions.getByRole("link", { name: "선택 학기 출석 열기" })).toHaveAttribute("href", "/teams/barnabas/terms/old/attendance");
});

it("학기 없는 팀도 네 학기 업무를 표시하며 잘못된 목적지 링크를 만들지 않는다", () => {
  render(<TeamWorkspace teamKey="praise" />);
  act(() => mocks.semesters.mock.calls[0][0]([]));
  expect(screen.getByRole("combobox", { name: "운영 학기" })).toBeDisabled();
  const actions = within(screen.getByRole("navigation", { name: "선택 학기 업무" }));
  expect(actions.queryAllByRole("link")).toHaveLength(0);
  expect(actions.getAllByRole("heading").map((heading) => heading.textContent)).toEqual(["명단·연락처", "출석", "커리큘럼", "자료·기록"]);
});
