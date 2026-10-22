/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MinistryRoles } from "./accessPolicy";
import type { SharedCalendarItem } from "./SharedMinistryCalendar";

const mocks = vi.hoisted(() => ({ saveMilestone: vi.fn(), uid: "home-user", loading: false, router: { replace: vi.fn() }, semesters: vi.fn(), sessions: vi.fn(), milestones: vi.fn(), retreats: vi.fn(), periods: vi.fn(), unsubscribe: vi.fn(), retryRoles: vi.fn(), roleError: false, roles: { semester: "superAdmin", retreat: "superAdmin" } as MinistryRoles }));
vi.mock("next/navigation", () => ({ useRouter: () => mocks.router }));
vi.mock("@/context/AuthContext", () => {
  const user = { get uid() { return mocks.uid; } };
  return { useAuth: () => ({ user, roles: mocks.roles, loading: mocks.loading, roleError: mocks.roleError, retryRoles: mocks.retryRoles, memberName: "테스트" }) };
});
vi.mock("@/features/landing/LandingPage", () => ({ default: () => null }));
vi.mock("@/features/semester/db", () => ({
  subscribeSemesters: mocks.semesters, subscribeSessions: mocks.sessions,
}));
vi.mock("@/lib/db", () => ({
  subscribeToRetreats: mocks.retreats, subscribeToAllRetreatPeriods: mocks.periods,
  subscribeToMilestones: mocks.milestones,
  deleteMilestone: vi.fn(), saveMilestone: mocks.saveMilestone, updateMilestone: vi.fn(),
}));
vi.mock("./SharedMinistryCalendar", async (importOriginal) => ({
  ...await importOriginal<typeof import("./SharedMinistryCalendar")>(),
  default: ({ items, canEdit, onAdd }: { items: SharedCalendarItem[]; canEdit: boolean; onAdd: (date: string) => void }) => <><output data-testid="calendar-items">{JSON.stringify(items)}</output>{canEdit && <button type="button" onClick={() => onAdd("2026-10-06")}>합성 일정 추가</button>}</>,
}));

import PortalHome from "./PortalHome";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.roles = { semester: "superAdmin", retreat: "superAdmin" };
  mocks.roleError = false;
  mocks.loading = false;
  mocks.uid = "home-user";
  sessionStorage.clear();
  mocks.semesters.mockReturnValue(() => {});
  mocks.sessions.mockReturnValue(() => {});
  mocks.milestones.mockReturnValue(() => {});
  mocks.retreats.mockReturnValue(mocks.unsubscribe);
  mocks.periods.mockReturnValue(() => {});
});

it("역할 조회 실패는 권한 미배정 안내로 오인시키지 않고 재시도한다", () => {
  mocks.roles = { semester: "none", retreat: "none" };
  mocks.roleError = true;
  render(<PortalHome />);
  expect(screen.getByRole("heading", { name: "담당 사역을 확인하지 못했습니다" })).toBeInTheDocument();
  expect(screen.queryByText("접근 승인이 필요합니다")).not.toBeInTheDocument();
  screen.getByRole("button", { name: "다시 시도" }).click();
  expect(mocks.retryRoles).toHaveBeenCalledOnce();
  expect(screen.getByRole("link", { name: "접속 문제 도움말" })).toHaveAttribute("href", "/library/help#connection");
});
afterEach(cleanup);

it.each(["account", "roles"])("공유 일정 작성 중 %s 전환은 이전 초안을 폐기한다", (change) => {
  const { rerender } = render(<PortalHome />);
  act(() => {
    mocks.milestones.mock.calls[0][0]([]);
    mocks.retreats.mock.calls[0][0]([]);
    mocks.semesters.mock.calls[0][0]([]);
    mocks.periods.mock.calls.at(-1)![1]([]);
  });
  fireEvent.click(screen.getByText("전체 일정 보기·관리"));
  fireEvent.click(screen.getByRole("button", { name: "합성 일정 추가" }));
  fireEvent.change(screen.getByPlaceholderText("예: 사역팀 모임 준비"), { target: { value: "이전 계정 초안" } });
  expect(screen.getByRole("dialog", { name: "공유 일정 추가" })).toBeInTheDocument();
  if (change === "account") mocks.uid = "another-user";
  else mocks.roles = { semester: "staff", retreat: "none" };
  rerender(<PortalHome />);
  expect(screen.queryByRole("dialog", { name: "공유 일정 추가" })).not.toBeInTheDocument();
  expect(screen.queryByDisplayValue("이전 계정 초안")).not.toBeInTheDocument();
});

