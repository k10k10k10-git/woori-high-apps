/** @vitest-environment jsdom */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useSemesterCanEdit } from "@/features/semester/EditContext";

const mock = vi.hoisted(() => ({ user: { uid: "synthetic-leader" }, training: vi.fn(), settings: vi.fn(), replace: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mock.replace }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/context/AuthContext", () => ({
  useAuth: () => ({
    user: mock.user, loading: false, roleError: null,
    roles: { semester: "leader", retreat: "none" },
    teamMemberships: { media: { role: "leader", active: true, semesters: { "2026-2": true } } },
  }),
}));
vi.mock("@/context/ViewModeContext", () => ({ useViewMode: () => ({ isMobileView: true }) }));
vi.mock("@/features/semester/db", () => {
  const values = (_sid: string, receive: (value: []) => void) => { receive([]); return () => {}; };
  return {
    subscribeSemesterMeta: (_sid: string, receive: (value: null) => void) => { receive(null); return () => {}; },
    subscribeTeams: values, subscribeSessions: values, subscribeApplications: values,
    subscribeTrainingClasses: mock.training,
  };
});
vi.mock("./IntakeTab", () => ({ default: () => null }));
vi.mock("./AssignTab", () => ({ default: () => null }));
vi.mock("./CurriculumTab", () => ({ default: () => null }));
vi.mock("./ArchiveTab", () => ({ default: () => null }));
vi.mock("./SettingsTab", () => ({ default: mock.settings }));
vi.mock("./AttendanceTab", () => ({ default: function MockAttendance({ lockedScope }: { lockedScope?: string }) {
  const canEdit = useSemesterCanEdit();
  return <output>{lockedScope} {canEdit ? "편집" : "조회"}</output>;
} }));

import SemesterClient from "./SemesterClient";
afterEach(cleanup);

it("연결된 팀장이 설정 주소로 진입해도 사역팀 조회만 열고 설정·훈련을 마운트하지 않는다", async () => {
  render(<SemesterClient semesterId="2026-2" initialTab="설정" />);
  expect(await screen.findByRole("heading", { name: "사역팀 전체 명단·출석" })).toBeInTheDocument();
  expect(screen.getByText("team 조회")).toBeInTheDocument();
  expect(mock.training).not.toHaveBeenCalled();
  expect(mock.settings).not.toHaveBeenCalled();
  expect(mock.replace).not.toHaveBeenCalled();
});
