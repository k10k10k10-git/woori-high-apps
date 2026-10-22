/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { MinistryRoles } from "@/features/portal/accessPolicy";

const mocks = vi.hoisted(() => ({
  retreats: vi.fn(), periods: vi.fn(), retryRoles: vi.fn(),
  auth: {
    user: { uid: "fixture-admin", email: "admin@example.test" }, loading: false, roleError: false,
    roles: { semester: "superAdmin", retreat: "superAdmin" } as MinistryRoles,
    signIn: vi.fn(),
  },
}));
vi.mock("@/context/AuthContext", () => ({ useAuth: () => ({ ...mocks.auth, retryRoles: mocks.retryRoles }) }));
vi.mock("@/lib/db", () => ({ subscribeToRetreats: mocks.retreats, subscribeToAllRetreatPeriods: mocks.periods }));
vi.mock("@/features/portal/VacationHome", () => ({ default: ({ retreats, selectedId, onSelect, loadError, onRetry }: {
  retreats: Array<{ id: string; name: string }>; selectedId: string | null; onSelect: (id: string) => void; loadError: string | null; onRetry: () => void;
}) => <main>
  <h1>프로그램 준비 목록</h1>
  {retreats.length === 0 && <p>아직 수련회가 없습니다</p>}
  <span data-testid="selection">{selectedId}</span>
  {retreats.map((retreat) => <button key={retreat.id} onClick={() => onSelect(retreat.id)}>{retreat.name}</button>)}
  {loadError && <div role="alert">{loadError}<button onClick={onRetry}>다시 불러오기</button></div>}
</main> }));

import ProgramsHome from "./ProgramsHome";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.user = { uid: "fixture-admin", email: "admin@example.test" };
  mocks.auth.roles = { semester: "superAdmin", retreat: "superAdmin" };
  mocks.auth.roleError = false;
  mocks.retreats.mockReturnValue(() => {});
  mocks.periods.mockReturnValue(() => {});
});
afterEach(cleanup);

it("첫 응답 전 로딩과 성공한 빈 목록을 구분한다", () => {
  render(<ProgramsHome />);
  expect(screen.getByRole("status")).toHaveTextContent("프로그램 준비 목록을 불러오고 있습니다");
  expect(screen.queryByText("아직 수련회가 없습니다")).not.toBeInTheDocument();
  act(() => mocks.retreats.mock.calls[0][0]([]));
  expect(screen.getByText("아직 수련회가 없습니다")).toBeInTheDocument();
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
});

it("목록 실패에는 한국어 회복 안내와 실제 재구독을 제공한다", () => {
  const stop = vi.fn();
  mocks.retreats.mockReturnValue(stop);
  render(<ProgramsHome />);
  const oldSuccess = mocks.retreats.mock.calls[0][0];
  act(() => mocks.retreats.mock.calls[0][1](new Error("PERMISSION_DENIED /private/node")));
  expect(screen.getByRole("alert")).toHaveTextContent("프로그램 준비 목록을 불러오지 못했습니다");
  expect(screen.queryByText(/PERMISSION_DENIED|private/)).not.toBeInTheDocument();
  expect(screen.queryByText("아직 수련회가 없습니다")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "다시 불러오기" }));
  expect(stop).toHaveBeenCalledOnce();
  expect(mocks.retreats).toHaveBeenCalledTimes(2);
  act(() => oldSuccess([{ id: "obsolete", name: "이전 구독" }]));
  expect(screen.getByRole("status")).toBeInTheDocument();
  act(() => mocks.retreats.mock.calls.at(-1)![0]([]));
  expect(screen.getByText("아직 수련회가 없습니다")).toBeInTheDocument();
});

it("일정 재시도 후 같은 수련회 선택을 유지하고 이전 일정 오류는 무시한다", () => {
  const list = [{ id: "first", name: "첫 수련회", createdAt: 2 }, { id: "second", name: "두 번째 수련회", createdAt: 1 }];
  render(<ProgramsHome />);
  act(() => mocks.retreats.mock.calls[0][0](list));
  fireEvent.click(screen.getByRole("button", { name: "두 번째 수련회" }));
  const oldFailure = mocks.periods.mock.calls.at(-1)![2];
  act(() => oldFailure(new Error("INTERNAL /periods")));
  expect(screen.getByRole("alert")).toHaveTextContent("수련회 일정을 확인하지 못했습니다");
  fireEvent.click(screen.getByRole("button", { name: "다시 불러오기" }));
  act(() => {
    mocks.retreats.mock.calls.at(-1)![0](list);
    mocks.periods.mock.calls.at(-1)![1]([]);
    oldFailure(new Error("이전 오류"));
  });
  expect(screen.getByTestId("selection")).toHaveTextContent("second");
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});

it("권한 조회 실패에는 승인 요청 대신 계정 재시도를 제공하고 업무 구독을 열지 않는다", () => {
  mocks.auth.roleError = true;
  mocks.auth.roles = { semester: "none", retreat: "none" };
  render(<ProgramsHome />);
  expect(screen.getByRole("alert")).toHaveTextContent("프로그램 준비 권한을 확인하지 못했습니다");
  fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
  expect(mocks.retryRoles).toHaveBeenCalledOnce();
  expect(mocks.retreats).not.toHaveBeenCalled();
  expect(mocks.periods).not.toHaveBeenCalled();
});

it("접근 권한이 없는 계정에는 담당자 문의를 안내하고 업무 구독을 열지 않는다", () => {
  mocks.auth.roles = { semester: "none", retreat: "none" };
  render(<ProgramsHome />);
  expect(screen.getByRole("heading")).toHaveTextContent("프로그램 준비 접근 권한이 필요합니다");
  expect(screen.getByRole("link", { name: "계정 확인·담당자 문의 방법" })).toHaveAttribute("href", "/library/help#access");
  expect(mocks.retreats).not.toHaveBeenCalled();
});

it("계정 교체에는 이전 수련회 목록과 선택을 다시 사용하지 않는다", () => {
  const view = render(<ProgramsHome />);
  act(() => mocks.retreats.mock.calls[0][0]([{ id: "old", name: "이전 계정 수련회", createdAt: 1 }]));
  mocks.auth.user = { uid: "another-admin", email: "another@example.test" };
  view.rerender(<ProgramsHome />);
  expect(screen.getByRole("status")).toBeInTheDocument();
  expect(screen.queryByText("이전 계정 수련회")).not.toBeInTheDocument();
});


it("프로그램 홈도 수련회부터 직접 선택하며 마지막 등록 항목을 임의로 고르지 않는다", () => {
  render(<ProgramsHome />);
  act(() => mocks.retreats.mock.calls[0][0]([{ id: "first", name: "첫 수련회", year: 2026, createdAt: 1 }]));
  expect(screen.getByTestId("selection")).toBeEmptyDOMElement();
});
