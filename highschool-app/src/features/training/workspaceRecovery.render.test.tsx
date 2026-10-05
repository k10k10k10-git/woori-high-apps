/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ applications: vi.fn(), stopped: vi.fn(), auth: { user: { uid: "pastor" }, loading: false, roleError: null, roles: { semester: "pastor", retreat: "none" }, teamMemberships: {} } }));
vi.mock("@/context/AuthContext", () => ({ useAuth: () => mocks.auth }));
vi.mock("@/app/semester/[id]/AttendanceTab", () => ({ default: () => null }));
vi.mock("@/app/semester/[id]/CurriculumTab", () => ({ default: () => null }));
vi.mock("@/features/semester/db", () => ({
  subscribeSemesterMeta: (_id: string, cb: (v: unknown) => void) => { cb({ title: "훈련 학기" }); return () => {}; },
  subscribeTeams: (_id: string, cb: (v: unknown) => void) => { cb([]); return () => {}; },
  subscribeTrainingClasses: (_id: string, cb: (v: unknown) => void) => { cb([{ id: "class", name: "2학년 훈련" }]); return () => {}; },
  subscribeSessions: (_id: string, cb: (v: unknown) => void) => { cb([]); return () => {}; },
  subscribeApplications: mocks.applications,
  subscribeApplicationsPrivate: (_id: string, cb: (v: unknown) => void) => { cb({}); return () => {}; },
  subscribeClassesByYear: (_id: string, cb: (v: unknown) => void) => { cb([]); return () => {}; },
  subscribeStaffByYear: (_id: string, cb: (v: unknown) => void) => { cb([]); return () => {}; },
}));
import TrainingTermWorkspace from "./TrainingTermWorkspace";
afterEach(cleanup);
it("필수 명단 구독 실패를 빈 명단으로 보이지 않고 재시도 때 구독을 새로 연결한다", async () => {
  mocks.applications.mockImplementationOnce((_id, _cb, fail) => { fail(new Error("명단 연결 실패")); return mocks.stopped; })
    .mockImplementation((_id, cb) => { cb([{ id: "app", name: "가상 학생", trainingClassId: "class", status: "배치" }]); return () => {}; });
  render(<TrainingTermWorkspace semesterId="2026-2" section="roster" />);
  expect(await screen.findByRole("alert")).toHaveTextContent("신청 명단");
  expect(screen.getByRole("alert")).not.toHaveTextContent("명단 연결 실패");
  expect(screen.queryByText("훈련반에 배치된 인원이 없습니다.")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "다시 불러오기" }));
  expect(await screen.findAllByText("가상 학생")).toHaveLength(2);
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  expect(mocks.stopped).toHaveBeenCalledOnce();
});
