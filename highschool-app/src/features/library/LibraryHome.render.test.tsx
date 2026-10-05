/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MinistryRoles } from "@/features/portal/accessPolicy";

const mocks = vi.hoisted(() => ({
  semesterCalls: vi.fn(),
  roleError: false,
  archiveCalls: [] as string[],
  auth: {
    user: { uid: "synthetic-staff" },
    loading: false,
    roles: { semester: "praise", retreat: "none" } as MinistryRoles,
    teamMemberships: { praise: { role: "staff" as const, active: true } },
    signIn: vi.fn(),
  },
}));

vi.mock("@/context/AuthContext", () => ({ useAuth: () => ({ ...mocks.auth, roleError: mocks.roleError }) }));
vi.mock("@/features/semester/db", () => ({
  subscribeSemesters: (cb: (items: unknown[]) => void) => {
    mocks.semesterCalls();
    cb([
      { id: "2026-2", meta: { title: "2026년 2학기" } },
      { id: "2026-1", meta: { title: "2026년 1학기" } },
    ]);
    return () => {};
  },
  subscribeTeams: (id: string, cb: (teams: unknown[]) => void) => {
    cb(id === "2026-2" ? [{ id: "team-praise", teamKey: "praise", name: "찬양팀" }] : [{ id: "team-worship", teamKey: "worship", name: "예배팀" }]);
    return () => {};
  },
  subscribeArchiveLinks: (id: string, cb: (links: unknown[]) => void) => {
    mocks.archiveCalls.push(id);
    cb(id === "2026-2"
      ? [{ id: "guide", title: "찬양팀 안내", kind: "doc", url: "https://example.test/guide" }, { id: "sheet", title: "팀 일정표", kind: "sheet", url: "https://example.test/sheet" }]
      : [{ id: "other", title: "다른 팀 비공개 자료", kind: "doc", url: "https://example.test/other" }]);
    return () => {};
  },
}));

import LibraryHome from "./LibraryHome";

afterEach(cleanup);
beforeEach(() => {
  mocks.archiveCalls.length = 0;
  mocks.roleError = false;
  mocks.semesterCalls.mockClear();
  mocks.auth.roles = { semester: "praise", retreat: "none" };
  mocks.auth.teamMemberships = { praise: { role: "staff", active: true } };
});

describe("자료 화면", () => {
  it("팀원에게 연결된 학기 자료만 조회하고 제목·종류로 찾는다", async () => {
    render(<LibraryHome />);
    expect(await screen.findByRole("link", { name: "찬양팀 안내" })).toHaveAttribute("href", "https://example.test/guide");
    expect(mocks.archiveCalls).toEqual(["2026-2"]);
    expect(screen.queryByText("다른 팀 비공개 자료")).not.toBeInTheDocument();

    fireEvent.change(screen.getByRole("searchbox", { name: "자료 검색" }), { target: { value: "일정" } });
    expect(screen.queryByRole("link", { name: "찬양팀 안내" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "팀 일정표" })).toBeInTheDocument();

    fireEvent.change(screen.getByRole("combobox", { name: "자료 종류" }), { target: { value: "doc" } });
    expect(screen.getByText("검색 조건에 맞는 자료가 없습니다.")).toBeInTheDocument();
  });

  it("전체 운영자는 기존 학기 자료 경로를 모두 확인한다", async () => {
    mocks.auth.roles = { semester: "superAdmin", retreat: "none" };
    render(<LibraryHome />);
    expect(await screen.findByRole("link", { name: "다른 팀 비공개 자료" })).toBeInTheDocument();
    await waitFor(() => expect(mocks.archiveCalls).toEqual(["2026-2", "2026-1"]));
  });
});

it.each(["roleError", "none"])("자료의 %s 계정은 제한 데이터 구독을 시작하지 않는다", (state) => {
  mocks.roleError = state === "roleError";
  if (state === "none") { mocks.auth.roles = { semester: "none", retreat: "none" }; mocks.auth.teamMemberships = {} as typeof mocks.auth.teamMemberships; }
  render(<LibraryHome />);
  expect(mocks.semesterCalls).not.toHaveBeenCalled();
  expect(mocks.archiveCalls).toHaveLength(0);
  expect(screen.getByRole("heading")).toHaveTextContent(state === "roleError" ? "권한을 확인하지 못했습니다" : "접근 권한이 필요합니다");
});
