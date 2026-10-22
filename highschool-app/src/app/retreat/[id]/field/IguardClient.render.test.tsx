/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Group } from "@/features/iguard/lib/types";

const mocks = vi.hoisted(() => ({
  id: "a",
  roles: { semester: "superAdmin", retreat: "superAdmin" },
  roleError: false,
  mountedView: vi.fn(),
  router: { push: vi.fn() },
  query: new URLSearchParams(),
  mergeSnapshot: vi.fn(),
  db: Object.fromEntries([
    "subscribeToCellColors", "subscribeToConnection", "subscribeToGroups", "subscribeToIguardAttendance",
    "subscribeToIguardBuses", "subscribeToIguardGbs", "subscribeToIguardGroupStaff", "subscribeToIguardGuide",
    "subscribeToIguardLodgingMaps", "subscribeToIguardMeals", "subscribeToIguardMovements", "subscribeToIguardPosts",
    "subscribeToIguardSchedule", "subscribeToIguardSeating", "subscribeToIguardSegments", "subscribeToMilestones",
    "subscribeToPartialAttendances", "subscribeToParticipants", "subscribeToRetreat", "subscribeToRetreatPeriods",
    "subscribeToRetreatPrograms", "subscribeToRooms", "subscribeToRetreatStudents", "subscribeToTeacherAttendances",
  ].map((name) => [name, vi.fn()])),
}));

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: mocks.id }), useRouter: () => mocks.router, useSearchParams: () => mocks.query,
}));
vi.mock("next/dynamic", () => ({ default: () => () => { mocks.mountedView(); return null; } }));
vi.mock("@/context/AuthContext", () => ({
  useAuth: () => ({ user: { uid: "fixture-admin" }, loading: false, roles: mocks.roles, roleError: mocks.roleError, memberName: "테스트" }),
}));
vi.mock("@/context/ViewModeContext", () => ({ useViewMode: () => ({ isMobileView: false }) }));
vi.mock("@/features/portal/useRetreatPinGate", () => ({
  useRetreatPinGate: () => ({ lock: null, unlocked: true, lockError: null, markUnlocked: vi.fn() }),
}));
vi.mock("@/features/iguard/lib/db", () => mocks.db);
vi.mock("@/lib/retreatWorkspaceCache", () => ({ mergeRetreatWorkspaceSnapshot: mocks.mergeSnapshot }));
vi.mock("@/features/portal/RetreatAreaNav", () => ({ default: () => null }));
vi.mock("./RetreatPinGate", () => ({ default: () => null }));
vi.mock("./SearchOverlay", () => ({ default: () => null }));
vi.mock("./ExecutionViews", () => ({
  CueCardView: ({ groups }: { groups: Group[] }) => <output data-testid="cue-groups">{groups.map((group) => group.name).join(", ")}</output>,
  PostBoardView: () => null,
}));

import IguardClient from "./IguardClient";

type Listener = {
  name: string;
  target: string | number | null;
  value: (...args: unknown[]) => void;
  error: (error: Error) => void;
  unsubscribe: ReturnType<typeof vi.fn>;
};
let listeners: Listener[];
const dataListeners = () => listeners.filter(({ name }) => name !== "subscribeToRetreat" && name !== "subscribeToConnection");
const latestMeta = (id: string) => listeners.findLast((listener) => listener.name === "subscribeToRetreat" && listener.target === id)!;
const group = (name: string): Group => ({ id: name, name, bu: "1부", teachers: [], leader: "", studentIds: [] });

function loadMeta(id: string, year: number) {
  act(() => latestMeta(id).value({ id, name: `${id} 행사`, year }));
}

