/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import type { MinistryRoles } from "@/features/portal/accessPolicy";

const mocks = vi.hoisted(() => ({
  retreats: vi.fn(), periods: vi.fn(), locks: vi.fn(), toast: vi.fn(), remove: vi.fn(), request: vi.fn(),
  auth: {
    user: { uid: "fixture-admin", email: "admin@example.test", displayName: "가상 관리자" },
    loading: false, roles: { semester: "superAdmin", retreat: "superAdmin" } as MinistryRoles,
    roleError: false, retryRoles: vi.fn(),
    signIn: vi.fn(), signOut: vi.fn(),
  },
}));
vi.mock("@/context/AuthContext", () => ({ useAuth: () => mocks.auth }));
vi.mock("@/context/UIContext", () => ({ useUI: () => ({ toast: mocks.toast }) }));
vi.mock("@/lib/db", () => ({
  subscribeToRetreats: mocks.retreats, subscribeToAllRetreatPeriods: mocks.periods,
  deleteRetreat: mocks.remove, requestRetreatAccess: mocks.request,
}));
vi.mock("@/features/iguard/lib/db", () => ({ subscribeToIguardAccessLocks: mocks.locks }));
vi.mock("./BrainstormPanel", () => ({ default: () => null }));
vi.mock("./field/AdminModal", () => ({ default: () => null }));
vi.mock("@/components/LoginButton", () => ({ default: () => null }));
vi.mock("@/features/portal/VacationHome", () => ({ default: ({ retreats, selectedId, onSelect, onDelete, loadError, onRetry, headerActions }: {
  retreats: Array<{ id: string; name: string }>; selectedId: string | null; onSelect: (id: string) => void;
  onDelete: (id: string, name: string) => void;
  loadError: string | null; onRetry: () => void; headerActions: ReactNode;
}) => <main>
  <h1>수련회 목록</h1>
  {headerActions}
  {loadError && <div role="alert">{loadError}<button onClick={onRetry}>다시 불러오기</button></div>}
  {retreats.length === 0 && <p>아직 수련회가 없습니다</p>}
  <span data-testid="selected-retreat">{selectedId}</span>
  {retreats.map((retreat) => <button key={retreat.id} onClick={() => onSelect(retreat.id)}>{retreat.name}</button>)}
  {retreats.map((retreat) => <button key={`delete-${retreat.id}`} onClick={() => onDelete(retreat.id, retreat.name)}>{retreat.name} 삭제 열기</button>)}
</main> }));

import RetreatsHome from "./RetreatsHome";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.roleError = false;
  mocks.auth.roles = { semester: "superAdmin", retreat: "superAdmin" };
  mocks.retreats.mockReturnValue(() => {});
  mocks.periods.mockReturnValue(() => {});
  mocks.locks.mockReturnValue(() => {});
});
afterEach(cleanup);

it("첫 목록 응답 전에는 수련회 없음 대신 명시적인 로딩 상태를 표시한다", () => {
  render(<RetreatsHome />);
  expect(screen.getByRole("status")).toHaveTextContent("수련회 목록을 불러오고 있습니다");
  expect(screen.queryByText("아직 수련회가 없습니다")).not.toBeInTheDocument();
  expect(mocks.remove).not.toHaveBeenCalled();
  expect(mocks.request).not.toHaveBeenCalled();
});

it("성공 응답이 빈 목록일 때만 수련회 없음 화면을 연다", () => {
  render(<RetreatsHome />);
  act(() => mocks.retreats.mock.calls[0][0]([]));
  expect(screen.getByText("아직 수련회가 없습니다")).toBeInTheDocument();
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});

it("목록 실패는 빈 목록과 구분하고 기술 오류 원문 없이 재시도·도움말을 제공한다", () => {
  render(<RetreatsHome />);
  act(() => mocks.retreats.mock.calls[0][1](new Error("PERMISSION_DENIED /private/node")));
  expect(screen.getByRole("alert")).toHaveTextContent("수련회 목록을 불러오지 못했습니다");
  expect(screen.queryByText("아직 수련회가 없습니다")).not.toBeInTheDocument();
  expect(screen.queryByText(/PERMISSION_DENIED|private/)).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "다시 불러오기" })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "접속 문제 도움말" })).toHaveAttribute("href", "/library/help#connection");
  expect(mocks.toast).toHaveBeenCalledWith("수련회 목록을 불러오지 못했습니다. 다시 불러오기를 눌러 주세요.", "error");
});

