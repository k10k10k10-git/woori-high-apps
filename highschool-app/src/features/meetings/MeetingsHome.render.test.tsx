/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { MinistryRoles } from "@/features/portal/accessPolicy";

const mocks = vi.hoisted(() => ({
  auth: { user: { uid: "synthetic-admin", email: "synthetic@example.invalid" }, roles: { semester: "staff", retreat: "adminTeam" } as MinistryRoles, loading: false, roleError: false },
  retreats: vi.fn(), programs: vi.fn(), meetings: vi.fn(), unsubscribe: vi.fn(),
  gate: { lock: null as unknown, unlocked: true, lockError: null as string | null, markUnlocked: vi.fn(), retryLock: vi.fn() },
  query: "", listeners: new Set<() => void>(), replace: vi.fn(),
}));
vi.mock("next/navigation", async () => {
  const { useSyncExternalStore } = await import("react");
  return {
    usePathname: () => "/meetings",
    useRouter: () => ({ replace: mocks.replace }),
    useSearchParams: () => new URLSearchParams(useSyncExternalStore((callback) => { mocks.listeners.add(callback); return () => { mocks.listeners.delete(callback); }; }, () => mocks.query)),
  };
});
vi.mock("@/context/AuthContext", () => ({ useAuth: () => mocks.auth }));
vi.mock("@/lib/db", () => ({ subscribeToRetreats: mocks.retreats, subscribeToRetreatPrograms: mocks.programs, subscribeToRetreatProgramMeetings: mocks.meetings }));
vi.mock("@/features/portal/useRetreatPinGate", () => ({ useRetreatPinGate: () => mocks.gate }));
vi.mock("@/app/retreat/[id]/field/RetreatPinGate", () => ({ default: () => <p>합성 PIN 확인 화면</p> }));

import MeetingsHome from "./MeetingsHome";

const retreats = [{ id: "summer", name: "합성 여름수련회", year: 2026 }, { id: "winter", name: "합성 겨울수련회", year: 2026 }];
const program = { id: "program-1", title: "합성 함께하는 프로그램", order: 1, kind: "main", status: "draft", createdAt: 1, updatedAt: 1 };
const meeting = { title: "합성 준비회의", date: "2026-10-20", agenda: "합성 장소 확인", createdAt: 1, updatedAt: 1, decisions: {
  first: { title: "장소 확정", status: "decided", createdAt: 1, updatedAt: 1, taskId: "task-1" },
  second: { title: "물품 확인", status: "discussing", createdAt: 2, updatedAt: 2 },
  third: { title: "다음 일정", status: "deferred", createdAt: 3, updatedAt: 3 },
} };

