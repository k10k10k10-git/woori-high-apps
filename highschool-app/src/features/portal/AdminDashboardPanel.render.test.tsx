/** @vitest-environment jsdom */
import { StrictMode } from "react";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SiteRequest } from "@/features/suggestions/siteRequest";

const mocks = vi.hoisted(() => ({
  requests: vi.fn(), mainAdmins: vi.fn(), retreatAdmins: vi.fn(), adminPending: vi.fn(),
  iguardMembers: vi.fn(), iguardPending: vi.fn(), connection: vi.fn(), unsubscribe: vi.fn(),
}));
vi.mock("@/features/suggestions/db", () => ({ subscribeToAdminSiteRequests: mocks.requests }));
vi.mock("@/features/iguard/lib/db", () => ({
  subscribeToIguardMembers: mocks.iguardMembers, subscribeToIguardPending: mocks.iguardPending,
}));
vi.mock("@/lib/db", () => ({
  subscribeToConnection: mocks.connection, subscribeToMainAdmins: mocks.mainAdmins,
  subscribeToPendingRequests: mocks.adminPending, subscribeToRetreatAdmins: mocks.retreatAdmins,
}));

import AdminDashboard from "./AdminDashboardPanel";

function request(overrides: Partial<SiteRequest> = {}): SiteRequest {
  return {
    id: "request-a", ownerUid: "user-a", kind: "사이트 건의사항", category: "기능 요청",
    title: "화면 확인 요청", description: "현장 조회를 확인해 주세요", page: "/field", urgency: "보통",
    reproduction: "", expected: "", anonymous: false, reporterName: "테스트 사용자", roleLabel: "스탭",
    createdAt: 100, status: "received", ...overrides,
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  for (const subscribe of [mocks.requests, mocks.iguardPending]) {
    subscribe.mockImplementation((success) => { success([]); return mocks.unsubscribe; });
  }
  for (const subscribe of [mocks.mainAdmins, mocks.retreatAdmins, mocks.adminPending, mocks.iguardMembers]) {
    subscribe.mockImplementation((success) => { success({}); return mocks.unsubscribe; });
  }
  mocks.connection.mockImplementation((success) => { success(true); return mocks.unsubscribe; });
});
afterEach(cleanup);