it("재시도는 목록을 새로 연결하고 성공 뒤 선택과 기간·잠금 복구 경로를 유지한다", () => {
  const stop = vi.fn();
  mocks.retreats.mockReturnValue(stop);
  const list = [{ id: "first", name: "첫 수련회", year: 2026, createdAt: 2 }, { id: "second", name: "두 번째 수련회", year: 2026, createdAt: 1 }];
  render(<RetreatsHome />);
  act(() => mocks.retreats.mock.calls[0][1](new Error("연결 실패")));
  fireEvent.click(screen.getByRole("button", { name: "다시 불러오기" }));
  expect(stop).toHaveBeenCalledOnce();
  expect(mocks.retreats).toHaveBeenCalledTimes(2);
  expect(screen.getByRole("status")).toHaveTextContent("목록을 불러오고 있습니다");
  act(() => mocks.retreats.mock.calls.at(-1)![0](list));
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "두 번째 수련회" }));
  expect(screen.getByTestId("selected-retreat")).toHaveTextContent("second");
  act(() => {
    mocks.periods.mock.calls.at(-1)![2](new Error("INTERNAL /periods/node"));
    mocks.locks.mock.calls.at(-1)![2](new Error("INTERNAL /lock/node"));
  });
  expect(screen.getByRole("alert")).toHaveTextContent("수련회 일정 또는 입장 잠금 상태를 확인하지 못했습니다");
  expect(screen.queryByText(/INTERNAL|node/)).not.toBeInTheDocument();
  expect(screen.getByRole("link", { name: "접속 문제 도움말" })).toHaveAttribute("href", "/library/help#connection");
  fireEvent.click(screen.getByRole("button", { name: "다시 불러오기" }));
  act(() => mocks.retreats.mock.calls.at(-1)![0](list));
  expect(screen.getByTestId("selected-retreat")).toHaveTextContent("second");
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  expect(mocks.remove).not.toHaveBeenCalled();
  expect(mocks.request).not.toHaveBeenCalled();
});

it("직접 진입의 권한 조회 실패를 미승인과 구분하고 실제 계정 재시도를 제공한다", () => {
  mocks.auth.roleError = true;
  mocks.auth.roles = { semester: "none", retreat: "none" };
  render(<RetreatsHome />);
  expect(screen.getByRole("alert")).toHaveTextContent("행사 관리 권한을 확인하지 못했습니다");
  expect(screen.queryByRole("button", { name: "접근 요청 보내기" })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
  expect(mocks.auth.retryRoles).toHaveBeenCalledOnce();
  expect(mocks.retreats).not.toHaveBeenCalled();
  expect(mocks.periods).not.toHaveBeenCalled();
  expect(mocks.locks).not.toHaveBeenCalled();
  expect(mocks.request).not.toHaveBeenCalled();
});

it("수련회 삭제 확인은 취소에 초점을 두고 ESC 뒤 열기 버튼으로 돌아온다", () => {
  render(<RetreatsHome />);
  act(() => mocks.retreats.mock.calls[0][0]([{ id: "retreat", name: "가상 수련회", createdAt: 1 }]));
  const trigger = screen.getByRole("button", { name: "가상 수련회 삭제 열기" });
  trigger.focus();
  fireEvent.click(trigger);
  const dialog = screen.getByRole("dialog", { name: "수련회 삭제" });
  expect(dialog).toHaveAttribute("aria-modal", "true");
  expect(within(dialog).getByRole("button", { name: "취소" })).toHaveFocus();
  fireEvent.keyDown(document, { key: "Escape" });
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(trigger).toHaveFocus();
  expect(mocks.remove).not.toHaveBeenCalled();
});

it("삭제 중에는 중복 삭제·취소·배경·ESC 이탈을 막고 실패는 친절하게 안내한다", async () => {
  let fail!: (reason: Error) => void;
  mocks.remove.mockReturnValue(new Promise((_resolve, reject) => { fail = reject; }));
  render(<RetreatsHome />);
  act(() => mocks.retreats.mock.calls[0][0]([{ id: "retreat", name: "가상 수련회", createdAt: 1 }]));
  fireEvent.click(screen.getByRole("button", { name: "가상 수련회 삭제 열기" }));
  const dialog = screen.getByRole("dialog", { name: "수련회 삭제" });
  fireEvent.click(within(dialog).getByRole("button", { name: "삭제" }));
  fireEvent.click(within(dialog).getByRole("button", { name: "삭제 중…" }));
  expect(mocks.remove).toHaveBeenCalledOnce();
  expect(within(dialog).getByRole("button", { name: "취소" })).toBeDisabled();
  fireEvent.keyDown(document, { key: "Escape" });
  fireEvent.mouseDown(document.querySelector(".overlay-shell")!);
  expect(screen.getByRole("dialog")).toBeInTheDocument();
  await act(async () => fail(new Error("PERMISSION_DENIED /private/retreat")));
  expect(screen.getByRole("dialog")).toBeInTheDocument();
  expect(within(dialog).getByRole("button", { name: "취소" })).not.toBeDisabled();
  expect(mocks.toast).toHaveBeenCalledWith("수련회를 삭제하지 못했습니다. 연결 상태를 확인한 뒤 다시 시도해 주세요.", "error");
  expect(mocks.toast.mock.calls.flat().join(" ")).not.toContain("PERMISSION_DENIED");
});
