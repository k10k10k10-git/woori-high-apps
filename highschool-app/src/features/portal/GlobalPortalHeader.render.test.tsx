/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MyPageTab } from "./MyPageModal";
import type { MinistryRoles } from "./accessPolicy";
import type { TeamMemberships } from "@/features/teams/teamModel";

const state = vi.hoisted(() => ({
  pathname: "/",
  auth: {
    user: { uid: "header-user", displayName: "테스트 사용자", email: "test@example.test" } as { uid: string; displayName: string; email: string } | null,
    loading: false,
    roles: { semester: "superAdmin", retreat: "superAdmin" } as MinistryRoles,
    teamMemberships: {} as TeamMemberships,
    signOut: vi.fn(),
  },
  view: { mode: "desktop", isViewportMobile: false },
}));

vi.mock("next/navigation", () => ({ usePathname: () => state.pathname }));
vi.mock("next/link", () => ({ default: ({ prefetch, onClick, ...props }: ComponentProps<"a"> & { prefetch?: boolean }) => <a {...props} onClick={(event) => { event.preventDefault(); onClick?.(event); }} data-prefetch={prefetch === false ? "false" : "default"} /> }));
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
  state.auth.teamMemberships = {};
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

it("담당 팀이 없는 일반 스탭도 전체 메뉴를 보고 제한된 목적지는 미리 불러오지 않는다", () => {
  state.auth.roles = { semester: "staff", retreat: "none" };
  render(<GlobalPortalHeader />);
  const nav = within(screen.getByRole("navigation", { name: "통합 사역 메뉴" }));
  expect(nav.getByRole("link", { name: "운영센터 권한 필요" })).toHaveAttribute("data-prefetch", "false");
  expect(nav.getByRole("link", { name: "수련회 권한 필요" })).toHaveAttribute("href", "/events");
  expect(nav.getByRole("link", { name: /훈련/ })).toHaveAttribute("href", "/training");
  fireEvent.click(nav.getByRole("button", { name: "사역팀" }));
  const teams = nav.getAllByRole("link").filter((link) => link.getAttribute("href")?.startsWith("/teams/"));
  expect(teams).toHaveLength(6);
  for (const team of teams) {
    expect(team).toHaveTextContent("권한 필요");
    expect(team).toHaveAttribute("data-prefetch", "false");
  }
});
it("찬양팀 사용자는 자기 팀을 바로 열고 나머지 다섯 팀도 권한 안내 링크로 본다", () => {
  state.auth.roles = { semester: "praise", retreat: "none" };
  state.auth.teamMemberships = { praise: { role: "staff", active: true } };
  render(<GlobalPortalHeader />);
  fireEvent.click(screen.getByRole("button", { name: "사역팀" }));
  expect(screen.getByRole("link", { name: /찬양팀 모임/ })).toHaveAttribute("href", "/teams/praise");
  expect(screen.getByRole("link", { name: /찬양팀 모임/ })).not.toHaveTextContent("권한 필요");
  expect(screen.getByRole("link", { name: /바나바팀/ })).toHaveTextContent("권한 필요");
  expect(screen.getByRole("link", { name: /바나바팀/ })).toHaveAttribute("data-prefetch", "false");
});

it("팀 메뉴 링크에서 Escape를 누르면 닫힌 메뉴 대신 열기 버튼에 포커스를 돌린다", () => {
  render(<GlobalPortalHeader />);
  const trigger = screen.getByRole("button", { name: "사역팀" });
  fireEvent.click(trigger);
  screen.getByRole("link", { name: /바나바팀/ }).focus();
  fireEvent.keyDown(document, { key: "Escape" });
  expect(screen.queryByRole("link", { name: /바나바팀/ })).not.toBeInTheDocument();
  expect(trigger).toHaveFocus();
});

it("마이페이지에서 Escape를 누를 때 남아 있던 팀 메뉴가 포커스를 가져가지 않는다", async () => {
  render(<GlobalPortalHeader />);
  fireEvent.click(screen.getByRole("button", { name: "사역팀" }));
  await openMyPage();
  const close = screen.getByRole("button", { name: "마이페이지 닫기" });
  close.focus();
  fireEvent.keyDown(document, { key: "Escape" });
  expect(close).toHaveFocus();
});

it("모바일 주요 메뉴와 펼친 메뉴에도 모든 영역과 여섯 팀이 표시된다", () => {
  state.auth.roles = { semester: "none", retreat: "none" };
  state.view.isViewportMobile = true;
  render(<GlobalPortalHeader />);
  expect(within(screen.getByRole("navigation", { name: "주요 메뉴" })).getAllByRole("link")).toHaveLength(6);
  fireEvent.click(screen.getByRole("button", { name: "사이트 메뉴 열기" }));
  const dialog = within(screen.getByRole("dialog", { name: "사이트 메뉴" }));
  const teams = within(dialog.getByRole("navigation", { name: "모바일 팀 메뉴" })).getAllByRole("link");
  expect(teams).toHaveLength(6);
  for (const team of teams) expect(team).toHaveAttribute("data-prefetch", "false");
  const main = within(dialog.getByRole("navigation", { name: "모바일 통합 사역 메뉴" }));
  for (const label of ["신앙훈련", "수련회", "회의록", "운영센터"]) {
    expect(main.getByRole("link", { name: `${label} 권한 필요` })).toHaveAttribute("data-prefetch", "false");
  }
  fireEvent.click(main.getByRole("link", { name: "수련회 권한 필요" }));
  expect(screen.queryByRole("dialog", { name: "사이트 메뉴" })).not.toBeInTheDocument();
});

it.each(["pastor", "adminTeam"] as const)("%s 계정에 훈련과 운영센터를 연다", (semester) => {
  state.auth.roles = { semester, retreat: "none" };
  render(<GlobalPortalHeader />);
  expect(screen.getAllByRole("link", { name: "신앙훈련" }).some((link) => link.getAttribute("href") === "/training")).toBe(true);
  expect(screen.getAllByRole("link", { name: "운영센터" }).some((link) => link.getAttribute("href") === "/operations")).toBe(true);
});


it("모바일 메뉴에서 내 계정을 먼저 보여주고 마이페이지를 열 때 메뉴를 닫는다", async () => {
  state.view.mode = "mobile";
  state.view.isViewportMobile = true;
  render(<GlobalPortalHeader />);
  fireEvent.click(screen.getByRole("button", { name: "사이트 메뉴 열기" }));
  const menu = screen.getByRole("dialog", { name: "사이트 메뉴" });
  const account = within(menu).getByRole("button", { name: "마이페이지" });
  const ministry = within(menu).getByRole("navigation", { name: "모바일 통합 사역 메뉴" });
  expect(account.compareDocumentPosition(ministry) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(within(menu).getByRole("navigation", { name: "모바일 팀 메뉴" }).querySelectorAll("a")).toHaveLength(6);
  fireEvent.click(account);
  expect(screen.queryByRole("dialog", { name: "사이트 메뉴" })).not.toBeInTheDocument();
  expect(await screen.findByRole("dialog", { name: "마이페이지" })).toBeInTheDocument();
});
