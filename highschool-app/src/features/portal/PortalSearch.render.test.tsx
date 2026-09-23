/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MinistryRoles } from "./accessPolicy";

const state = vi.hoisted(() => ({
  auth: {
    roles: { semester: "leader", retreat: "none" } as MinistryRoles,
    canSearchOfficialRoster: true,
  },
  subscribe: vi.fn(() => vi.fn()),
}));

vi.mock("@/context/AuthContext", () => ({ useAuth: () => state.auth }));
vi.mock("./peopleSearchDb", () => ({ subscribePeopleSearchData: state.subscribe }));

import PortalSearch from "./PortalSearch";

beforeEach(() => {
  state.auth.roles = { semester: "leader", retreat: "none" };
  state.auth.canSearchOfficialRoster = true;
  vi.clearAllMocks();
});
afterEach(cleanup);

describe("인물 통합검색 권한", () => {
  it("운영센터 팀장과 교역자·행정팀은 검색할 수 있다", () => {
    for (const semester of ["leader", "pastor", "adminTeam"] as const) {
      state.auth.roles = { semester, retreat: "none" };
      const view = render(<PortalSearch />);
      fireEvent.click(screen.getByRole("button", { name: "인물 통합검색 열기" }));
      expect(state.subscribe).toHaveBeenCalledTimes(1);
      view.unmount();
      vi.clearAllMocks();
    }
  });

  it("팀 연결된 팀장은 연간 원장 검색을 열지 않는다", () => {
    state.auth.canSearchOfficialRoster = false;
    render(<PortalSearch />);
    expect(screen.queryByRole("button", { name: "인물 통합검색 열기" })).not.toBeInTheDocument();
    fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    expect(state.subscribe).not.toHaveBeenCalled();
  });

  it("검색 중 팀 연결이 생기면 구독을 해제하고 검색창을 닫는다", () => {
    const unsubscribe = vi.fn();
    state.subscribe.mockReturnValue(unsubscribe);
    const view = render(<PortalSearch />);
    fireEvent.click(screen.getByRole("button", { name: "인물 통합검색 열기" }));
    expect(state.subscribe).toHaveBeenCalledTimes(1);
    state.auth.canSearchOfficialRoster = false;
    view.rerender(<PortalSearch />);
    expect(unsubscribe).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog", { name: "인물 통합검색" })).not.toBeInTheDocument();
  });
});
