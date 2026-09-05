/** @vitest-environment jsdom */
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ retreats: vi.fn(), periods: vi.fn(), groups: vi.fn(), unsubscribe: vi.fn() }));
vi.mock("@/context/AuthContext", () => {
  const user = { uid: "my-page-user" };
  const roles = { semester: "superAdmin", retreat: "superAdmin" };
  return { useAuth: () => ({ user, roles, memberName: "테스트 사용자" }) };
});
vi.mock("@/features/semester/db", () => {
  const subscribe = () => () => {};
  return {
    subscribeAllAttendance: subscribe, subscribeApplications: subscribe,
    subscribeSemesters: subscribe, subscribeSessions: subscribe,
    subscribeTeams: subscribe, subscribeTrainingClasses: subscribe,
  };
});
vi.mock("@/features/iguard/lib/db", () => {
  const subscribe = () => () => {};
  return {
    subscribeToGroups: mocks.groups, subscribeToIguardGroupStaff: subscribe,
    subscribeToIguardMovements: subscribe, subscribeToIguardPosts: subscribe,
    subscribeToIguardSchedule: subscribe, subscribeToIguardSegments: subscribe,
    subscribeToTeacherAttendances: subscribe,
  };
});
vi.mock("@/features/sundayMinistry/db", () => ({ subscribeSundayNewFriends: () => () => {} }));
vi.mock("@/features/suggestions/db", () => ({ subscribeToMySiteRequests: () => () => {} }));
vi.mock("@/lib/db", () => ({
  subscribeToRetreats: mocks.retreats,
  subscribeToConnection: () => () => {},
  subscribeToMilestones: () => () => {},
  subscribeToAllRetreatPeriods: mocks.periods,
}));

import { useMyPageData } from "./useMyPageData";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.retreats.mockReturnValue(mocks.unsubscribe);
  mocks.periods.mockReturnValue(() => {});
  mocks.groups.mockReturnValue(() => {});
});
afterEach(cleanup);

describe("useMyPageData — 목록 첫 응답과 오류", () => {
  it("목록 읽기가 거부되면 로딩을 끝내고 오류를 표시한다", () => {
    const { result, unmount } = renderHook(useMyPageData);
    expect(result.current.loaded).toBe(false);
    act(() => mocks.retreats.mock.calls[0][1](new Error("permission_denied")));
    expect(result.current.loaded).toBe(true);
    expect(result.current.loadError).toContain("수련회 목록");
    unmount();
    expect(mocks.unsubscribe).toHaveBeenCalledOnce();
  });

  it("빈 목록도 로딩을 끝내고 성공 응답은 해당 오류를 지운다", () => {
    const { result } = renderHook(useMyPageData);
    act(() => mocks.retreats.mock.calls[0][1](new Error("permission_denied")));
    act(() => mocks.retreats.mock.calls[0][0]([]));
    expect(result.current.loaded).toBe(true);
    expect(result.current.loadError).toBeNull();
  });

  it("수련회 이름 50회 갱신은 기간·현장 구독을 다시 만들지 않고 제목만 갱신한다", () => {
    const { result } = renderHook(useMyPageData);
    const retreat = { id: "a", name: "처음 이름", year: 2026, createdAt: 1 };
    act(() => mocks.retreats.mock.calls[0][0]([retreat]));
    for (let index = 1; index <= 50; index += 1) {
      act(() => mocks.retreats.mock.calls[0][0]([{ ...retreat, name: `수정 ${index}` }]));
    }
    expect(result.current.currentRetreat?.name).toBe("수정 50");
    // 최초 빈 목록 1회 + 실제 ID 목록 1회만 연결한다.
    expect(mocks.periods).toHaveBeenCalledTimes(2);
    expect(mocks.groups).toHaveBeenCalledTimes(1);
  });

  it("ID 순서 변화는 기간 우선순위에 반영하고 실제 현재 수련회가 바뀔 때만 현장을 재구독한다", () => {
    const { result } = renderHook(useMyPageData);
    const first = { id: "a", name: "첫 행사", year: 2026, createdAt: 2 };
    const second = { id: "b", name: "둘째 행사", year: 2026, createdAt: 1 };
    act(() => mocks.retreats.mock.calls[0][0]([first, second]));
    act(() => mocks.retreats.mock.calls[0][0]([second, { ...first, createdAt: 0 }]));
    expect(result.current.currentRetreat?.id).toBe("b");
    expect(mocks.periods).toHaveBeenCalledTimes(3);
    expect(mocks.periods.mock.calls[2][0]).toEqual(["b", "a"]);
    expect(mocks.groups.mock.calls.map(([id]) => id)).toEqual(["a", "b"]);
    act(() => mocks.retreats.mock.calls[0][0]([second]));
    expect(mocks.periods).toHaveBeenCalledTimes(4);
    expect(mocks.periods.mock.calls[3][0]).toEqual(["b"]);
    expect(mocks.groups).toHaveBeenCalledTimes(2);
  });
});