describe("관리자 작업함의 조회 상태", () => {
  it("첫 요청 응답 전에는 대기 수와 최근 해결을 빈 상태로 표시하지 않는다", () => {
    mocks.requests.mockReturnValue(mocks.unsubscribe);
    render(<AdminDashboard onNavigate={vi.fn()} />);
    expect(screen.getByRole("status", { name: "처리함 불러오는 중" })).toBeTruthy();
    expect(screen.getByText("최근 해결 내역을 불러오는 중입니다.")).toBeTruthy();
    expect(screen.queryByText("지금 처리할 항목이 없습니다")).toBeNull();
    expect(screen.queryByText("아직 해결 완료된 요청이 없습니다.")).toBeNull();
    expect(within(screen.getByRole("button", { name: "받은 요청" })).queryByText("0")).toBeNull();
  });

  it("요청 구독이 거부되면 스켈레톤을 끝내고 알 수 없는 집계를 0건과 구분한다", () => {
    mocks.requests.mockImplementation((_success, failure) => { failure(new Error("permission_denied")); return mocks.unsubscribe; });
    render(<AdminDashboard onNavigate={vi.fn()} />);
    expect(screen.getByRole("alert").textContent).toContain("사이트 요청");
    expect(screen.queryByRole("status", { name: "처리함 불러오는 중" })).toBeNull();
    expect(screen.getByText("처리 현황을 확인할 수 없습니다")).toBeTruthy();
    expect(screen.getByText("최근 해결 내역을 확인할 수 없습니다.")).toBeTruthy();
    expect(screen.queryByText("지금 처리할 항목이 없습니다")).toBeNull();
    expect(within(screen.getByRole("group", { name: "전체 처리 대기" })).getByText("확인 필요")).toBeTruthy();
    expect(within(screen.getByRole("button", { name: "받은 요청" })).getByText("확인 필요")).toBeTruthy();
  });

  it("일부 접근 신청 조회 실패는 읽힌 업무를 유지하되 전체 집계가 미완료임을 알린다", () => {
    const onNavigate = vi.fn();
    mocks.requests.mockImplementation((success) => { success([request()]); return mocks.unsubscribe; });
    mocks.adminPending.mockImplementation((_success, failure) => { failure(new Error("permission_denied")); return mocks.unsubscribe; });
    render(<AdminDashboard onNavigate={onNavigate} />);
    expect(screen.getByText("일부 업무는 불러오지 못했습니다. 조회된 항목만 표시합니다.")).toBeTruthy();
    expect(screen.getByRole("button", { name: /화면 확인 요청/ })).toBeTruthy();
    expect(within(screen.getByRole("group", { name: "전체 처리 대기" })).getByText("확인 필요")).toBeTruthy();
    expect(within(screen.getByRole("button", { name: "받은 요청" })).getByText("1")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /화면 확인 요청/ }));
    expect(onNavigate).toHaveBeenCalledWith("requests");
  });

  it("팀원 집계 실패가 확인된 처리함과 요청 집계를 막지 않는다", () => {
    mocks.mainAdmins.mockImplementation((_success, failure) => { failure(new Error("permission_denied")); return mocks.unsubscribe; });
    render(<AdminDashboard onNavigate={vi.fn()} />);
    expect(screen.getByText("지금 처리할 항목이 없습니다")).toBeTruthy();
    expect(within(screen.getByRole("button", { name: "승인된 팀원" })).getByText("확인 필요")).toBeTruthy();
    expect(within(screen.getByRole("button", { name: "받은 요청" })).getByText("0")).toBeTruthy();
  });

  it("재조회는 구독을 다시 만들고 해제된 성공·실패 응답을 무시한다", () => {
    mocks.requests.mockImplementation((_success, failure) => { failure(new Error("permission_denied")); return mocks.unsubscribe; });
    render(<AdminDashboard onNavigate={vi.fn()} />);
    const [oldSuccess, oldFailure] = mocks.requests.mock.calls[0];
    mocks.requests.mockImplementation(() => mocks.unsubscribe);
    fireEvent.click(screen.getByRole("button", { name: "다시 불러오기" }));
    expect(mocks.unsubscribe).toHaveBeenCalledTimes(7);
    expect(mocks.requests).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole("alert")).toBeNull();
    act(() => oldSuccess([request({ title: "이전 구독의 요청" })]));
    act(() => oldFailure(new Error("stale failure")));
    expect(screen.queryByText("이전 구독의 요청")).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByRole("status", { name: "처리함 불러오는 중" })).toBeTruthy();
    act(() => mocks.requests.mock.calls[1][0]([]));
    expect(screen.getByText("지금 처리할 항목이 없습니다")).toBeTruthy();
  });

  it("StrictMode에서 정리된 첫 구독의 콜백이 현재 작업함을 덮지 않는다", () => {
    mocks.requests.mockReturnValue(mocks.unsubscribe);
    render(<StrictMode><AdminDashboard onNavigate={vi.fn()} /></StrictMode>);
    expect(mocks.requests).toHaveBeenCalledTimes(2);
    act(() => mocks.requests.mock.calls[1][0]([request({ title: "현재 요청" })]));
    act(() => mocks.requests.mock.calls[0][0]([request({ title: "해제된 요청" })]));
    act(() => mocks.requests.mock.calls[0][1](new Error("stale failure")));
    expect(screen.getByRole("button", { name: /현재 요청/ })).toBeTruthy();
    expect(screen.queryByText("해제된 요청")).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("정상 수신 뒤 실패한 항목은 이전 값과 함께 정상 집계로 남지 않는다", () => {
    mocks.requests.mockImplementation((success) => { success([request()]); return mocks.unsubscribe; });
    render(<AdminDashboard onNavigate={vi.fn()} />);
    expect(screen.getByRole("button", { name: /화면 확인 요청/ })).toBeTruthy();
    act(() => mocks.requests.mock.calls[0][1](new Error("permission_denied")));
    expect(screen.queryByRole("button", { name: /화면 확인 요청/ })).toBeNull();
    expect(screen.getByText("처리 현황을 확인할 수 없습니다")).toBeTruthy();
  });

  it("긴급 요청을 먼저 표시하고 권한 승인 및 최근 해결 메뉴를 연결한다", () => {
    const onNavigate = vi.fn();
    mocks.requests.mockImplementation((success) => {
      success([
        request({ id: "normal", title: "일반 요청", createdAt: 10 }),
        request({ id: "urgent", title: "긴급 요청", urgency: "긴급", createdAt: 20 }),
        request({ id: "done", title: "해결한 요청", status: "resolved", resolvedAt: 30, resolvedBy: "관리자" }),
      ]);
      return mocks.unsubscribe;
    });
    mocks.adminPending.mockImplementation((success) => { success({ "user-b": { name: "새 팀원", email: "member@example.test", requestedAt: 5 } }); return mocks.unsubscribe; });
    const { container, unmount } = render(<AdminDashboard onNavigate={onNavigate} />);
    expect([...container.querySelectorAll(".admin-overview-work-title strong")].map((element) => element.textContent)).toEqual(["긴급 요청", "새 팀원", "일반 요청"]);
    expect(screen.getByText("해결한 요청")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /새 팀원/ }));
    fireEvent.click(screen.getByRole("button", { name: "전체 보기" }));
    expect(onNavigate.mock.calls).toEqual([["team"], ["requests"]]);
    expect(container.textContent).not.toContain("Firebase");
    expect(container.textContent).not.toContain("6개 경로");
    unmount();
    expect(mocks.unsubscribe).toHaveBeenCalledTimes(7);
  });
});
