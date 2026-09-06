/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MyPageTab } from "./MyPageModal";
import type { MinistryRoles } from "./accessPolicy";

const state = vi.hoisted(() => ({
  pathname: "/",
  auth: {
    user: { uid: "header-user", displayName: "테스트 사용자", email: "test@example.test" } as { uid: string; displayName: string; email: string } | null,
    loading: false,
    roles: { semester: "superAdmin", retreat: "superAdmin" } as MinistryRoles,
    signOut: vi.fn(),
  },
  view: { mode: "desktop", isViewportMobile: false },
}));

vi.mock("next/navigation", () => ({ usePathname: () => state.pathname }));
vi.mock("@/context/AuthContext", () => ({ useAuth: () => state.auth }));
vi.mock("@/context/ViewModeContext", () => ({ useViewMode: () => state.view }));
vi.mock("./PortalSearch", () => ({ default: () => null }));
vi.mock("@/components/ThemeToggle", () => ({ default: () => null }));
vi.mock("@/components/ViewModeToggle", () => ({ default: () => null }));
vi.mock("./MyPageModal", () => ({
  default: function TestMyPage({ initialTab, onClose }: { initialTab: MyPageTab; onClose: () => void }) {
    return (
      <section role="dialog" aria-label="마이페이지">
        <p>{initialTab}</p>
        <button type="button" onClick={onClose}>마이페이지 닫기</button>
      </section>
    );
  },
}));

import GlobalPortalHeader from "./GlobalPortalHeader";

beforeEach(() => {
  state.pathname = "/";
  state.auth.user = { uid: "header-user", displayName: "테스트 사용자", email: "test@example.test" };
  state.auth.loading = false;
  state.auth.roles = { semester: "superAdmin", retreat: "superAdmin" };
  state.view.mode = "desktop";
  state.view.isViewportMobile = false;
  vi.clearAllMocks();
});
afterEach(cleanup);

async function openMyPage() {
  fireEvent.click(screen.getByRole("button", { name: "마이페이지" }));
  return screen.findByRole("dialog", { name: "마이페이지" });
}

describe("전역 헤더 마이페이지 진입", () => {
  it("열기 전에는 모달을 마운트하지 않고 클릭하면 기본 대시보드를 연다", async () => {
    render(<GlobalPortalHeader />);
    expect(screen.queryByRole("dialog", { name: "마이페이지" })).not.toBeInTheDocument();
    expect(await openMyPage()).toHaveTextContent("dashboard");
  });

  it.each(["desktop", "mobile"])("%s 보기에서 업무로 이동하면 닫히고 뒤로가기로 돌아와도 다시 열리지 않는다", async (mode) => {
    state.view.mode = mode;
    const { rerender } = render(<GlobalPortalHeader />);
    await openMyPage();

    state.pathname = "/suggestions";
    rerender(<GlobalPortalHeader />);
    expect(screen.queryByRole("dialog", { name: "마이페이지" })).not.toBeInTheDocument();

    state.pathname = "/";
    rerender(<GlobalPortalHeader />);
    expect(screen.queryByRole("dialog", { name: "마이페이지" })).not.toBeInTheDocument();
    expect(await openMyPage()).toHaveTextContent("dashboard");
  });

  it("같은 경로의 일반 갱신은 열린 모달을 유지한다", async () => {
    const { rerender } = render(<GlobalPortalHeader />);
    await openMyPage();
    rerender(<GlobalPortalHeader />);
    expect(screen.getByRole("dialog", { name: "마이페이지" })).toBeInTheDocument();
  });

  it("관리자 팀 진입 이벤트와 닫은 뒤 일반 진입의 초기 탭을 구분한다", async () => {
    render(<GlobalPortalHeader />);
    act(() => window.dispatchEvent(new Event("portal:open-team")));
    expect(await screen.findByRole("dialog", { name: "마이페이지" })).toHaveTextContent("team");
    fireEvent.click(screen.getByRole("button", { name: "마이페이지 닫기" }));
    expect(screen.queryByRole("dialog", { name: "마이페이지" })).not.toBeInTheDocument();
    expect(await openMyPage()).toHaveTextContent("dashboard");
  });

  it("팀 관리 권한이 없는 사용자의 팀 이벤트를 거절하고 본인 마이페이지는 허용한다", async () => {
    state.auth.roles = { semester: "none", retreat: "none" };
    render(<GlobalPortalHeader />);
    act(() => window.dispatchEvent(new Event("portal:open-team")));
    expect(screen.queryByRole("dialog", { name: "마이페이지" })).not.toBeInTheDocument();
    expect(await openMyPage()).toHaveTextContent("dashboard");
  });

  it("로그아웃 후 같은 계정으로 돌아와도 이전 마이페이지를 복원하지 않는다", async () => {
    const { rerender } = render(<GlobalPortalHeader />);
    await openMyPage();
    const user = state.auth.user;
    state.auth.user = null;
    rerender(<GlobalPortalHeader />);
    expect(screen.queryByRole("dialog", { name: "마이페이지" })).not.toBeInTheDocument();
    state.auth.user = user;
    rerender(<GlobalPortalHeader />);
    expect(screen.queryByRole("dialog", { name: "마이페이지" })).not.toBeInTheDocument();
  });

  it("계정이 바로 바뀌어도 이전 계정의 열린 모달을 폐기한다", async () => {
    const { rerender } = render(<GlobalPortalHeader />);
    await openMyPage();
    state.auth.user = { uid: "other-user", displayName: "다른 사용자", email: "other@example.test" };
    rerender(<GlobalPortalHeader />);
    expect(screen.queryByRole("dialog", { name: "마이페이지" })).not.toBeInTheDocument();
    expect(await openMyPage()).toHaveTextContent("dashboard");
  });
});

it("학기와 팀 운영을 구분하고 팀 접근 권한이 없는 스탭에게 빈 메뉴를 숨긴다", () => {
  state.auth.roles = { semester: "staff", retreat: "none" };
  render(<GlobalPortalHeader />);
  expect(screen.getByRole("link", { name: "학기 운영" })).toHaveAttribute("href", "/semesters");
  expect(screen.queryByRole("button", { name: "팀·주일 운영" })).not.toBeInTheDocument();
});
it("찬양팀 사용자는 팀 운영 메뉴에서 자기 팀에만 진입한다", () => {
  state.auth.roles = { semester: "praise", retreat: "none" };
  render(<GlobalPortalHeader />);
  fireEvent.click(screen.getByRole("button", { name: "팀·주일 운영" }));
  expect(screen.getByRole("link", { name: /찬양팀 모임/ })).toHaveAttribute("href", "/sunday-ministry/praise");
  expect(screen.queryByRole("link", { name: /바나바팀/ })).not.toBeInTheDocument();
});
