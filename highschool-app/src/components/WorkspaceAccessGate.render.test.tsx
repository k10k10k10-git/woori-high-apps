/** @vitest-environment jsdom */
import { useEffect } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import WorkspaceAccessGate from "./WorkspaceAccessGate";

const auth = vi.hoisted(() => ({ user: { uid: "staff", email: "staff@example.test" } as { uid: string; email: string } | null, loading: false, roleError: false, retryRoles: vi.fn(), signIn: vi.fn() }));
vi.mock("@/context/AuthContext", () => ({ useAuth: () => auth }));
const subscribe = vi.fn();
function ProtectedScreen() { useEffect(() => { subscribe(); }, []); return <p>보호된 명단</p>; }
beforeEach(() => { vi.clearAllMocks(); auth.user = { uid: "staff", email: "staff@example.test" }; auth.loading = false; auth.roleError = false; });
afterEach(cleanup);

it.each(["denied", "loading", "roleError", "signedOut"])("%s에서는 보호 화면과 구독을 시작하지 않는다", (state) => {
  auth.loading = state === "loading";
  auth.roleError = state === "roleError";
  if (state === "signedOut") auth.user = null;
  render(<WorkspaceAccessGate allowed={state !== "denied"} area="팀 업무"><ProtectedScreen /></WorkspaceAccessGate>);
  expect(screen.queryByText("보호된 명단")).not.toBeInTheDocument();
  expect(subscribe).not.toHaveBeenCalled();
  if (state === "roleError") {
    expect(screen.getByRole("alert")).toHaveTextContent("아직 확인할 수 없습니다");
    fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
    expect(auth.retryRoles).toHaveBeenCalledOnce();
  }
  if (state === "denied") expect(screen.getByText("staff@example.test")).toBeInTheDocument();
});

it("권한 확인 후에만 마운트하며 권한 회수 즉시 내용을 없앤다", () => {
  const view = render(<WorkspaceAccessGate allowed area="팀 업무"><ProtectedScreen /></WorkspaceAccessGate>);
  expect(subscribe).toHaveBeenCalledOnce();
  expect(screen.getByText("보호된 명단")).toBeInTheDocument();
  view.rerender(<WorkspaceAccessGate allowed={false} area="팀 업무"><ProtectedScreen /></WorkspaceAccessGate>);
  expect(screen.queryByText("보호된 명단")).not.toBeInTheDocument();
  expect(screen.getByRole("link", { name: "계정 확인·담당자 문의 방법" })).toHaveAttribute("href", "/library/help#access");
});
