/** @vitest-environment jsdom */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MinistryRoles } from "@/features/portal/accessPolicy";

const mocks = vi.hoisted(() => ({
  private: vi.fn(),
  contacts: vi.fn(),
  linked: true,
  auth: {
    user: { uid: "team-member" },
    loading: false,
    roles: { semester: "praise", retreat: "none" } as MinistryRoles,
    teamMemberships: { praise: { role: "staff" as const, active: true } },
    signIn: vi.fn(),
  },
}));

vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams() }));

vi.mock("@/context/AuthContext", () => ({
  useAuth: () => mocks.auth,
}));

vi.mock("./teamContacts", () => ({
  fetchTeamRosterContacts: mocks.contacts,
}));

vi.mock("@/app/semester/[id]/AttendanceTab", () => ({ default: () => null }));
vi.mock("@/app/semester/[id]/CurriculumTab", () => ({ default: ({ operationsBaseHref }: { operationsBaseHref?: string }) => <output data-testid="curriculum-operations">{operationsBaseHref}</output> }));
vi.mock("@/app/semester/[id]/ArchiveTab", () => ({ default: () => null }));

vi.mock("@/features/semester/db", () => ({
  subscribeSemesterMeta: (_id: string, cb: (value: unknown) => void) => { cb({ title: "2026년 2학기", completionRule: { minRate: 0.7 }, createdAt: "2026-08-01" }); return () => {}; },
  subscribeTeams: (_id: string, cb: (value: unknown) => void) => { cb(mocks.linked ? [{ id: "team-1", teamKey: "praise", name: "찬양팀", color: "", order: 1 }] : []); return () => {}; },
  subscribeTrainingClasses: (_id: string, cb: (value: unknown) => void) => { cb([]); return () => {}; },
  subscribeSessions: (_id: string, cb: (value: unknown) => void) => { cb([]); return () => {}; },
  subscribeApplications: (_id: string, cb: (value: unknown) => void) => { cb([{ id: "1_student-1", studentId: "student-1", bu: "1부", grade: 1, class: 2, name: "팀원학생", status: "배치", teamId: "team-1", createdAt: "2026-08-01" }]); return () => {}; },
  subscribeApplicationsPrivate: (_id: string, cb: (value: unknown) => void) => { mocks.private(); cb({ "1_student-1": { phone: "010-9999-0000", parentPhone: "010-8888-0000" } }); return () => {}; },
}));

import TeamTermWorkspace from "./TeamTermWorkspace";
afterEach(() => { mocks.linked = true; });

