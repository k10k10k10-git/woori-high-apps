/** @vitest-environment jsdom */
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useRetreatPinGate } from "./useRetreatPinGate";
const mocks = vi.hoisted(() => ({ subscribe: vi.fn(), unsubscribe: vi.fn() }));
vi.mock("@/features/iguard/lib/db", () => ({ subscribeToIguardAccessLock: mocks.subscribe }));
beforeEach(() => { vi.clearAllMocks(); mocks.subscribe.mockReturnValue(mocks.unsubscribe); });
afterEach(cleanup);

it("PIN 조회 실패를 로딩과 구분하고 재시도하며 이전 결과로 잠금을 풀지 않는다", () => {
  const roles = { semester: "none", retreat: "fieldStaff" } as const;
  const { result } = renderHook(() => useRetreatPinGate("retreat", { enabled: true, roles }));
  const first = mocks.subscribe.mock.calls[0];
  act(() => first[2](new Error("PERMISSION_DENIED secret/path")));
  expect(result.current.lockError).toContain("다시 불러오기");
  expect(result.current.lockError).not.toContain("secret/path");
  act(() => result.current.retryLock());
  expect(mocks.unsubscribe).toHaveBeenCalledOnce();
  expect(mocks.subscribe).toHaveBeenCalledTimes(2);
  expect(result.current.lockError).toBeNull();
  expect(result.current.unlocked).toBe(false);
  act(() => first[1](null));
  expect(result.current.unlocked).toBe(false);
  act(() => mocks.subscribe.mock.calls[1][1](null));
  expect(result.current.unlocked).toBe(true);
});

it("권한 없는 화면에서는 PIN도 구독하지 않는다", () => {
  renderHook(() => useRetreatPinGate("retreat", { enabled: false, roles: { semester: "none", retreat: "none" } }));
  expect(mocks.subscribe).not.toHaveBeenCalled();
});