it("미승인 스탭은 담당자 안내와 일반 사용법을 먼저 보고 현장 요청을 구분한다", () => {
  mocks.roles = { semester: "none", retreat: "none" };
  render(<PortalHome />);
  expect(screen.getByRole("heading", { name: "접근 승인이 필요합니다" })).toBeInTheDocument();
  const guide = screen.getByRole("link", { name: "사용법·권한 안내 보기" });
  expect(guide).toHaveAttribute("href", "/library/help#access");
  expect(screen.getByText(/담당 팀장·교역자에게 로그인 이메일과 맡을 팀/)).toBeInTheDocument();
  const fieldRequest = screen.getByText("수련회 현장 접근 요청");
  expect(fieldRequest.closest("details")).not.toHaveAttribute("open");
  expect(screen.getByRole("link", { name: "승인·팀 연결 문의하기" })).toHaveAttribute("href", "/help/feedback");
});

describe("PortalHome — 기간 구독과 표시 metadata 분리", () => {
  it("수련회 목록과 기간의 첫 응답 전에는 기록 없음으로 확정하지 않는다", () => {
    render(<PortalHome />);
    expect(screen.queryByText("등록된 수련회가 없습니다")).not.toBeInTheDocument();
    act(() => mocks.retreats.mock.calls[0][0]([{ id: "a", name: "합성 행사", year: 2026, createdAt: 1 }]));
    expect(screen.queryByText("등록된 수련회가 없습니다")).not.toBeInTheDocument();
    expect(screen.getByText("수련회를 확인하는 중입니다…")).toBeInTheDocument();
    act(() => mocks.periods.mock.calls[1][1]([]));
    expect(screen.getByText("2026년 합성 행사")).toBeInTheDocument();
  });

  it("수련회 이름만 바뀌면 일정 구독은 유지하고 카드·캘린더 이름은 즉시 갱신한다", () => {
    render(<PortalHome />);
    const retreat = { id: "a", name: "처음 이름", year: 2026, createdAt: 1 };
    act(() => mocks.retreats.mock.calls[0][0]([retreat]));
    act(() => mocks.periods.mock.calls[1][1]([
      { id: "period", retreatId: "a", startDate: "2026-08-01", endDate: "2026-08-03" },
    ]));
    for (let index = 1; index <= 50; index += 1) {
      act(() => mocks.retreats.mock.calls[0][0]([{ ...retreat, name: `수정 ${index}` }]));
    }
    expect(mocks.periods).toHaveBeenCalledTimes(2);
    expect(screen.getByText("2026년 수정 50")).toBeInTheDocument();
    expect(screen.getByTestId("calendar-items")).toHaveTextContent('"title":"수정 50"');
  });

  it("수련회 추가·삭제는 바뀐 ID 집합으로 기간을 다시 구독한다", () => {
    render(<PortalHome />);
    const first = { id: "a", name: "첫 행사", year: 2026, createdAt: 1 };
    const second = { id: "b", name: "둘째 행사", year: 2027, createdAt: 2 };
    act(() => mocks.retreats.mock.calls[0][0]([first]));
    act(() => mocks.retreats.mock.calls[0][0]([second, first]));
    act(() => mocks.retreats.mock.calls[0][0]([second]));
    expect(mocks.periods.mock.calls.map(([ids]) => ids)).toEqual([[], ["a"], ["b", "a"], ["b"]]);
  });
});

it("학기만 조회하는 스탭의 홈에는 접근할 수 없는 팀 운영 링크를 표시하지 않는다", () => {
  mocks.roles = { semester: "staff", retreat: "fieldStaff" };
  render(<PortalHome />);
  expect(screen.queryAllByRole("link").filter((link) => link.getAttribute("href")?.startsWith("/teams"))).toHaveLength(0);
});
it("찬양팀 홈은 맡은 팀의 업무와 직접 진입 경로를 안내한다", () => {
  mocks.roles = { semester: "praise", retreat: "none" };
  render(<PortalHome />);
  expect(screen.getByRole("heading", { name: "찬양팀 업무 시작" })).toBeInTheDocument();
  expect(screen.getAllByRole("link").filter((link) => link.getAttribute("href")?.startsWith("/teams")).every((link) => link.getAttribute("href") === "/teams/praise")).toBe(true);
  expect(screen.queryByRole("heading", { name: "행정·바나바" })).not.toBeInTheDocument();
});

