/** @vitest-environment jsdom */
import { StrictMode } from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MinistryRoles } from "./accessPolicy";

const mocks = vi.hoisted(() => ({
  auth: { user: { uid: "admin-user", email: "admin@example.test" }, roles: { semester: "superAdmin", retreat: "superAdmin" } as MinistryRoles },
  admins: vi.fn(), adminPending: vi.fn(), iguardMembers: vi.fn(), iguardPending: vi.fn(), iguardRoles: vi.fn(), mainAdmins: vi.fn(),
  unsubscribe: vi.fn(), applyRoles: vi.fn(), toast: vi.fn(), confirm: vi.fn(), write: vi.fn(),
}));
vi.mock("@/context/AuthContext", () => ({ useAuth: () => mocks.auth }));
vi.mock("@/context/UIContext", () => ({ useUI: () => ({ toast: mocks.toast, uiConfirm: mocks.confirm }) }));
vi.mock("./applyRole", () => ({ applyRoleSteps: mocks.applyRoles }));
vi.mock("@/lib/db", () => ({
  subscribeToRetreatAdmins: mocks.admins, subscribeToPendingRequests: mocks.adminPending, subscribeToMainAdmins: mocks.mainAdmins,
  denyRetreatRequest: mocks.write, updateRetreatAdminMemberName: mocks.write,
}));
vi.mock("@/features/iguard/lib/db", () => ({
  subscribeToIguardMembers: mocks.iguardMembers, subscribeToIguardPending: mocks.iguardPending, subscribeToIguardRoles: mocks.iguardRoles,
  denyIguardPending: mocks.write, updateIguardMemberName: mocks.write,
}));

import TeamModal from "./TeamModal";

const sources = [mocks.admins, mocks.adminPending, mocks.iguardMembers, mocks.iguardPending, mocks.iguardRoles, mocks.mainAdmins];
const member = { email: "member@example.test", name: "테스트 팀원", semesterRole: "adminTeam", retreatRole: "adminTeam" };

function receiveAll(callIndex = 0, withMember = false) {
  for (const subscribe of sources) {
    if (!subscribe.mock.calls[callIndex]) continue;
    const value = subscribe === mocks.iguardPending ? [] : subscribe === mocks.admins && withMember ? { "member-user": member } : {};
    subscribe.mock.calls[callIndex][0](value);
  }
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.auth.user = { uid: "admin-user", email: "admin@example.test" };
  mocks.auth.roles = { semester: "superAdmin", retreat: "superAdmin" };
  for (const subscribe of sources) subscribe.mockReturnValue(mocks.unsubscribe);
  mocks.confirm.mockResolvedValue(true);
  mocks.applyRoles.mockResolvedValue(undefined);
});
afterEach(cleanup);

