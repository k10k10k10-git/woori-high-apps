/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  mounted: [] as string[],
  subscribe: vi.fn(), router: { push: vi.fn(), prefetch: vi.fn() }, user: { uid: "admin" }, retryRoles: vi.fn(), roleError: false, roles: { semester: "superAdmin", retreat: "superAdmin" },
}));
vi.mock("next/navigation", () => ({ useRouter: () => mocks.router, useParams: () => ({ id: "retreat-fixture" }) }));
vi.mock("next/dynamic", () => ({ default: (load: () => unknown) => () => { mocks.mounted.push(String(load)); return null; } }));
vi.mock("@/context/AuthContext", () => ({ useAuth: () => ({ user: mocks.user, loading: false, roleError: mocks.roleError, retryRoles: mocks.retryRoles, roles: mocks.roles }) }));
vi.mock("@/context/UIContext", () => ({ useUI: () => ({ toast: vi.fn() }) }));
vi.mock("@/features/portal/useRetreatPinGate", () => ({ useRetreatPinGate: () => ({ lock: null, unlocked: true, lockError: null, markUnlocked: vi.fn() }) }));
vi.mock("@/lib/db", () => ({ subscribeToRetreat: mocks.subscribe, updateRetreat: vi.fn() }));
vi.mock("@/lib/retreatWorkspaceCache", () => ({ getRetreatWorkspaceSnapshot: () => null, mergeRetreatWorkspaceSnapshot: vi.fn() }));
vi.mock("./RetreatPrepSummary", () => ({ default: () => null }));
vi.mock("./ParticipantsTab", () => ({ default: () => null }));

import RetreatPageClient from "./RetreatPageClient";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.mounted.length = 0;
  mocks.roles = { semester: "superAdmin", retreat: "superAdmin" };
  mocks.roleError = false;
  mocks.subscribe.mockReturnValue(() => {});
});
afterEach(cleanup);

it("조회 실패는 기록 없음과 구별하고 같은 화면에서 재시도한다", () => {
  render(<RetreatPageClient />);
  act(() => mocks.subscribe.mock.calls[0][2](new Error("network unavailable")));
  expect(screen.getByRole("heading", { name: "수련회 정보를 불러오지 못했습니다" })).toBeInTheDocument();
  expect(screen.queryByText("수련회를 찾을 수 없습니다.")).not.toBeInTheDocument();
  act(() => screen.getByRole("button", { name: "다시 시도" }).click());
  expect(mocks.subscribe).toHaveBeenCalledTimes(2);
  act(() => mocks.subscribe.mock.calls[1][1](null));
  expect(screen.getByText("수련회를 찾을 수 없습니다.")).toBeInTheDocument();
});

it("데이터 권한 거부와 화면 접근 권한 부재를 각각 안내한다", () => {
  const { rerender } = render(<RetreatPageClient />);
  act(() => mocks.subscribe.mock.calls[0][2](new Error("permission_denied")));
  expect(screen.getByRole("heading", { name: "수련회 조회 권한을 확인해 주세요" })).toBeInTheDocument();
  mocks.roles = { semester: "none", retreat: "none" };
  mocks.roleError = true;
  rerender(<RetreatPageClient />);
  expect(screen.getByRole("heading", { name: "수련회 행정 권한을 확인하지 못했습니다." })).toBeInTheDocument();
  screen.getByRole("button", { name: "다시 시도" }).click();
  expect(mocks.retryRoles).toHaveBeenCalledOnce();
  mocks.roleError = false;
  rerender(<RetreatPageClient />);
  expect(screen.getByRole("heading", { name: "수련회 행정 접근 권한이 필요합니다." })).toBeInTheDocument();
});

it("조회 역할에도 민감 탭을 표시하지만 선택해도 민감 화면을 마운트하지 않는다", () => {
  mocks.roles = { semester: "none", retreat: "leader" };
  render(<RetreatPageClient />);
  act(() => mocks.subscribe.mock.calls[0][1]({ id: "retreat-fixture", name: "가상 수련회", year: 2026 }));
  expect(screen.getByRole("tab", { name: "취소·환불 · 권한 필요" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("tab", { name: "취소·환불 · 권한 필요" }));
  expect(screen.getByRole("heading", { name: "민감 행정 기록 접근 권한이 필요합니다." })).toBeInTheDocument();
  expect(mocks.mounted.some(name => /CancellationTab|InsuranceTab|MedicalLogTab|UnmatchedPaymentsTab/.test(name))).toBe(false);
});
