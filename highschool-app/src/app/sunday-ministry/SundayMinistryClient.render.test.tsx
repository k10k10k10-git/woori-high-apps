/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { MinistryRoles } from "@/features/portal/accessPolicy";
import type { TeamMemberships } from "@/features/teams/teamModel";

const state = vi.hoisted(() => ({ roles: { semester: "superAdmin", retreat: "superAdmin" } as MinistryRoles, teamMemberships: {} as TeamMemberships, canSearchOfficialRoster: true, push: vi.fn(), friends: vi.fn(), friendsPrivate: vi.fn(), changes: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: state.push }) }));
vi.mock("next/dynamic", () => ({ default: (loader: () => unknown) => loader.toString().includes("AnnualFinanceTab")
  ? function FinanceFixture({ year, onBusyChange }: { year: number; onBusyChange: (value: boolean) => void }) { return <div data-testid="finance">{year}<button onClick={() => onBusyChange(true)}>합성 회계 처리</button></div>; }
  : function PraiseFixture({ workspaceId, initialTab, embedded }: { workspaceId?: string; initialTab?: string; embedded?: boolean }) { return <div data-testid="praise-workspace">{workspaceId} {initialTab} {embedded ? "공통 팀 헤더 사용" : "독립 헤더"}</div>; } }));
vi.mock("@/context/AuthContext", () => ({ useAuth: () => ({ user: { uid: "synthetic-user" }, loading: false, roles: state.roles, teamMemberships: state.teamMemberships, canSearchOfficialRoster: state.canSearchOfficialRoster, signIn: vi.fn() }) }));
vi.mock("@/features/sundayMinistry/db", () => ({ subscribeSundayAdminChanges: state.changes, subscribeSundayNewFriends: state.friends, subscribeSundayNewFriendsPrivate: state.friendsPrivate }));
vi.mock("@/features/sundayMinistry/SundayMinistryTabs", () => ({ AdminChangesTab: ({ year }: { year: number }) => <p>행정 이력 {year}</p>, PendingTab: () => null, RegistrationStatusTab: () => null }));
vi.mock("@/features/sundayMinistry/AttendanceBookTab", () => ({ default: ({ year }: { year: number }) => <p>출석 조회 {year}</p> }));
vi.mock("@/features/sundayWorship/WorshipDocsTab", () => ({ default: () => null }));
vi.mock("@/features/sundayWorship/WorshipDutyTab", () => ({ default: () => null }));
vi.mock("@/features/sundayWorship/WorshipSeatingTab", () => ({ default: () => null }));
vi.mock("../semester/[id]/NewFriendsTab", () => ({ default: function NewFriendsFixture({ canSyncRoster }: { canSyncRoster: boolean }) {
  const canEdit = useSemesterCanEdit();
  return canEdit && canSyncRoster ? <button>합성 출석부 반영</button> : null;
} }));
import { useSemesterCanEdit } from "@/features/semester/EditContext";
import SundayMinistryClient, { sundayTabHref } from "./SundayMinistryClient";

beforeEach(() => { state.roles = { semester: "superAdmin", retreat: "superAdmin" }; state.teamMemberships = {}; state.canSearchOfficialRoster = true; vi.clearAllMocks(); window.history.replaceState(null, "", "/sunday-ministry"); state.friends.mockReturnValue(() => {}); state.friendsPrivate.mockReturnValue(() => {}); state.changes.mockReturnValue(() => {}); });
afterEach(cleanup);

it("찬양팀에 현재 팀과 팀 변경을 표시하고 기존 선택을 전달한다", () => {
  render(<SundayMinistryClient team="praise" workspaceId="workspace-fixture" initialTab="stage" />);
  expect(screen.getByRole("heading", { name: "찬양팀" })).toBeInTheDocument();
  expect(screen.getByTestId("praise-workspace")).toHaveTextContent("workspace-fixture stage 공통 팀 헤더 사용");
  const team = screen.getByLabelText("현재 팀·팀 변경");
  expect(team).toHaveValue("praise");
  fireEvent.change(team, { target: { value: "worship" } });
  expect(state.push).toHaveBeenCalledWith("/teams/worship/ongoing");
});

