/** @vitest-environment jsdom */
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: {
    user: { uid: "my-page-user", displayName: "테스트 사용자" } as { uid: string; displayName: string } | null,
    roles: { semester: "superAdmin", retreat: "superAdmin" } as import("./accessPolicy").MinistryRoles,
    memberName: "테스트 사용자",
  },
  retreats: vi.fn(), periods: vi.fn(), groups: vi.fn(), unsubscribe: vi.fn(),
  requests: vi.fn(), semesters: vi.fn(), sessions: vi.fn(), applications: vi.fn(),
  teams: vi.fn(), trainingClasses: vi.fn(), attendance: vi.fn(), teachers: vi.fn(),
  milestones: vi.fn(), newFriends: vi.fn(),
}));
vi.mock("@/context/AuthContext", () => ({ useAuth: () => mocks.auth }));
vi.mock("@/features/semester/db", () => ({
  subscribeAllAttendance: mocks.attendance, subscribeApplications: mocks.applications,
  subscribeSemesters: mocks.semesters, subscribeSessions: mocks.sessions,
  subscribeTeams: mocks.teams, subscribeTrainingClasses: mocks.trainingClasses,
}));
vi.mock("@/features/iguard/lib/db", () => {
  const subscribe = (_id: string, success: (value: unknown[]) => void) => { success([]); return () => {}; };
  return {
    subscribeToGroups: mocks.groups, subscribeToIguardGroupStaff: (_id: string, success: (value: object) => void) => { success({}); return () => {}; },
    subscribeToIguardMovements: subscribe, subscribeToIguardPosts: subscribe,
    subscribeToIguardSchedule: subscribe, subscribeToIguardSegments: subscribe,
    subscribeToTeacherAttendances: mocks.teachers,
  };
});
vi.mock("@/features/sundayMinistry/db", () => ({ subscribeSundayNewFriends: mocks.newFriends }));
vi.mock("@/features/suggestions/db", () => ({ subscribeToMySiteRequests: mocks.requests }));
vi.mock("@/lib/db", () => ({
  subscribeToRetreats: mocks.retreats,
  subscribeToConnection: () => () => {},
  subscribeToMilestones: mocks.milestones,
  subscribeToAllRetreatPeriods: mocks.periods,
}));

import { useMyPageData } from "./useMyPageData";

