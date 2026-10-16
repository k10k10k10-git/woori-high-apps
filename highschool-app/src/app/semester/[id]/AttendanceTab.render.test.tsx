/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { Application, SessionAttendance } from "@/features/semester/types";
const mock = vi.hoisted(() => ({ mobile: true, save: vi.fn().mockResolvedValue(undefined), listener: null as null | ((value: SessionAttendance) => void) }));
vi.mock("@/context/AuthContext", () => ({ useAuth: () => ({ user: { uid: "synthetic-admin" } }) }));
vi.mock("@/context/UIContext", () => ({ useUI: () => ({ toast: vi.fn() }) }));
vi.mock("@/context/ViewModeContext", () => ({ useViewMode: () => ({ isMobileView: mock.mobile }) }));
vi.mock("@/features/semester/db", () => ({
  describeApplicant: () => "1부 · 1학년", setAttendance: mock.save, clearAttendance: vi.fn(), updateCompletionEntry: vi.fn(),
  subscribeSessionAttendance: (_sid: string, _scope: string, _session: string, callback: (value: SessionAttendance) => void) => {
    mock.listener = callback; callback({ "app-test": { s: "지각" } }); return () => { mock.listener = null; };
  }, subscribeAllAttendance: vi.fn(() => () => {}), subscribeCompletion: vi.fn(() => () => {}),
}));
import AttendanceTab from "./AttendanceTab";
afterEach(() => { cleanup(); vi.clearAllMocks(); mock.mobile = true; });
it("모바일 회차 입력에서 지각을 별도 집계하고 저장 요청에도 지각을 유지한다", async () => {
  const member: Application = { id: "app-test", studentId: "student-test", name: "합성 학생", bu: "1부", grade: 1, class: 1, status: "배치", teamId: "team-test", createdAt: "2026-09-01" };
  render(<AttendanceTab sid="2026-2" teams={[]} trainingClasses={[]} sessions={[{ id: "session-test", date: "2026-09-12", type: "정규" }]} applications={[member]} teamById={new Map()} meta={null} />);
  expect(screen.getByRole("status")).toHaveTextContent("선택하면 자동 저장");
  expect(screen.getByText("지각 1")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "합성 학생 지각" })).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByRole("button", { name: "합성 학생 출석" })).toHaveAttribute("aria-pressed", "false");
  fireEvent.click(screen.getByRole("button", { name: "합성 학생 지각" }));
  await waitFor(() => expect(mock.save).toHaveBeenCalledWith("2026-2", "team", "session-test", "app-test", "지각", "synthetic-admin", { subjectName: "합성 학생", date: "2026-09-12" }));
  expect(screen.getByRole("status")).toHaveTextContent("저장 완료");
});

it("PC 표 보기에서도 입력 전에 자동 저장 방식을 표시한다", () => {
  mock.mobile = false;
  render(<AttendanceTab sid="2026-2" teams={[]} trainingClasses={[]} sessions={[{ id: "session-test", date: "2026-09-12", type: "정규" }]} applications={[]} teamById={new Map()} meta={null} />);
  expect(screen.getByRole("tab", { name: "표로 보기" })).toHaveAttribute("aria-selected", "true");
  expect(screen.getByRole("status")).toHaveTextContent("선택하면 자동 저장");
});

it("주차를 바꾸면 이전 주차의 저장 완료를 현재 주차 상태로 표시하지 않는다", async () => {
  const member: Application = { id: "app-test", studentId: "student-test", name: "합성 학생", bu: "1부", grade: 1, class: 1, status: "배치", teamId: "team-test", createdAt: "2026-09-01" };
  render(<AttendanceTab sid="2026-2" teams={[]} trainingClasses={[]} sessions={[{ id: "first", date: "2026-09-12", type: "정규" }, { id: "second", date: "2026-09-19", type: "정규" }]} applications={[member]} teamById={new Map()} meta={null} />);
  fireEvent.change(screen.getByRole("combobox", { name: "주차 선택" }), { target: { value: "first" } });
  fireEvent.click(screen.getByRole("button", { name: "합성 학생 지각" }));
  await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("저장 완료"));
  fireEvent.change(screen.getByRole("combobox", { name: "주차 선택" }), { target: { value: "second" } });
  expect(screen.getByRole("status")).toHaveTextContent("선택하면 자동 저장");
});
