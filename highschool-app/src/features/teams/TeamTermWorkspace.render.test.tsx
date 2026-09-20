/** @vitest-environment jsdom */
import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  private: vi.fn(),
  classes: vi.fn(),
  staff: vi.fn(),
  auth: {
    user: { uid: "team-member" },
    loading: false,
    roles: { semester: "praise", retreat: "none" } as const,
    teamMemberships: { praise: { role: "staff" as const, active: true } },
    signIn: vi.fn(),
  },
}));

vi.mock("@/context/AuthContext", () => ({
  useAuth: () => mocks.auth,
}));

vi.mock("@/app/semester/[id]/AttendanceTab", () => ({ default: () => null }));
vi.mock("@/app/semester/[id]/CurriculumTab", () => ({ default: () => null }));
vi.mock("@/app/semester/[id]/ArchiveTab", () => ({ default: () => null }));

vi.mock("@/features/semester/db", () => ({
  subscribeSemesterMeta: (_id: string, cb: (value: unknown) => void) => { cb({ title: "2026년 2학기", completionRule: { minRate: 0.7 }, createdAt: "2026-08-01" }); return () => {}; },
  subscribeTeams: (_id: string, cb: (value: unknown) => void) => { cb([{ id: "team-1", teamKey: "praise", name: "찬양팀", color: "", order: 1 }]); return () => {}; },
  subscribeTrainingClasses: (_id: string, cb: (value: unknown) => void) => { cb([]); return () => {}; },
  subscribeSessions: (_id: string, cb: (value: unknown) => void) => { cb([]); return () => {}; },
  subscribeApplications: (_id: string, cb: (value: unknown) => void) => { cb([{ id: "1_student-1", studentId: "student-1", bu: "1부", grade: 1, class: 2, name: "팀원학생", status: "배치", teamId: "team-1", createdAt: "2026-08-01" }]); return () => {}; },
  subscribeApplicationsPrivate: mocks.private,
  subscribeClassesByYear: (_year: string, cb: (value: unknown) => void) => { mocks.classes(); cb([{ classKey: "1-1-2", students: { "student-1": { name: "팀원학생", phone: "010-1111-2222", pphone: "010-3333-4444" } } }]); return () => {}; },
  subscribeStaffByYear: (_year: string, cb: (value: unknown) => void) => { mocks.staff(); cb([]); return () => {}; },
}));

import TeamTermWorkspace from "./TeamTermWorkspace";

describe("TeamTermWorkspace 팀 연락처", () => {
  beforeEach(() => vi.clearAllMocks());

  it("일반 팀원에게 공식 원장 연락처만 표시한다", async () => {
    render(<TeamTermWorkspace teamKey="praise" semesterId="2026-2" section="roster" />);

    expect(await screen.findByRole("link", { name: "010-1111-2222" })).toHaveAttribute("href", "tel:010-1111-2222");
    expect(screen.getByText(/보호자 010-3333-4444/)).toBeInTheDocument();
    await waitFor(() => expect(mocks.classes).toHaveBeenCalledOnce());
    expect(mocks.staff).toHaveBeenCalledOnce();
    expect(mocks.private).not.toHaveBeenCalled();
  });
});