beforeEach(() => {
  vi.resetAllMocks();
  mocks.auth.user = { uid: "my-page-user", displayName: "테스트 사용자" };
  mocks.auth.roles = { semester: "superAdmin", retreat: "superAdmin" };
  mocks.retreats.mockReturnValue(mocks.unsubscribe);
  for (const subscribe of [mocks.semesters, mocks.milestones, mocks.newFriends]) {
    subscribe.mockImplementation((success) => { success([]); return () => {}; });
  }
  for (const subscribe of [mocks.periods, mocks.groups, mocks.requests, mocks.sessions, mocks.applications, mocks.teams, mocks.trainingClasses, mocks.teachers]) {
    subscribe.mockImplementation((_id, success) => { success([]); return () => {}; });
  }
  mocks.attendance.mockImplementation((_id, _scope, success) => { success({}); return () => {}; });
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


const semester = (id: string, title = id) => ({ id, meta: { title, completionRule: { minRate: 0.7 }, createdAt: "2026-01-01" } });
const application = { id: "application-a", studentId: "student-a", bu: "1부", grade: 3, class: 1, name: "테스트 사용자", status: "배치", teamId: "team-a", createdAt: "2026-01-01" };

describe("useMyPageData — 계정과 현재 사역의 수명", () => {
  it("수련회 응답만으로 준비를 끝내지 않고 내 요청과 학기 하위 응답도 기다린다", () => {
    mocks.requests.mockReturnValue(() => {});
    mocks.applications.mockReturnValue(() => {});
    const { result } = renderHook(useMyPageData);
    act(() => mocks.retreats.mock.calls[0][0]([]));
    expect(result.current.loaded).toBe(false);
    act(() => mocks.semesters.mock.calls[0][0]([semester("semester-a")]));
    act(() => mocks.requests.mock.calls[0][1]([]));
    expect(result.current.loaded).toBe(false);
    act(() => mocks.applications.mock.calls[0][1]([]));
    expect(result.current.loaded).toBe(true);
  });

  it("계정 변경 직후 이전 요청과 학기를 숨기고 해제된 성공·실패 응답을 무시한다", () => {
    mocks.requests.mockReturnValue(() => {});
    mocks.semesters.mockReturnValue(() => {});
    const { result, rerender } = renderHook(useMyPageData);
    act(() => mocks.retreats.mock.calls[0][0]([]));
    act(() => mocks.requests.mock.calls[0][1]([{ id: "old-request", status: "received" }]));
    act(() => mocks.semesters.mock.calls[0][0]([semester("old-semester")]));
    expect(result.current.requests).toHaveLength(1);
    expect(result.current.currentSemester?.id).toBe("old-semester");

    mocks.auth.user = { uid: "another-user", displayName: "테스트 사용자" };
    rerender();
    expect(result.current.requests).toEqual([]);
    expect(result.current.currentSemester).toBeNull();
    expect(result.current.loaded).toBe(false);
    act(() => mocks.retreats.mock.calls[1][0]([]));
    act(() => mocks.requests.mock.calls[1][1]([{ id: "new-request", status: "resolved" }]));
    act(() => mocks.semesters.mock.calls[1][0]([]));
    act(() => mocks.requests.mock.calls[0][1]([{ id: "late-old-request", status: "received" }]));
    act(() => mocks.semesters.mock.calls[0][0]([semester("late-old-semester")]));
    act(() => mocks.retreats.mock.calls[0][1](new Error("old permission_denied")));
    expect(result.current.requests.map((request) => request.id)).toEqual(["new-request"]);
    expect(result.current.currentSemester).toBeNull();
    expect(result.current.loadError).toBeNull();
    expect(result.current.loaded).toBe(true);
  });

  it("권한이 회수되면 같은 계정의 이전 사역을 즉시 비우고 로그아웃 뒤에도 재노출하지 않는다", () => {
    const { result, rerender } = renderHook(useMyPageData);
    act(() => mocks.retreats.mock.calls[0][0]([{ id: "retreat-a", name: "이전 수련회", year: 2026, createdAt: 1 }]));
    act(() => mocks.semesters.mock.calls[0][0]([semester("semester-a")]));
    mocks.auth.roles = { semester: "none", retreat: "none" };
    rerender();
    expect(result.current.currentSemester).toBeNull();
    expect(result.current.currentRetreat).toBeNull();
    act(() => mocks.retreats.mock.calls[0][0]([{ id: "late-retreat", year: 2026, createdAt: 1 }]));
    expect(result.current.currentRetreat).toBeNull();
    mocks.auth.user = null;
    rerender();
    expect(result.current.requests).toEqual([]);
    expect(result.current.loaded).toBe(true);
  });

  it("학기 변경은 이전 배정·출석을 비우며 제목 변경은 하위 구독을 유지한다", () => {
    mocks.applications.mockReturnValue(() => {});
    const { result } = renderHook(useMyPageData);
    act(() => mocks.retreats.mock.calls[0][0]([]));
    act(() => mocks.semesters.mock.calls[0][0]([semester("semester-a")]));
    act(() => mocks.applications.mock.calls[0][1]([application]));
    expect(result.current.personalApplication?.application.id).toBe("application-a");
    act(() => mocks.semesters.mock.calls[0][0]([semester("semester-a", "이름만 변경")]));
    expect(mocks.applications).toHaveBeenCalledTimes(1);
    expect(result.current.currentSemester?.meta.title).toBe("이름만 변경");
    act(() => mocks.semesters.mock.calls[0][0]([semester("semester-b")]));
    expect(result.current.personalApplication).toBeNull();
    expect(result.current.personalAttendance).toBeNull();
    expect(result.current.loaded).toBe(false);
    act(() => mocks.applications.mock.calls[0][1]([application]));
    expect(result.current.personalApplication).toBeNull();
    act(() => mocks.applications.mock.calls[1][2](new Error("permission_denied")));
    expect(result.current.loaded).toBe(true);
    expect(result.current.loadError).toContain("학기 신청");
  });

  it("수련회가 바뀌면 이전 개인 현장 배정을 제거하고 늦게 도착한 교사 응답을 무시한다", () => {
    mocks.teachers.mockReturnValue(() => {});
    const { result } = renderHook(useMyPageData);
    act(() => mocks.retreats.mock.calls[0][0]([{ id: "a", name: "첫 행사", year: 2026, createdAt: 1 }]));
    act(() => mocks.teachers.mock.calls[0][1]([{ id: "teacher-a", name: "테스트 사용자", bu: "스탭", status: "참석" }]));
    expect(result.current.personalRetreat.matchedStaffId).toBe("teacher-a");
    act(() => mocks.retreats.mock.calls[0][0]([{ id: "b", name: "다음 행사", year: 2026, createdAt: 2 }]));
    expect(result.current.personalRetreat.matchedStaffId).toBeNull();
    act(() => mocks.teachers.mock.calls[0][1]([{ id: "teacher-a", name: "테스트 사용자", bu: "스탭", status: "참석" }]));
    expect(result.current.personalRetreat.matchedStaffId).toBeNull();
    act(() => mocks.teachers.mock.calls[1][1]([]));
    expect(result.current.loaded).toBe(true);
  });
});


it("응답 없이 다른 계정을 거쳐 돌아와도 이전 자료와 오류를 다시 표시하지 않는다", () => {
  mocks.requests.mockReturnValue(() => {});
  mocks.semesters.mockReturnValue(() => {});
  const { result, rerender } = renderHook(useMyPageData);
  act(() => mocks.requests.mock.calls[0][1]([{ id: "old-request", status: "received" }]));
  act(() => mocks.retreats.mock.calls[0][1](new Error("old permission_denied")));
  expect(result.current.requests).toHaveLength(1);
  expect(result.current.loadError).toContain("수련회 목록");
  mocks.auth.user = { uid: "another-user", displayName: "테스트 사용자" };
  rerender();
  mocks.auth.user = { uid: "my-page-user", displayName: "테스트 사용자" };
  rerender();
  expect(result.current.requests).toEqual([]);
  expect(result.current.loadError).toBeNull();
  expect(result.current.loaded).toBe(false);
});