it("홈 데이터 재시도는 거부된 구독을 해제하고 성공한 경로의 오류를 지운다", () => {
  render(<PortalHome />);
  act(() => mocks.retreats.mock.calls[0][1](new Error("수련회 연결 실패")));
  expect(screen.getByRole("button", { name: "다시 불러오기" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "다시 불러오기" }));
  expect(mocks.unsubscribe).toHaveBeenCalledOnce();
  expect(mocks.retreats).toHaveBeenCalledTimes(2);
  act(() => mocks.retreats.mock.calls[1][0]([]));
  expect(screen.queryByRole("button", { name: "다시 불러오기" })).not.toBeInTheDocument();
});

it.each(["loading", "roleError"] as const)("%s 중에는 기존 역할이 남아 있어도 업무 구독과 팀 자동 이동을 시작하지 않는다", (state) => {
  mocks.roles = { semester: "praise", retreat: "none" };
  mocks[state] = true;
  render(<PortalHome />);
  expect(mocks.retreats).not.toHaveBeenCalled();
  expect(mocks.periods).not.toHaveBeenCalled();
  expect(mocks.semesters).not.toHaveBeenCalled();
  expect(mocks.milestones).not.toHaveBeenCalled();
  expect(mocks.router.replace).not.toHaveBeenCalled();
});

it("홈은 내 업무 진입을 한 번만 제공하고 전체 일정 관리는 접어서 유지한다", () => {
  mocks.roles = { semester: "praise", retreat: "none" };
  render(<PortalHome />);
  expect(screen.getAllByRole("link").filter((link) => link.getAttribute("href") === "/teams/praise")).toHaveLength(1);
  const summary = screen.getByText("전체 일정 보기·관리");
  expect(summary.closest("details")).not.toHaveAttribute("open");
  fireEvent.click(summary);
  expect(summary.closest("details")).toHaveAttribute("open");
  expect(screen.queryByRole("heading", { name: "내 담당 사역" })).not.toBeInTheDocument();
});

it("오늘의 공유 일정과 다음 일정을 나누며 미래 일정은 한 번만 표시한다", async () => {
  const { seoulDateKey } = await import("./dailyMinistryMessage");
  const today = seoulDateKey();
  const tomorrow = seoulDateKey(new Date(Date.now() + 86_400_000));
  render(<PortalHome />);
  act(() => mocks.retreats.mock.calls[0][0]([]));
  act(() => mocks.periods.mock.calls[0][1]([]));
  act(() => mocks.semesters.mock.calls[0][0]([]));
  act(() => mocks.milestones.mock.calls[0][0]([
    { id: "today", title: "오늘 합성 준비", targetDate: today, sourceSite: "highschool-main", done: false },
    { id: "next", title: "다음 합성 준비", targetDate: tomorrow, sourceSite: "highschool-main", done: false },
  ]));
  expect(within(screen.getByRole("region", { name: "오늘의 공유 일정" })).getByText("오늘 합성 준비")).toBeInTheDocument();
  expect(within(screen.getByRole("region", { name: "다음 일정" })).getByText("다음 합성 준비")).toBeInTheDocument();
  expect(within(screen.getByRole("region", { name: "오늘의 공유 일정" })).queryByText("다음 합성 준비")).not.toBeInTheDocument();
});