describe("TeamTermWorkspace 팀 연락처", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.linked = true;
    mocks.contacts.mockResolvedValue({ "1_student-1": { phone: "010-1111-2222", parentPhone: "010-3333-4444" } });
    mocks.auth.user = { uid: "team-member" };
    mocks.auth.roles = { semester: "praise", retreat: "none" };
  });

  it("일반 팀원에게 공식 원장 연락처만 표시한다", async () => {
    render(<TeamTermWorkspace teamKey="praise" semesterId="2026-2" section="roster" />);

    expect(await screen.findByRole("link", { name: "010-1111-2222" })).toHaveAttribute("href", "tel:010-1111-2222");
    expect(screen.getByRole("link", { name: "010-3333-4444" })).toHaveAttribute("href", "tel:010-3333-4444");
    await waitFor(() => expect(mocks.contacts).toHaveBeenCalledOnce());
    expect(mocks.private).not.toHaveBeenCalled();
  });

  it("팀 화면으로 돌아오면 공식 원장 연락처를 다시 읽는다", async () => {
    mocks.contacts
      .mockResolvedValueOnce({ "1_student-1": { phone: "010-1111-2222" } })
      .mockResolvedValueOnce({ "1_student-1": { phone: "010-2222-3333" } });
    render(<TeamTermWorkspace teamKey="praise" semesterId="2026-2" section="roster" />);
    expect(await screen.findByRole("link", { name: "010-1111-2222" })).toBeInTheDocument();

    fireEvent.focus(window);
    expect(await screen.findByRole("link", { name: "010-2222-3333" })).toBeInTheDocument();
    expect(mocks.contacts).toHaveBeenCalledTimes(2);
  });

  it("연락처만 실패해도 명단을 표시하고 재조회 성공 후 오류를 지운다", async () => {
    mocks.contacts.mockRejectedValueOnce(new Error("연락처 조회 실패"))
      .mockResolvedValueOnce({ "1_student-1": { phone: "010-1111-2222" } });
    render(<TeamTermWorkspace teamKey="praise" semesterId="2026-2" section="roster" />);
    expect(await screen.findByRole("alert")).toHaveTextContent("팀 연락처");
    expect(screen.getByRole("alert")).not.toHaveTextContent("연락처 조회 실패");
    expect(screen.getByText("팀원학생")).toBeInTheDocument();
    fireEvent.focus(window);
    expect(await screen.findByRole("link", { name: "010-1111-2222" })).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
  });

  it("관리자에서 일반 팀원으로 계정을 바꾸면 이전 계정의 신청서 연락처를 남기지 않는다", async () => {
    mocks.auth.user = { uid: "admin" };
    mocks.auth.roles = { semester: "superAdmin", retreat: "none" };
    const view = render(<TeamTermWorkspace teamKey="praise" semesterId="2026-2" section="roster" />);
    expect(await screen.findByRole("link", { name: "010-9999-0000" })).toBeInTheDocument();

    mocks.auth.user = { uid: "team-member" };
    mocks.auth.roles = { semester: "praise", retreat: "none" };
    view.rerender(<TeamTermWorkspace teamKey="praise" semesterId="2026-2" section="roster" />);

    expect(await screen.findByRole("link", { name: "010-1111-2222" })).toBeInTheDocument();
    expect(screen.queryByText("010-9999-0000")).not.toBeInTheDocument();
    expect(screen.queryByText(/010-8888-0000/)).not.toBeInTheDocument();
    expect(mocks.private).toHaveBeenCalledOnce();
  });
});

describe("팀 학기 빈 상태의 중앙 운영 경로", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.linked = true;
    mocks.contacts.mockResolvedValue({});
    mocks.auth.roles = { semester: "praise", retreat: "none" };
  });

  it.each([
    ["pastor", "/operations/semesters/2026-2"],
    ["praise", ""],
    ["leader", ""],
  ] as const)("%s 역할은 중앙 운영 권한에 맞는 복구 경로만 전달한다", async (semester, expected) => {
    mocks.auth.roles = { semester, retreat: "none" };
    render(<TeamTermWorkspace teamKey="praise" semesterId="2026-2" section="curriculum" />);
    expect(await screen.findByTestId("curriculum-operations")).toHaveTextContent(expected);
    if (!expected) expect(screen.getByTestId("curriculum-operations")).toBeEmptyDOMElement();
  });

  it.each(["pastor", "praise"] as const)("팀 연결이 없으면 %s 역할에 맞는 다음 행동을 제공한다", async (semester) => {
    mocks.linked = false;
    mocks.auth.roles = { semester, retreat: "none" };
    render(<TeamTermWorkspace teamKey="praise" semesterId="2026-2" section="curriculum" />);
    expect(await screen.findByRole("heading", { name: "이 학기에 연결된 팀이 없습니다" })).toBeInTheDocument();
    if (semester === "pastor") expect(screen.getByRole("link", { name: "학기 운영 설정 열기" })).toHaveAttribute("href", "/operations/semesters/2026-2/settings");
    else {
      expect(screen.getByText(/담당 교역자 또는 행정팀에 찬양팀의 학기 연결/)).toBeInTheDocument();
      expect(screen.queryByRole("link", { name: "학기 운영 설정 열기" })).not.toBeInTheDocument();
    }
  });
});

it("팀 명단 검색과 출결 링크가 같은 학기를 유지한다", async () => {
  render(<TeamTermWorkspace teamKey="praise" semesterId="2026-2" section="roster" />);
  expect(await screen.findByText("팀원학생")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "출석" })).toHaveAttribute("href", "/teams/praise/ongoing?semester=2026-2&tab=attendance");
  fireEvent.change(screen.getByLabelText("이름 검색"), { target: { value: "없는 이름" } });
  expect(screen.queryByText("팀원학생")).not.toBeInTheDocument();
  expect(screen.getByText(/검색 결과가 없습니다/)).toBeInTheDocument();
});