it("팀이 지정되지 않은 전체 관리자는 화면 크기와 관계없이 먼저 팀을 선택한다", () => {
  render(<SundayMinistryClient />);
  expect(screen.getByRole("heading", { name: "어느 팀의 업무를 볼까요?" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /찬양팀/ })).toBeInTheDocument();
  expect(screen.queryByLabelText("현재 팀·팀 변경")).not.toBeInTheDocument();
  expect(state.friends).not.toHaveBeenCalled();
  expect(state.friendsPrivate).not.toHaveBeenCalled();
  expect(state.changes).not.toHaveBeenCalled();
});

it("팀 선택은 전체 팀을 표시하며 자기 기획 팀 진입을 유지한다", () => {
  state.roles = { semester: "media", retreat: "none" };
  state.teamMemberships = { media: { role: "staff", active: true } };
  render(<SundayMinistryClient team="media" />);
  expect(screen.getAllByRole("option")).toHaveLength(6);
  expect(screen.getByRole("option", { name: "미디어팀 · 기획 중" })).not.toBeDisabled();
  expect(screen.getByText("기능 기획 중")).toBeInTheDocument();
});

it("기존 팀 없는 출석부 링크는 해당 탭을 가진 행정팀으로 바로 연다", () => {
  render(<SundayMinistryClient initialTab="출석부" />);
  expect(screen.getByLabelText("현재 팀·팀 변경")).toHaveValue("admin");
  expect(screen.getByRole("tab", { name: "출석부" })).toHaveAttribute("aria-selected", "true");
  expect(screen.queryByRole("heading", { name: "어느 팀의 업무를 볼까요?" })).not.toBeInTheDocument();
  expect(state.friends).not.toHaveBeenCalled();
  expect(state.friendsPrivate).not.toHaveBeenCalled();
});

it.each(["등단", "stage", "praiseStage", "attendance", "week"])("팀 없는 찬양 %s 탭 링크도 조회 화면을 바로 복원한다", (tab) => {
  render(<SundayMinistryClient initialTab={tab} workspaceId="workspace-fixture" />);
  expect(screen.getByLabelText("현재 팀·팀 변경")).toHaveValue("praise");
  expect(screen.getByTestId("praise-workspace")).toHaveTextContent(`workspace-fixture ${tab}`);
  expect(screen.queryByRole("heading", { name: "어느 팀의 업무를 볼까요?" })).not.toBeInTheDocument();
  expect(state.friends).not.toHaveBeenCalled();
});

it("명시 탭이 바뀐 기존 링크를 다시 열면 같은 팀의 두 번째 탭도 복원한다", () => {
  const { rerender } = render(<SundayMinistryClient initialTab="새친구" />);
  rerender(<SundayMinistryClient initialTab="등록 현황" />);
  expect(screen.getByLabelText("현재 팀·팀 변경")).toHaveValue("barnabas");
  expect(screen.getByRole("tab", { name: "등록 현황" })).toHaveAttribute("aria-selected", "true");
});

it("팀 변경은 대상 팀에 있는 탭만 쿼리로 인코딩해서 전달한다", () => {
  render(<SundayMinistryClient team="admin" initialTab="예배 자료" />);
  fireEvent.change(screen.getByLabelText("현재 팀·팀 변경"), { target: { value: "worship" } });
  expect(state.push).toHaveBeenLastCalledWith(`/teams/worship/ongoing?tab=${encodeURIComponent("예배 자료")}`);
  expect(new URL(state.push.mock.calls.at(-1)![0], "https://example.test").searchParams.get("tab")).toBe("예배 자료");
  fireEvent.change(screen.getByLabelText("현재 팀·팀 변경"), { target: { value: "barnabas" } });
  expect(state.push).toHaveBeenLastCalledWith("/teams/barnabas/ongoing");
});