it("개인 업무와 공유 일정을 구분하고 제공된 실제 업무 링크만 표시한다", async () => {
  const { seoulDateKey } = await import("./dailyMinistryMessage");
  const today = seoulDateKey();
  render(<PortalHome />);
  act(() => {
    mocks.retreats.mock.calls[0][0]([]);
    mocks.periods.mock.calls[0][1]([]);
    mocks.semesters.mock.calls[0][0]([{ id: "2026-2", meta: { title: "합성 학기", startDate: today, endDate: today } }]);
    mocks.milestones.mock.calls[0][0]([{ id: "shared", title: "공유 참고 준비", targetDate: today, sourceSite: "portal-main", done: false }]);
  });
  act(() => mocks.sessions.mock.calls.at(-1)![1]([{ id: "meeting", date: today, type: "정규", label: "실제 업무가 있는 학기 모임" }]));
  expect(screen.getByRole("region", { name: "내 업무" })).toBeInTheDocument();
  const shared = within(screen.getByRole("region", { name: "오늘의 공유 일정" }));
  expect(shared.getByText("고등부가 함께 보는 일정과 미완료 준비입니다.")).toBeInTheDocument();
  expect(shared.getByText("공유 참고 준비").closest("a")).toBeNull();
  expect(shared.getByText("공유 준비 · 고등부 메인")).toBeInTheDocument();
  expect(shared.getByRole("link", { name: /실제 업무가 있는 학기 모임/ })).toHaveAttribute("href", "/operations/semesters/2026-2/overview");
  expect(shared.getByText("공유 일정 · 훈련·사역팀")).toBeInTheDocument();
});

it("다시 불러오기를 누른 뒤 해제된 목록 응답은 최신 목록과 오류를 덮지 않는다", () => {
  render(<PortalHome />);
  const previous = mocks.retreats.mock.calls[0];
  act(() => previous[1](new Error("합성 오류")));
  fireEvent.click(screen.getByRole("button", { name: "다시 불러오기" }));
  act(() => mocks.retreats.mock.calls[1][0]([{ id: "new", name: "최신 합성 행사", year: 2026, createdAt: 1 }]));
  act(() => mocks.periods.mock.calls.at(-1)?.[1]([]));
  act(() => previous[0]([{ id: "old", name: "이전 합성 행사", year: 2026, createdAt: 0 }]));
  act(() => previous[1](new Error("늦은 합성 오류")));
  expect(screen.getByText("2026년 최신 합성 행사")).toBeInTheDocument();
  expect(screen.queryByText("2026년 이전 합성 행사")).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "다시 불러오기" })).not.toBeInTheDocument();
});


it("공유 일정 저장 연타는 한 번만 기록하고 실패하면 입력과 재시도를 유지한다", async () => {
  let rejectSave!: (error: Error) => void;
  mocks.saveMilestone.mockImplementationOnce(() => new Promise((_, reject) => { rejectSave = reject; }));
  render(<PortalHome />);
  act(() => {
    mocks.milestones.mock.calls[0][0]([]);
    mocks.retreats.mock.calls[0][0]([]);
    mocks.semesters.mock.calls[0][0]([]);
    mocks.periods.mock.calls.at(-1)![1]([]);
  });
  fireEvent.click(screen.getByText("전체 일정 보기·관리"));
  fireEvent.click(screen.getByRole("button", { name: "합성 일정 추가" }));
  const input = screen.getByPlaceholderText("예: 사역팀 모임 준비");
  fireEvent.change(input, { target: { value: "한 번만 저장" } });
  fireEvent.keyDown(input, { key: "Enter" });
  fireEvent.keyDown(input, { key: "Enter" });
  expect(mocks.saveMilestone).toHaveBeenCalledTimes(1);
  const dialog = screen.getByRole("dialog", { name: "공유 일정 추가" });
  expect(within(dialog).getByRole("button", { name: "저장 중…" })).toBeDisabled();
  fireEvent.keyDown(document, { key: "Escape" });
  expect(dialog).toBeInTheDocument();
  await act(async () => rejectSave(new Error("sensitive service error")));
  expect(input).toHaveValue("한 번만 저장");
  expect(within(dialog).getByRole("alert")).toHaveTextContent("입력한 내용은 유지됩니다");
  expect(dialog).not.toHaveTextContent("sensitive service error");
  mocks.saveMilestone.mockResolvedValueOnce("saved");
  await act(async () => fireEvent.click(within(dialog).getByRole("button", { name: "저장" })));
  expect(mocks.saveMilestone).toHaveBeenCalledTimes(2);
  expect(screen.queryByRole("dialog", { name: "공유 일정 추가" })).not.toBeInTheDocument();
});