function selectRetreat(id = "summer") {
  const subscription = mocks.retreats.mock.calls.at(-1);
  if (!subscription) throw new Error("수련회 목록 구독이 시작되지 않았습니다.");
  act(() => subscription[0](retreats));
  fireEvent.change(screen.getByRole("combobox", { name: "회의록을 볼 수련회" }), { target: { value: id } });
}
function receiveMeetings(call = 0) {
  act(() => {
    mocks.programs.mock.calls[call][1]([program]);
    mocks.meetings.mock.calls[call][1]({ "program-1": { "meeting-1": meeting } });
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.user = { uid: "synthetic-admin", email: "synthetic@example.invalid" };
  mocks.auth.roles = { semester: "staff", retreat: "adminTeam" };
  mocks.gate.lock = null;
  mocks.gate.unlocked = true;
  mocks.gate.lockError = null;
  mocks.query = "";
  mocks.replace.mockImplementation((url: string) => { mocks.query = url.split("?")[1] ?? ""; mocks.listeners.forEach((listener) => listener()); });
  [mocks.retreats, mocks.programs, mocks.meetings].forEach((subscribe) => subscribe.mockReturnValue(mocks.unsubscribe));
});
afterEach(cleanup);

it("수련회 행정 조회자에게 private 회의와 목록 구독을 열지 않는다", () => {
  mocks.auth.roles = { semester: "leader", retreat: "leader" };
  render(<MeetingsHome />);
  expect(screen.getByRole("heading", { name: "회의록 접근 권한이 필요합니다." })).toBeInTheDocument();
  expect(mocks.retreats).not.toHaveBeenCalled();
  expect(mocks.programs).not.toHaveBeenCalled();
  expect(mocks.meetings).not.toHaveBeenCalled();
});

it("수련회를 직접 선택하고 PIN을 통과한 뒤 해당 수련회만 구독한다", () => {
  mocks.gate.lock = { enabled: true };
  mocks.gate.unlocked = false;
  const view = render(<MeetingsHome />);
  act(() => mocks.retreats.mock.calls[0][0](retreats));
  expect(screen.getByRole("heading", { name: "수련회를 먼저 선택하세요" })).toBeInTheDocument();
  expect(mocks.meetings).not.toHaveBeenCalled();
  selectRetreat();
  expect(screen.getByText("합성 PIN 확인 화면")).toBeInTheDocument();
  expect(mocks.programs).not.toHaveBeenCalled();
  expect(mocks.meetings).not.toHaveBeenCalled();
  mocks.gate.unlocked = true;
  view.rerender(<MeetingsHome />);
  expect(mocks.programs).toHaveBeenCalledOnce();
  expect(mocks.programs.mock.calls[0][0]).toBe("summer");
  expect(mocks.meetings.mock.calls[0][0]).toBe("summer");
});

it("주소의 수련회를 복원하고 선택 변경 때 다른 검색 매개변수를 보존한다", () => {
  mocks.query = "retreat=summer&keep=1";
  render(<MeetingsHome />);
  act(() => mocks.retreats.mock.calls[0][0](retreats));
  expect(screen.getByRole("combobox", { name: "회의록을 볼 수련회" })).toHaveValue("summer");
  expect(mocks.meetings.mock.calls[0][0]).toBe("summer");
  fireEvent.change(screen.getByRole("combobox", { name: "회의록을 볼 수련회" }), { target: { value: "winter" } });
  expect(mocks.replace).toHaveBeenLastCalledWith("/meetings?retreat=winter&keep=1", { scroll: false });
  act(() => { mocks.query = "retreat=summer&keep=1"; mocks.listeners.forEach((listener) => listener()); });
  expect(screen.getByRole("combobox", { name: "회의록을 볼 수련회" })).toHaveValue("summer");
  expect(mocks.meetings.mock.calls[2][0]).toBe("summer");
});

it("주소에 없는 수련회가 지정되면 다른 기록을 자동으로 열지 않는다", () => {
  mocks.query = "retreat=unknown";
  render(<MeetingsHome />);
  act(() => mocks.retreats.mock.calls[0][0](retreats));
  expect(screen.getByRole("heading", { name: "수련회를 먼저 선택하세요" })).toBeInTheDocument();
  expect(mocks.meetings).not.toHaveBeenCalled();
});

it("기존 push 키와 결정·할일 연결을 보존해 검색하고 해당 회의로 이동한다", () => {
  render(<MeetingsHome />);
  selectRetreat();
  receiveMeetings();
  expect(screen.getByText("미결정 2건")).toBeInTheDocument();
  expect(screen.getByText("할 일 연결 1건")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "회의록 열기" })).toHaveAttribute("href", "/events/summer/programs?workspace=programs&program=program-1&section=overview&meeting=1&meetingId=meeting-1");
  fireEvent.change(screen.getByRole("searchbox", { name: "회의록 검색" }), { target: { value: "물품" } });
  expect(screen.getByRole("heading", { name: "합성 준비회의" })).toBeInTheDocument();
  fireEvent.change(screen.getByRole("combobox", { name: "회의 상태" }), { target: { value: "closed" } });
  expect(screen.getByRole("heading", { name: "검색 결과가 없습니다" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "검색 초기화" }));
  expect(screen.getByRole("heading", { name: "합성 준비회의" })).toBeInTheDocument();
});

it("수련회·계정 전환 후 늦게 도착한 이전 회의 기록을 표시하지 않는다", () => {
  const view = render(<MeetingsHome />);
  selectRetreat();
  receiveMeetings();
  fireEvent.change(screen.getByRole("combobox", { name: "회의록을 볼 수련회" }), { target: { value: "winter" } });
  expect(mocks.unsubscribe).toHaveBeenCalledTimes(2);
  receiveMeetings(0);
  expect(screen.queryByRole("heading", { name: "합성 준비회의" })).not.toBeInTheDocument();
  expect(screen.getByRole("status")).toHaveTextContent("선택한 수련회의 회의록을 불러오고 있습니다");
  mocks.auth.user = { uid: "another-admin", email: "another@example.invalid" };
  view.rerender(<MeetingsHome />);
  receiveMeetings(1);
  expect(screen.queryByRole("heading", { name: "합성 준비회의" })).not.toBeInTheDocument();
  expect(mocks.unsubscribe).toHaveBeenCalledTimes(5);
});

it("일부 구독 실패를 빈 회의록으로 숨기지 않고 같은 수련회에서 재시도한다", () => {
  render(<MeetingsHome />);
  selectRetreat();
  act(() => mocks.meetings.mock.calls[0][2](new Error("private/path/secret")));
  expect(screen.getByRole("alert")).toHaveTextContent("회의 기록");
  expect(screen.queryByText(/private\/path/)).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "다시 불러오기" }));
  expect(mocks.meetings.mock.calls[1][0]).toBe("summer");
  receiveMeetings(1);
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "합성 준비회의" })).toBeInTheDocument();
});

it("프로그램이 사라져도 남아 있는 회의 기록을 숨기거나 엉뚱한 편집 링크로 연결하지 않는다", () => {
  render(<MeetingsHome />);
  selectRetreat();
  act(() => {
    mocks.programs.mock.calls[0][1]([]);
    mocks.meetings.mock.calls[0][1]({ "removed-program": { "meeting-1": meeting } });
  });
  expect(screen.getByRole("heading", { name: "합성 준비회의" })).toBeInTheDocument();
  expect(screen.getByText("연결 프로그램 없음")).toBeInTheDocument();
  expect(screen.queryByRole("link", { name: "회의록 열기" })).not.toBeInTheDocument();
});