it("어느 팀에도 없는 탭은 선택 화면과 선택 후 URL에 이어 붙이지 않는다", () => {
  render(<SundayMinistryClient initialTab="없는 탭&workspace=다른 값" />);
  fireEvent.click(screen.getByRole("button", { name: /찬양팀/ }));
  expect(state.push).toHaveBeenCalledWith("/teams/praise/ongoing");
});

it("접근할 수 없는 팀의 탭으로 자기 팀을 벗어나지 않는다", () => {
  state.roles = { semester: "media", retreat: "none" };
  state.teamMemberships = { media: { role: "staff", active: true } };
  render(<SundayMinistryClient initialTab="출석부" />);
  expect(screen.getByLabelText("현재 팀·팀 변경")).toHaveValue("media");
  expect(screen.queryByRole("tab", { name: "출석부" })).not.toBeInTheDocument();
  expect(state.friends).not.toHaveBeenCalled();
  expect(state.changes).not.toHaveBeenCalled();
});

it("찬양팀 외 탭 선택은 기존 쿼리와 해시를 보존해 주소에 기록한다", () => {
  window.history.replaceState(null, "", `/sunday-ministry/admin?from=mypage&tab=${encodeURIComponent("출석부")}#records`);
  render(<SundayMinistryClient team="admin" initialTab="출석부" />);
  fireEvent.click(screen.getByRole("tab", { name: "행정 변동 사항" }));
  expect(window.location.pathname).toBe("/sunday-ministry/admin");
  expect(new URLSearchParams(window.location.search).get("from")).toBe("mypage");
  expect(new URLSearchParams(window.location.search).get("tab")).toBe("행정 변동 사항");
  expect(window.location.hash).toBe("#records");
  expect(sundayTabHref("출석부", window.location.href)).toContain(`tab=${encodeURIComponent("출석부")}`);
});

it("찬양팀 외 탭은 뒤로가기 주소의 선택을 다시 복원한다", () => {
  window.history.replaceState(null, "", `/sunday-ministry/admin?tab=${encodeURIComponent("출석부")}`);
  render(<SundayMinistryClient team="admin" initialTab="출석부" />);
  fireEvent.click(screen.getByRole("tab", { name: "행정 변동 사항" }));
  expect(screen.getByRole("tab", { name: "행정 변동 사항" })).toHaveAttribute("aria-selected", "true");
  window.history.replaceState(null, "", `/sunday-ministry/admin?tab=${encodeURIComponent("출석부")}`);
  act(() => window.dispatchEvent(new PopStateEvent("popstate")));
  expect(screen.getByRole("tab", { name: "출석부" })).toHaveAttribute("aria-selected", "true");
});

it("찬양팀은 공통 헤더의 편집 판정 배지를 숨기고 내부 권한 안내를 사용한다", () => {
  state.roles = { semester: "adminTeam", retreat: "none" };
  state.teamMemberships = { praise: { role: "viewer", active: true } };
  render(<SundayMinistryClient team="praise" workspaceId="workspace-fixture" />);
  expect(screen.getByTestId("praise-workspace")).toBeInTheDocument();
  expect(screen.queryByText("조회 전용")).not.toBeInTheDocument();
});

it("조회자 membership은 담당 팀을 열되 주일 편집 권한은 주지 않는다", () => {
  state.roles = { semester: "worship", retreat: "none" };
  state.teamMemberships = { worship: { role: "viewer", active: true } };
  render(<SundayMinistryClient team="worship" />);
  expect(screen.getByText("조회 전용")).toBeInTheDocument();
});

it("행정팀 배정만 있고 연간 원장 권한이 없으면 출석부와 비공개 구독을 열지 않는다", () => {
  state.roles = { semester: "staff", retreat: "none" };
  state.teamMemberships = { admin: { role: "staff", active: true } };
  state.canSearchOfficialRoster = false;
  render(<SundayMinistryClient team="admin" initialTab="출석부" />);
  expect(screen.getByRole("heading", { name: "행정팀 주간·주일 업무 접근 권한이 필요합니다." })).toBeInTheDocument();
  expect(state.friends).not.toHaveBeenCalled();
  expect(state.friendsPrivate).not.toHaveBeenCalled();
  expect(state.changes).not.toHaveBeenCalled();
});

