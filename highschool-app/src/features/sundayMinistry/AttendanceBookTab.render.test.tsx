/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ classes: vi.fn(), attendance: vi.fn(), events: vi.fn(), stopped: vi.fn() }));
vi.mock("@/lib/db/students", () => ({
  subscribeToClassesByYear: mocks.classes,
  subscribeToAttendanceByYear: mocks.attendance,
  subscribeToAttendanceEventsByYear: mocks.events,
}));
import AttendanceBookTab from "./AttendanceBookTab";

beforeEach(() => {
  mocks.classes.mockImplementation((_year, cb) => { cb({ "1-1-1": { teacher: "담당 교사", students: { a: { name: "가상 하나" }, b: { name: "가상 둘" }, c: { name: "가상 장결", jang: true } } } }); return mocks.stopped; });
  mocks.attendance.mockImplementation((_year, cb) => { cb({ "1-1-1": { a: { "0-0": "O" }, c: { "0-0": "X" } } }); return mocks.stopped; });
  mocks.events.mockImplementation((_year, cb) => { cb({}); return mocks.stopped; });
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });

it("연간 원본을 조회하고 주일별 미입력과 장결을 구별하며 누적표·검색을 제공한다", () => {
  render(<AttendanceBookTab year={2026} />);
  fireEvent.change(screen.getByLabelText("출석 조회 주일"), { target: { value: "0-0" } });
  expect(screen.getByText("입력 대상 2명")).toBeInTheDocument();
  expect(screen.getByText("기록된 학생 1명")).toBeInTheDocument();
  expect(screen.getByText("미입력 학생 1명")).toBeInTheDocument();
  const roster = screen.getByRole("list", { name: "선택한 주일의 학생 출석" });
  expect(within(roster).getAllByText("미입력")).toHaveLength(1);
  expect(screen.getByRole("link", { name: "원본 출석부에서 수정" })).toHaveAttribute("href", "https://woori-high.web.app/attendance");
  expect(screen.queryByRole("button", { name: /저장/ })).not.toBeInTheDocument();
  fireEvent.change(screen.getByRole("searchbox", { name: "학생 이름 검색" }), { target: { value: "가상하나" } });
  expect(within(roster).getAllByRole("listitem")).toHaveLength(1);
  fireEvent.click(screen.getByRole("button", { name: "누적표" }));
  expect(screen.getByRole("table")).toBeInTheDocument();
  expect(screen.getByLabelText("누적표 기간")).toHaveValue("all");
  expect(mocks.classes.mock.calls[0][0]).toBe(2026);
});

it("구독 실패를 빈 반으로 표시하지 않고 다시 불러올 때 재구독한다", () => {
  mocks.classes.mockImplementationOnce((_year, _cb, fail) => { fail(new Error("민감 경로 오류")); return mocks.stopped; });
  render(<AttendanceBookTab year={2026} />);
  expect(screen.getByRole("alert")).toHaveTextContent("반·학생 명단");
  expect(screen.getByRole("alert")).not.toHaveTextContent("민감 경로 오류");
  expect(screen.queryByText("2026년 1부 반 명단이 없습니다.")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "다시 불러오기" }));
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  expect(screen.getByText("가상 하나")).toBeInTheDocument();
  expect(mocks.classes).toHaveBeenCalledTimes(2);
});

it("연도가 바뀌면 이전 명단을 감추고 종료된 구독의 늦은 실패를 무시한다", () => {
  const view = render(<AttendanceBookTab year={2026} />);
  const oldFailure = mocks.classes.mock.calls[0][2];
  mocks.classes.mockImplementation(() => mocks.stopped);
  mocks.attendance.mockImplementation(() => mocks.stopped);
  mocks.events.mockImplementation(() => mocks.stopped);
  view.rerender(<AttendanceBookTab year={2027} />);
  expect(screen.getByRole("status")).toHaveTextContent("2027년 출석부를 불러오고 있습니다");
  expect(screen.queryByText("가상 하나")).not.toBeInTheDocument();
  oldFailure(new Error("이전 연도 실패"));
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  expect(mocks.stopped).toHaveBeenCalledTimes(3);
});
