/** @vitest-environment jsdom */
import type { AnchorHTMLAttributes } from "react";
import { act, cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SiteRequest } from "@/features/suggestions/siteRequest";
import type { useMyPageData } from "./useMyPageData";

type PersonalPageFixture = Omit<ReturnType<typeof useMyPageData>, "currentSemester"> & {
  currentSemester: ReturnType<typeof useMyPageData>["currentSemester"] | null;
};

const mocks = vi.hoisted(() => ({
  data: {} as PersonalPageFixture,
  user: { uid: "first-user" } as { uid: string } | null,
  subscribe: vi.fn(),
  unsubscribe: vi.fn(),
}));
vi.mock("./useMyPageData", () => ({ useMyPageData: () => mocks.data }));
vi.mock("@/context/AuthContext", () => ({ useAuth: () => ({ user: mocks.user }) }));
vi.mock("@/features/suggestions/db", () => ({ subscribeToMySiteRequests: mocks.subscribe }));
vi.mock("next/link", () => ({ default: (props: AnchorHTMLAttributes<HTMLAnchorElement>) => <a {...props} /> }));

import RoleDashboardPanel from "./RoleDashboardPanel";
import MyMinistryPanel from "./MyMinistryPanel";
import MyRequestsPanel from "./MyRequestsPanel";

beforeEach(() => {
  vi.resetAllMocks();
  mocks.user = { uid: "first-user" };
  mocks.subscribe.mockReturnValue(mocks.unsubscribe);
  mocks.data = {
    user: null,
    roles: { semester: "staff", retreat: "fieldStaff" },
    memberName: "테스트 담당자", today: "2026-09-05", connected: true, loaded: false, loadError: null,
    currentSemester: null, currentRetreat: null, homeActions: [], requests: [],
    requestSummary: { total: 0, received: 0, resolved: 0 }, newFriends: [],
    newFriendSummary: { total: 0, active: 0, classPending: 0, rosterPending: 0, completed: 0 },
    personalApplication: null, personalAttendance: null,
    personalRetreat: { matchedStaffId: null, matchedName: null, groups: [], duties: [] },
  };
});
afterEach(cleanup);

describe("개인 대시보드의 미확인 상태", () => {
  it("첫 응답 대기와 오류를 일정 없음·0건·현재 학기 없음으로 표시하지 않는다", () => {
    const { rerender } = render(<RoleDashboardPanel />);
    expect(screen.queryByText("예정된 일정 없음")).toBeNull();
    expect(screen.queryByText("급히 확인할 일정이 없습니다")).toBeNull();
    expect(screen.queryByText("현재 학기 없음")).toBeNull();
    expect(screen.queryByText("해결 0건")).toBeNull();
    mocks.data = { ...mocks.data, loaded: true, loadError: "학기 정보를 읽을 수 없습니다" };
    rerender(<RoleDashboardPanel />);
    expect(screen.getByRole("alert").textContent).toContain("학기 정보를 읽을 수 없습니다");
    expect(screen.queryByText("급히 확인할 일정이 없습니다")).toBeNull();
    expect(screen.queryByText("해결 0건")).toBeNull();
    mocks.data = { ...mocks.data, loadError: null };
    rerender(<RoleDashboardPanel />);
    expect(screen.getByText("급히 확인할 일정이 없습니다")).toBeTruthy();
    expect(screen.getByText("현재 학기 없음")).toBeTruthy();
  });

  it("내 사역 조회가 끝나기 전에는 미배정으로 안내하지 않고 성공 뒤에만 안내한다", () => {
    const { rerender } = render(<MyMinistryPanel />);
    expect(screen.queryByText(/내 학기 배정을 찾지 못했습니다/)).toBeNull();
    expect(screen.queryByText(/내 현장 배정을 확인할 수 없습니다/)).toBeNull();
    mocks.data = { ...mocks.data, loaded: true, loadError: "현장 조회 실패" };
    rerender(<MyMinistryPanel />);
    expect(screen.getByRole("alert").textContent).toContain("현장 조회 실패");
    expect(screen.queryByText(/내 학기 배정을 찾지 못했습니다/)).toBeNull();
    mocks.data = { ...mocks.data, loadError: null };
    rerender(<MyMinistryPanel />);
    expect(screen.getByText(/내 학기 배정을 찾지 못했습니다/)).toBeTruthy();
    expect(screen.getByText(/내 현장 배정을 확인할 수 없습니다/)).toBeTruthy();
  });

  it("바나바팀 새친구 지표도 첫 응답 전에 0명으로 확정하지 않는다", () => {
    mocks.data = { ...mocks.data, roles: { semester: "barnabas", retreat: "none" } };
    const { rerender } = render(<RoleDashboardPanel />);
    const section = screen.getByRole("region", { name: "새친구 정착 현황" });
    expect(within(section).queryByText("전체")).toBeNull();
    mocks.data = { ...mocks.data, loaded: true };
    rerender(<RoleDashboardPanel />);
    expect(within(section).getByText("전체")).toBeTruthy();
  });
});

describe("내 요청 구독 수명", () => {
  it("조회 오류는 로딩을 끝내지만 빈 목록과 0건으로 표시하지 않는다", () => {
    render(<MyRequestsPanel />);
    expect(screen.getByLabelText("요청 내역 불러오는 중")).toBeTruthy();
    act(() => mocks.subscribe.mock.calls[0][2](new Error("permission_denied")));
    expect(screen.queryByLabelText("요청 내역 불러오는 중")).toBeNull();
    expect(screen.getByRole("alert").textContent).toContain("permission_denied");
    expect(screen.queryByText("전송한 요청이 없습니다")).toBeNull();
    const summary = screen.getByRole("region", { name: "내 요청 요약" });
    expect(summary.textContent).not.toContain("0건");
    act(() => mocks.subscribe.mock.calls[0][1]([]));
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByText("전송한 요청이 없습니다")).toBeTruthy();
    expect(summary.textContent).toContain("0건");
  });

  it("계정 변경 직후 이전 목록을 제거하고 해제된 구독의 응답을 무시한다", () => {
    const { rerender, unmount } = render(<MyRequestsPanel />);
    const first = mocks.subscribe.mock.calls[0];
    act(() => first[1]([siteRequest("old", "이전 계정 요청")]));
    expect(screen.getByText("이전 계정 요청")).toBeTruthy();
    mocks.user = { uid: "second-user" };
    rerender(<MyRequestsPanel />);
    expect(screen.queryByText("이전 계정 요청")).toBeNull();
    expect(screen.getByLabelText("요청 내역 불러오는 중")).toBeTruthy();
    act(() => mocks.subscribe.mock.calls[1][1]([siteRequest("new", "현재 계정 요청")]));
    act(() => first[1]([siteRequest("late", "늦게 도착한 이전 요청")]));
    act(() => first[2](new Error("이전 계정 오류")));
    expect(screen.getByText("현재 계정 요청")).toBeTruthy();
    expect(screen.queryByText("늦게 도착한 이전 요청")).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
    unmount();
    expect(mocks.unsubscribe).toHaveBeenCalledTimes(2);
  });
});

function siteRequest(id: string, title: string): SiteRequest {
  return {
    id, title, ownerUid: "fixture-user", kind: "사이트 건의사항", category: "기타", description: "합성 요청 내용",
    page: "/", urgency: "보통", reproduction: "", expected: "", anonymous: false, reporterName: "합성 사용자",
    roleLabel: "사역팀", createdAt: 1_788_595_200_000, status: "received",
  };
}