function loadData(id: string) {
  act(() => {
    for (const listener of dataListeners().filter((listener) => listener.unsubscribe.mock.calls.length === 0)) {
      if (listener.name === "subscribeToIguardAttendance") listener.value(new Set(), {});
      else if (listener.name === "subscribeToGroups") listener.value([group(`${id} 조`)]);
      else if (["subscribeToRetreatStudents", "subscribeToParticipants", "subscribeToPartialAttendances", "subscribeToCellColors", "subscribeToIguardGroupStaff", "subscribeToIguardGbs"].includes(listener.name)) listener.value({});
      else listener.value([]);
    }
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.id = "a";
  mocks.roles = { semester: "superAdmin", retreat: "superAdmin" };
  mocks.roleError = false;
  mocks.query = new URLSearchParams();
  listeners = [];
  Reflect.deleteProperty(window, "__wooriIguardRetreatDataCache");
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
  for (const [name, subscribe] of Object.entries(mocks.db)) {
    subscribe.mockImplementation((...args: unknown[]) => {
      const global = name === "subscribeToConnection" || name === "subscribeToMilestones";
      const offset = global ? 0 : name === "subscribeToRetreatStudents" ? 2 : 1;
      const listener: Listener = {
        name, target: global ? null : args[0] as string | number,
        value: args[offset] as Listener["value"], error: args[offset + 1] as Listener["error"], unsubscribe: vi.fn(),
      };
      listeners.push(listener);
      return listener.unsubscribe;
    });
  }
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("IguardClient — 관리자 수련회 전환의 구독 생명주기", () => {
  it("다른 수련회는 해당 연도 확인 뒤에만 22개 구독을 연결하고 이전 화면을 숨긴다", () => {
    const view = render(<IguardClient />);
    expect(dataListeners()).toHaveLength(0);
    loadMeta("a", 2026);
    loadData("a");
    expect(screen.getByTestId("cue-groups")).toHaveTextContent("a 조");
    expect(dataListeners()).toHaveLength(22);

    mocks.id = "b";
    view.rerender(<IguardClient />);
    expect(screen.queryByText("a 행사")).not.toBeInTheDocument();
    expect(screen.queryByTestId("cue-groups")).not.toBeInTheDocument();
    expect(dataListeners()).toHaveLength(22);
    loadMeta("b", 2027);
    loadData("b");
    expect(screen.getByTestId("cue-groups")).toHaveTextContent("b 조");
    expect(dataListeners()).toHaveLength(44);
    expect(mocks.db.subscribeToRetreatStudents.mock.calls.map(([, year]) => year)).toEqual([2026, 2027]);
  });

  it("다음 수련회 메타 조회 실패 시 이전 명단을 정상 화면으로 남기지 않는다", () => {
    const view = render(<IguardClient />);
    loadMeta("a", 2026);
    loadData("a");
    mocks.id = "b";
    view.rerender(<IguardClient />);
    act(() => latestMeta("b").error(new Error("permission_denied")));
    expect(screen.queryByText("a 행사")).not.toBeInTheDocument();
    expect(screen.queryByTestId("cue-groups")).not.toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("수련회 정보를 불러오지 못했습니다");
    expect(screen.getByRole("alert")).not.toHaveTextContent("permission_denied");
    expect(screen.queryByText("수련회를 찾을 수 없습니다.")).not.toBeInTheDocument();
    expect(dataListeners()).toHaveLength(22);
  });

  it("조회가 성공했지만 수련회가 없으면 오류 대신 찾을 수 없음 안내를 표시한다", () => {
    render(<IguardClient />);
    act(() => latestMeta("a").value(null));
    expect(screen.getByText("수련회를 찾을 수 없습니다.")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(dataListeners()).toHaveLength(0);
  });

  it("해제한 이전 수련회의 지연 응답은 현재 화면과 공유 캐시를 바꾸지 않는다", () => {
    const view = render(<IguardClient />);
    loadMeta("a", 2026);
    loadData("a");
    const previousMeta = latestMeta("a");
    const previousGroups = listeners.find((listener) => listener.name === "subscribeToGroups")!;
    mocks.id = "b";
    view.rerender(<IguardClient />);
    loadMeta("b", 2027);
    loadData("b");
    mocks.mergeSnapshot.mockClear();
    act(() => {
      previousMeta.value({ id: "a", name: "이전 지연 행사", year: 2026 });
      previousGroups.value([group("이전 지연 조")]);
      previousMeta.error(new Error("늦은 실패"));
    });
    expect(screen.getByText("b 행사")).toBeInTheDocument();
    expect(screen.getByTestId("cue-groups")).toHaveTextContent("b 조");
    expect(mocks.mergeSnapshot).not.toHaveBeenCalled();
  });

  it("같은 수련회의 이름·탭 변경은 구독을 유지하고 언마운트는 전부 해제한다", () => {
    const view = render(<IguardClient />);
    loadMeta("a", 2026);
    loadData("a");
    act(() => latestMeta("a").value({ id: "a", name: "새 행사 이름", year: 2026 }));
    mocks.query = new URLSearchParams("view=board");
    view.rerender(<IguardClient />);
    expect(screen.getByText("새 행사 이름")).toBeInTheDocument();
    expect(dataListeners()).toHaveLength(22);
    view.unmount();
    for (const listener of listeners) expect(listener.unsubscribe).toHaveBeenCalledOnce();
  });
});


it("실행 스탭도 기획 메뉴를 보지만 제한된 뷰는 마운트하지 않는다", () => {
  mocks.roles = { semester: "none", retreat: "fieldStaff" };
  const view = render(<IguardClient />);
  loadMeta("a", 2026); loadData("a");
  expect(screen.getByRole("tab", { name: /기획.*권한 필요/ })).toBeInTheDocument();
  mocks.mountedView.mockClear();
  mocks.query = new URLSearchParams("view=schedule");
  view.rerender(<IguardClient />);
  expect(screen.getByRole("heading", { name: "기획 업무 접근 권한이 필요합니다." })).toBeInTheDocument();
  expect(screen.getByRole("tab", { name: "스탭 전체 큐싯 · 권한 필요" })).toBeInTheDocument();
  expect(mocks.mountedView).not.toHaveBeenCalled();
});

it("현장 권한 실패에서는 데이터 구독이나 리다이렉트를 시작하지 않는다", () => {
  mocks.roleError = true;
  render(<IguardClient />);
  expect(screen.getByRole("alert")).toHaveTextContent("권한을 확인하지 못했습니다");
  expect(listeners).toHaveLength(0);
  expect(mocks.router.push).not.toHaveBeenCalled();
});

it("수련회 조회 오류의 재시도는 실제 리스너를 다시 연결한다", () => {
  render(<IguardClient />);
  act(() => latestMeta("a").error(new Error("internal/path")));
  const old = latestMeta("a");
  fireEvent.click(screen.getByRole("button", { name: "다시 불러오기" }));
  expect(old.unsubscribe).toHaveBeenCalledOnce();
  act(() => old.value({ id: "a", name: "이전 콜백", year: 2026 }));
  expect(screen.queryByText("이전 콜백")).not.toBeInTheDocument();
  loadMeta("a", 2026); loadData("a");
  expect(screen.getByText("a 행사")).toBeInTheDocument();
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});


it("현장 화면에서 홈이 아닌 같은 수련회의 업무 선택으로 돌아간다", () => {
  render(<IguardClient />);
  loadMeta("a", 2026); loadData("a");
  fireEvent.click(screen.getByRole("button", { name: "수련회 업무 선택으로 돌아가기" }));
  expect(mocks.router.push).toHaveBeenCalledWith("/events?retreat=a");
});
