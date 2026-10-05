/** @vitest-environment jsdom */
import { cleanup, render, screen, within } from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { MinistryRoles } from "@/features/portal/accessPolicy";
import type { TeamMemberships } from "./teamModel";

const state = vi.hoisted(() => ({ roles: { semester: "none", retreat: "none" } as MinistryRoles, teamMemberships: {} as TeamMemberships }));
vi.mock("@/context/AuthContext", () => ({ useAuth: () => ({ user: { uid: "team-menu-user" }, loading: false, roleError: false, signIn: vi.fn(), ...state }) }));
vi.mock("next/link", () => ({ default: ({ prefetch, ...props }: ComponentProps<"a"> & { prefetch?: boolean }) => <a {...props} data-prefetch={prefetch === false ? "false" : "default"} /> }));
import TeamsHome from "./TeamsHome";

beforeEach(() => { state.roles = { semester: "none", retreat: "none" }; state.teamMemberships = {}; });
afterEach(cleanup);

it("미승인 계정도 여섯 팀을 모두 보고 권한 요청 안내로 이동할 수 있다", () => {
  render(<TeamsHome />);
  expect(screen.getByText("접근 승인이 필요합니다")).toBeInTheDocument();
  const links = within(screen.getByRole("region", { name: "전체 팀 목록" })).getAllByRole("link");
  expect(links).toHaveLength(6);
  for (const link of links) {
    expect(link).toHaveTextContent("권한 필요");
    expect(link).toHaveAttribute("data-prefetch", "false");
    expect(link.getAttribute("href")).toMatch(/^\/teams\//);
  }
});

it("담당 팀 권한 표시를 계정 변경 때 갱신하고 기획 중인 두 팀도 유지한다", () => {
  state.roles = { semester: "praise", retreat: "none" };
  state.teamMemberships = { praise: { role: "viewer", active: true } };
  const { rerender } = render(<TeamsHome />);
  const praise = screen.getByRole("link", { name: /찬양팀/ });
  expect(praise).toHaveTextContent("조회자");
  expect(praise).toHaveAttribute("data-prefetch", "default");
  expect(screen.getByRole("link", { name: /바나바팀/ })).toHaveTextContent("권한 필요");
  expect(screen.getAllByText("기획 중")).toHaveLength(2);
  state.teamMemberships = {};
  rerender(<TeamsHome />);
  expect(screen.getByRole("link", { name: /찬양팀/ })).toHaveTextContent("권한 필요");
  expect(screen.getByRole("link", { name: /찬양팀/ })).toHaveAttribute("data-prefetch", "false");
});

it("전체 팀 조회 역할은 여섯 팀 링크 모두에서 권한 필요 표시를 제거한다", () => {
  state.roles = { semester: "pastor", retreat: "none" };
  render(<TeamsHome />);
  expect(within(screen.getByRole("region", { name: "전체 팀 목록" })).queryByText("권한 필요")).not.toBeInTheDocument();
});
