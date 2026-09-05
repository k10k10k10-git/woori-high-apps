/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SiteRequest } from "@/features/suggestions/siteRequest";

const mocks = vi.hoisted(() => ({
  subscribe: vi.fn(),
  unsubscribe: vi.fn(),
  resolve: vi.fn(),
  remove: vi.fn(),
}));
vi.mock("@/context/AuthContext", () => ({ useAuth: () => ({ user: { uid: "admin" }, memberName: "테스트 관리자" }) }));
vi.mock("@/context/UIContext", () => ({ useUI: () => ({ toast: vi.fn(), uiConfirm: vi.fn() }) }));
vi.mock("@/features/suggestions/db", () => ({
  subscribeToAdminSiteRequests: mocks.subscribe,
  resolveSiteRequest: mocks.resolve,
  deleteSiteRequest: mocks.remove,
}));

import SiteRequestsPanel from "./SiteRequestsPanel";

const received: SiteRequest = {
  id: "request-a", ownerUid: "owner", kind: "개선", category: "마이페이지",
  title: "일정 표시 개선", description: "다음 일정을 보고 싶습니다.", page: "/",
  urgency: "보통", reproduction: "", expected: "일정 표시", anonymous: false,
  reporterName: "테스트 사용자", roleLabel: "스탭", createdAt: 1, status: "received",
};
const resolved: SiteRequest = { ...received, id: "request-b", title: "검색 개선", status: "resolved", resolvedAt: 2 };

function receive(values: SiteRequest[], subscription = 0) {
  act(() => mocks.subscribe.mock.calls[subscription][0](values));
}
function fail(message: string, subscription = 0) {
  act(() => mocks.subscribe.mock.calls[subscription][1](new Error(message)));
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.subscribe.mockReturnValue(mocks.unsubscribe);
});
afterEach(() => {
  cleanup();
  expect(mocks.resolve).not.toHaveBeenCalled();
  expect(mocks.remove).not.toHaveBeenCalled();
});

describe("관리자 요청함 조회 상태", () => {
  it("첫 응답 전에는 로딩과 미확인 건수를 표시하며 빈 목록으로 오인시키지 않는다", () => {
    render(<SiteRequestsPanel />);
    expect(screen.getByRole("status")).toHaveTextContent("요청함을 불러오는 중");
    expect(screen.getByRole("button", { name: "전체 —" })).toBeInTheDocument();
    expect(screen.queryByText("해당 상태의 요청이 없습니다.")).not.toBeInTheDocument();
  });

  it("성공한 빈 응답을 받은 뒤에만 빈 목록과 0건을 표시한다", () => {
    render(<SiteRequestsPanel />);
    receive([]);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.getByText("해당 상태의 요청이 없습니다.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "전체 0" })).toBeInTheDocument();
  });

  it("조회 실패는 alert로 알리고 빈 목록과 저장 동작을 표시하지 않는다", () => {
    render(<SiteRequestsPanel />);
    fail("접근 거부");
    expect(screen.getByRole("alert")).toHaveTextContent("접근 거부");
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.queryByText("해당 상태의 요청이 없습니다.")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "해결 완료" })).not.toBeInTheDocument();
  });

  it("재조회가 이전 구독을 해제하고 그 구독의 늦은 성공·오류를 무시한다", () => {
    render(<SiteRequestsPanel />);
    fail("연결 끊김");
    fireEvent.click(screen.getByRole("button", { name: "다시 불러오기" }));
    expect(mocks.unsubscribe).toHaveBeenCalledTimes(1);
    expect(mocks.subscribe).toHaveBeenCalledTimes(2);
    receive([received]);
    fail("이전 구독 오류");
    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByText(received.title)).not.toBeInTheDocument();
    receive([], 1);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.getByText("해당 상태의 요청이 없습니다.")).toBeInTheDocument();
  });

  it("목록을 받은 뒤 조회 오류가 나면 오래된 요청 처리 화면을 감추고 복구된 값만 다시 보여준다", () => {
    render(<SiteRequestsPanel />);
    receive([received]);
    expect(screen.getByRole("heading", { name: received.title })).toBeInTheDocument();
    fail("갱신 실패");
    expect(screen.getByRole("alert")).toHaveTextContent("갱신 실패");
    expect(screen.queryByRole("heading", { name: received.title })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "해결 완료" })).not.toBeInTheDocument();
    receive([received]);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: received.title })).toBeInTheDocument();
  });

  it("상태 필터는 눌린 버튼으로 노출하고 조회 결과만 변경한다", () => {
    const { unmount } = render(<SiteRequestsPanel />);
    receive([received, resolved]);
    expect(screen.getByRole("group", { name: "요청 상태 필터" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "받은 요청 1", pressed: true })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "해결 1" }));
    expect(screen.getByRole("button", { name: "해결 1", pressed: true })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: resolved.title })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: received.title })).not.toBeInTheDocument();
    expect(mocks.subscribe).toHaveBeenCalledTimes(1);
    unmount();
    expect(mocks.unsubscribe).toHaveBeenCalledTimes(1);
  });
});
