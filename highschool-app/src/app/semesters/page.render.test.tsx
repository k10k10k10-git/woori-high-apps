/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import SemestersPage from "./page";

const mocks = vi.hoisted(() => ({ subscribe: vi.fn(), stop: vi.fn(), toast: vi.fn(), auth: { user: { uid: "admin", email: "admin@example.test" }, loading: false, roleError: false, roles: { semester: "superAdmin", retreat: "none" }, teamMemberships: {}, retryRoles: vi.fn() } }));
vi.mock("@/context/AuthContext", () => ({ useAuth: () => mocks.auth }));
vi.mock("@/context/UIContext", () => ({ useUI: () => ({ toast: mocks.toast }) }));
vi.mock("@/features/semester/db", () => ({ subscribeSemesters: mocks.subscribe, createSemester: vi.fn(), removeSemester: vi.fn() }));
beforeEach(() => { vi.clearAllMocks(); mocks.auth.loading = false; mocks.auth.roleError = false; mocks.auth.roles = { semester: "superAdmin", retreat: "none" }; mocks.subscribe.mockReturnValue(mocks.stop); });
afterEach(cleanup);

it.each(["denied", "loading", "roleError"])("학기 목록의 %s 상태는 구독을 시작하지 않는다", (state) => {
  mocks.auth.loading = state === "loading";
  mocks.auth.roleError = state === "roleError";
  if (state === "denied") mocks.auth.roles = { semester: "none", retreat: "fieldStaff" };
  render(<SemestersPage />);
  expect(mocks.subscribe).not.toHaveBeenCalled();
  expect(screen.queryByText(/아직 학기가 없습니다/)).not.toBeInTheDocument();
});

it("첫 결과 전에는 빈 목록을 표시하지 않고 실패 후 실제 재구독한다", () => {
  render(<SemestersPage />);
  expect(screen.getByText("목록 불러오는 중…")).toBeInTheDocument();
  expect(screen.queryByText(/아직 학기가 없습니다/)).not.toBeInTheDocument();
  const first = mocks.subscribe.mock.calls[0];
  act(() => first[1](new Error("PERMISSION_DENIED secret/path")));
  expect(screen.getByRole("alert")).not.toHaveTextContent("secret/path");
  expect(screen.getByRole("button", { name: "생성" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "다시 불러오기" }));
  expect(mocks.stop).toHaveBeenCalledOnce();
  expect(mocks.subscribe).toHaveBeenCalledTimes(2);
  act(() => first[0]([{ id: "old", meta: { title: "이전 결과" } }]));
  expect(screen.queryByText("이전 결과")).not.toBeInTheDocument();
  act(() => mocks.subscribe.mock.calls[1][0]([]));
  expect(screen.getByText(/아직 학기가 없습니다/)).toBeInTheDocument();
});
