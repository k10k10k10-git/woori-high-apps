/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { Application, SessionAttendance } from "@/features/semester/types";
const mock = vi.hoisted(() => ({ mobile: true, save: vi.fn().mockResolvedValue(undefined), subscribe: vi.fn(), all: vi.fn(), listener: null as null | ((value: SessionAttendance) => void) }));
vi.mock("@/context/AuthContext", () => ({ useAuth: () => ({ user: { uid: "synthetic-admin" } }) }));
vi.mock("@/context/UIContext", () => ({ useUI: () => ({ toast: vi.fn() }) }));
vi.mock("@/context/ViewModeContext", () => ({ useViewMode: () => ({ isMobileView: mock.mobile }) }));
vi.mock("@/features/semester/db", () => ({
  describeApplicant: () => "1부 · 1학년", setAttendance: mock.save, clearAttendance: vi.fn(), updateCompletionEntry: vi.fn(),
  subscribeSessionAttendance: mock.subscribe,
  subscribeAllAttendance: mock.all, subscribeCompletion: vi.fn(() => () => {}),
}));
import AttendanceTab from "./AttendanceTab";
import { SemesterEditProvider } from "@/features/semester/EditContext";
beforeEach(() => {
  mock.subscribe.mockReset().mockImplementation((_sid: string, _scope: string, _session: string, callback: (value: SessionAttendance) => void) => {
    mock.listener = callback; callback({ "app-test": { s: "지각" } }); return () => { mock.listener = null; };
  });
  mock.all.mockReset().mockImplementation(() => () => {});
});
afterEach(() => { cleanup(); vi.clearAllMocks(); mock.mobile = true; });

it.each([undefined, "/operations/semesters/2026-2"])("회차가 없으면 운영 권한에 맞는 등록 경로를 안내한다 (%s)", (operationsBaseHref) => {
  render(<AttendanceTab sid="2026-2" teams={[]} trainingClasses={[]} sessions={[]} applications={[]} teamById={new Map()} meta={null} operationsBaseHref={operationsBaseHref} />);
  if (operationsBaseHref) expect(screen.getByRole("link", { name: "학기 운영 설정 열기" })).toHaveAttribute("href", "/operations/semesters/2026-2/settings");
  else {
    expect(screen.getByText(/담당 교역자 또는 행정팀에 이 학기의 회차 등록을 요청/)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "학기 운영 설정 열기" })).not.toBeInTheDocument();
  }
  expect(screen.queryByText(/설정 탭/)).not.toBeInTheDocument();
});

it.each([undefined, "/operations/semesters/2026-2"])("명단이 없으면 현재 학기의 배치를 확인하도록 안내한다 (%s)", (operationsBaseHref) => {
  render(<SemesterEditProvider canEdit={false}><AttendanceTab sid="2026-2" teams={[]} trainingClasses={[]} sessions={[{ id: "meeting", date: "2026-09-12", type: "정규" }]} applications={[]} teamById={new Map()} meta={null} operationsBaseHref={operationsBaseHref} /></SemesterEditProvider>);
  if (operationsBaseHref) expect(screen.getByRole("link", { name: "학기 배치 확인하기" })).toHaveAttribute("href", "/operations/semesters/2026-2/placements");
  else {
    expect(screen.getByText(/담당 교역자 또는 행정팀에 학기 배치를 확인/)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "학기 배치 확인하기" })).not.toBeInTheDocument();
  }
  expect(screen.queryByText(/배치 탭/)).not.toBeInTheDocument();
});
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

it("출석 조회 실패를 한국어로 안내하고 같은 주차에서 재구독한다", () => {
  let fail!: (error: Error) => void;
  mock.subscribe.mockImplementationOnce((_sid, _scope, _session, receive, onError) => {
    receive({ "app-test": { s: "지각" } }); fail = onError; return () => {};
  });
  const member = { id: "app-test", studentId: "s", name: "합성 학생", bu: "1부", grade: 1, class: 1, status: "배치", teamId: "team-test", createdAt: "2026-09-01" } as Application;
  render(<AttendanceTab sid="2026-2" teams={[]} trainingClasses={[]} sessions={[{ id: "meeting", date: "2026-09-12", type: "정규" }]} applications={[member]} teamById={new Map()} meta={null} />);
  act(() => fail(new Error("PERMISSION_DENIED/secret-path")));
  expect(screen.getByRole("button", { name: "합성 학생 출석" })).toBeDisabled();
  expect(screen.getByText("지각 1")).toBeInTheDocument();
  expect(screen.queryByText(/PERMISSION_DENIED/)).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "다시 불러오기" }));
  expect(mock.subscribe).toHaveBeenCalledTimes(2);
  expect(screen.getByRole("combobox", { name: "주차 선택" })).toHaveValue("meeting");
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "합성 학생 출석" })).toBeEnabled();
});