it("공통 연도를 출석 조회와 회계에 전달하고 필요 없는 행정 이력 구독은 열지 않는다", () => {
  render(<SundayMinistryClient team="admin" initialTab="출석부" />);
  expect(screen.getAllByRole("tab").map(tab => tab.textContent)).toEqual(["출석부", "행정 변동 사항", "연간 회계"]);
  const year = screen.getByLabelText("행정 업무 연도");
  const previousYear = Number((year as HTMLSelectElement).value) - 1;
  fireEvent.change(year, { target: { value: String(previousYear) } });
  expect(screen.getByText(`출석 조회 ${previousYear}`)).toBeInTheDocument();
  fireEvent.click(screen.getByRole("tab", { name: "연간 회계" }));
  expect(screen.getByTestId("finance")).toHaveTextContent(String(previousYear));
  expect(state.changes).not.toHaveBeenCalled();
  expect(state.friends).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "합성 회계 처리" }));
  expect(year).toBeDisabled();
  expect(screen.getByRole("tab", { name: "출석부" })).toBeDisabled();
  expect(screen.getByLabelText("현재 팀·팀 변경")).toBeDisabled();
});

it("행정 이력은 선택한 연도만 구독하고 완료 전에는 빈 목록으로 표시하지 않는다", () => {
  render(<SundayMinistryClient team="admin" initialTab="행정 변동 사항" />);
  const year = Number((screen.getByLabelText("행정 업무 연도") as HTMLSelectElement).value);
  expect(state.changes).toHaveBeenLastCalledWith(expect.any(Function), expect.any(Function), year);
  expect(screen.getByRole("status")).toHaveTextContent("불러오는");
  act(() => state.changes.mock.calls.at(-1)![0]([]));
  expect(screen.getByText(`행정 이력 ${year}`)).toBeInTheDocument();
});

it("스탭팀장에게 회계 메뉴는 보이지만 회계 컴포넌트는 열지 않는다", () => {
  state.roles = { semester: "leader", retreat: "adminTeam" };
  state.teamMemberships = { admin: { role: "viewer", active: true } };
  render(<SundayMinistryClient team="admin" initialTab="연간 회계" />);
  expect(screen.getByRole("tab", { name: "연간 회계" })).toBeInTheDocument();
  expect(screen.queryByTestId("finance")).not.toBeInTheDocument();
  expect(screen.getByText("연간 회계 접근 권한이 필요합니다.")).toBeInTheDocument();
  expect(state.changes).not.toHaveBeenCalled();
});

it("중앙 행정 역할은 별도 팀 배정이 없어도 행정 회계를 열 수 있다", () => {
  state.roles = { semester: "adminTeam", retreat: "none" };
  state.teamMemberships = {};
  render(<SundayMinistryClient team="admin" initialTab="연간 회계" />);
  expect(screen.getByTestId("finance")).toBeInTheDocument();
  expect(state.changes).not.toHaveBeenCalled();
});

it("별도 배정 없는 중앙 행정 계정의 기존 주일 업무 주소는 행정팀으로 바로 연다", () => {
  state.roles = { semester: "adminTeam", retreat: "none" };
  state.teamMemberships = {};
  render(<SundayMinistryClient />);
  expect(screen.getByLabelText("현재 팀·팀 변경")).toHaveValue("admin");
  expect(screen.getByRole("tab", { name: "출석부" })).toHaveAttribute("aria-selected", "true");
});

it("행정팀 소속 계정은 바나바 업무에서 비공개 정보를 구독하고 원장 반영을 연다", () => {
  state.roles = { semester: "adminTeam", retreat: "none" };
  state.teamMemberships = { admin: { active: true, role: "staff" } };
  render(<SundayMinistryClient team="barnabas" initialTab="새친구" />);
  expect(screen.getByRole("heading", { name: "바나바팀" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "합성 출석부 반영" })).toBeEnabled();
  expect(state.friends).toHaveBeenCalled();
  expect(state.friendsPrivate).toHaveBeenCalled();
});
