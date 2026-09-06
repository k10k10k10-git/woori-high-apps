/** @vitest-environment jsdom */
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MinistryRoles } from "./accessPolicy";
import type { SharedCalendarItem } from "./SharedMinistryCalendar";

const mocks = vi.hoisted(() => ({ retreats: vi.fn(), periods: vi.fn(), unsubscribe: vi.fn(), roles: { semester: "superAdmin", retreat: "superAdmin" } as MinistryRoles }));
vi.mock("@/context/AuthContext", () => {
  const user = { uid: "home-user" };
  return { useAuth: () => ({ user, roles: mocks.roles, loading: false, memberName: "테스트" }) };
});
vi.mock("@/features/landing/LandingPage", () => ({ default: () => null }));
vi.mock("@/features/semester/db", () => ({
  subscribeSemesters: () => () => {}, subscribeSessions: () => () => {},
}));
vi.mock("@/lib/db", () => ({
  subscribeToRetreats: mocks.retreats, subscribeToAllRetreatPeriods: mocks.periods,
  subscribeToMilestones: () => () => {},
  deleteMilestone: vi.fn(), saveMilestone: vi.fn(), updateMilestone: vi.fn(),
}));
vi.mock("./SharedMinistryCalendar", async (importOriginal) => ({
  ...await importOriginal<typeof import("./SharedMinistryCalendar")>(),
  default: ({ items }: { items: SharedCalendarItem[] }) => <output data-testid="calendar-items">{JSON.stringify(items)}</output>,
}));

import PortalHome from "./PortalHome";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.roles = { semester: "superAdmin", retreat: "superAdmin" };
  mocks.retreats.mockReturnValue(mocks.unsubscribe);
  mocks.periods.mockReturnValue(() => {});
});
afterEach(cleanup);

describe("PortalHome — 기간 구독과 표시 metadata 분리", () => {
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
    expect(screen.getByRole("heading", { name: "2026년 수정 50" })).toBeInTheDocument();
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
  expect(screen.queryAllByRole("link").filter((link) => link.getAttribute("href")?.startsWith("/sunday-ministry"))).toHaveLength(0);
});
it("찬양팀 홈은 맡은 팀의 업무와 직접 진입 경로를 안내한다", () => {
  mocks.roles = { semester: "praise", retreat: "none" };
  render(<PortalHome />);
  expect(screen.getByRole("heading", { name: "찬양팀" })).toBeInTheDocument();
  expect(screen.getAllByRole("link").filter((link) => link.getAttribute("href")?.startsWith("/sunday-ministry")).every((link) => link.getAttribute("href") === "/sunday-ministry/praise")).toBe(true);
  expect(screen.queryByRole("heading", { name: "행정·바나바" })).not.toBeInTheDocument();
});