it("표 보기의 다른 구독 성공이 실패한 출석 원장을 숨기지 않는다", () => {
  mock.mobile = false;
  mock.all.mockImplementationOnce((_sid, _scope, _receive, fail) => { fail(new Error("blocked")); return () => {}; })
    .mockImplementation((_sid, _scope, receive) => { receive({}); return () => {}; });
  render(<AttendanceTab sid="2026-2" teams={[]} trainingClasses={[]} sessions={[{ id: "meeting", date: "2026-09-12", type: "정규" }]} applications={[]} teamById={new Map()} meta={null} />);
  expect(screen.getByRole("alert")).toHaveTextContent("출석 기록을 불러오지 못했습니다");
  fireEvent.click(screen.getByRole("button", { name: "다시 불러오기" }));
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});

it("재시도 응답이 늦어도 현재 주차를 확인하기 전에는 입력을 열지 않는다", () => {
  let receive!: (value: SessionAttendance) => void;
  mock.subscribe.mockImplementationOnce((_sid, _scope, _session, _receive, fail) => { fail(new Error("연결 실패")); return () => {}; })
    .mockImplementationOnce((_sid, _scope, _session, next) => { receive = next; return () => {}; });
  const member = { id: "app-test", studentId: "s", name: "합성 학생", bu: "1부", grade: 1, class: 1, status: "배치", teamId: "team-test", createdAt: "2026-09-01" } as Application;
  render(<AttendanceTab sid="2026-2" teams={[]} trainingClasses={[]} sessions={[{ id: "meeting", date: "2026-09-12", type: "정규" }]} applications={[member]} teamById={new Map()} meta={null} />);
  fireEvent.click(screen.getByRole("button", { name: "다시 불러오기" }));
  expect(screen.getByRole("button", { name: "합성 학생 출석" })).toBeDisabled();
  act(() => receive({}));
  expect(screen.getByRole("button", { name: "합성 학생 출석" })).toBeEnabled();
});

it("같은 주차로 왕복해도 예전 준비 상태를 재사용하지 않는다", () => {
  const receivers: Array<(value: SessionAttendance) => void> = [];
  mock.subscribe.mockImplementation((_sid, _scope, _session, receive) => {
    receivers.push(receive);
    if (receivers.length === 1) receive({});
    return () => {};
  });
  const member = { id: "app-test", studentId: "s", name: "합성 학생", bu: "1부", grade: 1, class: 1, status: "배치", teamId: "team-test", createdAt: "2026-09-01" } as Application;
  render(<AttendanceTab sid="2026-2" teams={[]} trainingClasses={[]} sessions={[{ id: "first", date: "2026-09-12", type: "정규" }, { id: "second", date: "2026-09-19", type: "정규" }]} applications={[member]} teamById={new Map()} meta={null} />);
  const selected = (screen.getByRole("combobox", { name: "주차 선택" }) as HTMLSelectElement).value;
  expect(screen.getByRole("button", { name: "합성 학생 출석" })).toBeEnabled();
  fireEvent.change(screen.getByRole("combobox", { name: "주차 선택" }), { target: { value: selected === "first" ? "second" : "first" } });
  fireEvent.change(screen.getByRole("combobox", { name: "주차 선택" }), { target: { value: selected } });
  expect(screen.getByRole("button", { name: "합성 학생 출석" })).toBeDisabled();
  act(() => receivers[0]({ "app-test": { s: "출석" } }));
  expect(screen.getByRole("button", { name: "합성 학생 출석" })).toBeDisabled();
  act(() => receivers[2]({}));
  expect(screen.getByRole("button", { name: "합성 학생 출석" })).toBeEnabled();
});