describe("팀원 관리 — 전체 역할 정보 준비", () => {
  it("첫 응답 전에는 빈 명단과 0명 집계를 표시하지 않는다", () => {
    render(<TeamModal embedded />);
    expect(screen.getByRole("status")).toHaveTextContent("팀원과 역할 정보를 불러오는 중");
    expect(screen.queryByText("승인된 팀원이 없습니다.")).not.toBeInTheDocument();
    expect(screen.queryByText("대기 중인 요청이 없습니다.")).not.toBeInTheDocument();
    expect(screen.queryByText("0명")).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });

  it("팀원 목록이 먼저 와도 통합관리자 정보를 포함한 6개 원장이 성공해야 편집을 연다", async () => {
    render(<TeamModal embedded />);
    act(() => {
      mocks.admins.mock.calls[0][0]({ "member-user": member });
      mocks.adminPending.mock.calls[0][0]({});
      mocks.iguardMembers.mock.calls[0][0]({});
      mocks.iguardPending.mock.calls[0][0]([]);
      mocks.iguardRoles.mock.calls[0][0]({});
    });
    expect(screen.queryByRole("combobox", { name: "테스트 팀원 학기 역할" })).not.toBeInTheDocument();
    expect(mocks.applyRoles).not.toHaveBeenCalled();
    act(() => mocks.mainAdmins.mock.calls[0][0]({}));
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    const semesterSelect = screen.getByRole("combobox", { name: "테스트 팀원 학기 역할" });
    expect(semesterSelect).toBeEnabled();
    await act(async () => { fireEvent.change(semesterSelect, { target: { value: "leader" } }); });
    expect(mocks.confirm).toHaveBeenCalledOnce();
    expect(mocks.applyRoles).toHaveBeenCalledOnce();
    expect(mocks.applyRoles.mock.calls[0][1]).toMatchObject({ uid: "member-user", email: member.email, name: member.name });
  });

  it("실패 시 남은 응답을 기다리는 스피너 대신 실패 원장을 표시하고 편집을 막는다", () => {
    render(<TeamModal embedded />);
    act(() => mocks.iguardRoles.mock.calls[0][1](new Error("permission_denied")));
    act(() => mocks.mainAdmins.mock.calls[0][1](new Error("permission_denied")));
    expect(screen.getByRole("alert")).toHaveTextContent("현장 역할");
    expect(screen.getByRole("alert")).toHaveTextContent("통합관리자");
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.queryByText("승인된 팀원이 없습니다.")).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });

  it("정상 조회 뒤 역할 원장이 실패해도 이전 배정을 편집할 수 없게 한다", () => {
    render(<TeamModal embedded />);
    act(() => receiveAll(0, true));
    expect(screen.getByRole("combobox", { name: "테스트 팀원 학기 역할" })).toBeEnabled();
    act(() => mocks.iguardRoles.mock.calls[0][1](new Error("permission_denied")));
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("현장 역할");
  });

  it("재조회는 기존 구독을 해제하고 새 원장을 모두 읽은 뒤 실제 빈 상태를 표시한다", () => {
    render(<TeamModal embedded />);
    act(() => mocks.admins.mock.calls[0][1](new Error("permission_denied")));
    fireEvent.click(screen.getByRole("button", { name: "다시 불러오기" }));
    expect(mocks.unsubscribe).toHaveBeenCalledTimes(6);
    expect(mocks.admins).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toBeInTheDocument();
    act(() => receiveAll(1));
    expect(screen.getByText("승인된 팀원이 없습니다.")).toBeInTheDocument();
    expect(screen.getByText("대기 중인 요청이 없습니다.")).toBeInTheDocument();
  });

  it("StrictMode에서 해제한 구독의 늦은 성공과 실패를 무시한다", () => {
    render(<StrictMode><TeamModal embedded /></StrictMode>);
    act(() => receiveAll(1, true));
    act(() => mocks.admins.mock.calls[0][0]({}));
    act(() => mocks.iguardRoles.mock.calls[0][1](new Error("stale error")));
    expect(screen.getByRole("combobox", { name: "테스트 팀원 학기 역할" })).toBeEnabled();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("역할 설명은 기본 접힌 안내에 보존하고 승인 업무를 먼저 확인하게 한다", () => {
    render(<TeamModal embedded />);
    act(() => receiveAll());
    const summary = screen.getByText("역할 안내");
    const details = summary.closest("details");
    expect(details).not.toHaveAttribute("open");
    expect(details).toHaveTextContent("학기 역할");
    expect(details).toHaveTextContent("방학 역할");
    expect(screen.getByRole("heading", { name: "승인 대기" })).toBeVisible();
  });

  it("계정이 바뀌면 전 계정의 목록과 편집 상태를 폐기한다", () => {
    const { rerender } = render(<TeamModal embedded />);
    act(() => receiveAll(0, true));
    expect(screen.getByRole("combobox", { name: "테스트 팀원 학기 역할" })).toBeEnabled();
    mocks.auth.user = { uid: "next-admin", email: "next@example.test" };
    rerender(<TeamModal embedded />);
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(mocks.unsubscribe).toHaveBeenCalledTimes(6);
  });
});
