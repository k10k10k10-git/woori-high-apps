/** @vitest-environment jsdom */
import { cleanup, render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { MinistryRoles } from "@/features/portal/accessPolicy";

const state = vi.hoisted(() => ({ roles: { semester: "none", retreat: "none" } as MinistryRoles }));
vi.mock("@/context/AuthContext", () => ({ useAuth: () => ({ user: { uid: "operations-menu-user" }, loading: false, roleError: false, teamMemberships: {}, ...state }) }));
vi.mock("next/link", () => ({ default: ({ prefetch, ...props }: ComponentProps<"a"> & { prefetch?: boolean }) => <a {...props} data-prefetch={prefetch === false ? "false" : "default"} /> }));
import OperationsHome from "./OperationsHome";

beforeEach(() => { state.roles = { semester: "none", retreat: "none" }; });
afterEach(cleanup);

it("권한 없는 로그인 사용자도 네 업무 메뉴를 보고 제한된 목적지를 미리 조회하지 않는다", () => {
  render(<OperationsHome />);
  expect(screen.getByRole("heading", { name: "운영센터" })).toBeInTheDocument();
  const links = screen.getAllByRole("link");
  expect(links).toHaveLength(4);
  for (const link of links) {
    expect(link).toHaveTextContent("권한 필요");
    expect(link).toHaveAttribute("data-prefetch", "false");
  }
});

it("권한 변경은 메뉴 수를 바꾸지 않고 접근 표시만 갱신한다", () => {
  const { rerender } = render(<OperationsHome />);
  state.roles = { semester: "superAdmin", retreat: "none" };
  rerender(<OperationsHome />);
  expect(screen.getAllByRole("link")).toHaveLength(4);
  expect(screen.queryByText("권한 필요")).not.toBeInTheDocument();
});
