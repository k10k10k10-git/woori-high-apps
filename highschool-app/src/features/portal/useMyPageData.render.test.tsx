/** @vitest-environment jsdom */
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ retreats: vi.fn(), unsubscribe: vi.fn() }));
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
    subscribeToGroups: subscribe, subscribeToIguardGroupStaff: subscribe,
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
  subscribeToAllRetreatPeriods: () => () => {},
}));

import { useMyPageData } from "./useMyPageData";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.retreats.mockReturnValue(mocks.unsubscribe);
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
});
