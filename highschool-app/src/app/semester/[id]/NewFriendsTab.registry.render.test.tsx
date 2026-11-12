/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NewFriend } from "@/features/semester/types";
import type { RegistryState } from "@/features/semester/registryBridge";

const mocks = vi.hoisted(() => ({
  toast: vi.fn(), confirm: vi.fn(), register: vi.fn(), submit: vi.fn(), cancel: vi.fn(), states: vi.fn(), ledger: vi.fn(),
}));
vi.mock("@/features/semester/classOptions", () => ({ fetchClassOptions: async () => [] }));
vi.mock("@/context/AuthContext", () => ({ useAuth: () => ({ user: { uid: "fixture-admin" } }) }));
vi.mock("@/context/UIContext", () => ({ useUI: () => ({ toast: mocks.toast, uiConfirm: mocks.confirm }) }));
vi.mock("@/features/semester/db", () => ({
  saveNewFriend: vi.fn(), cancelNewFriendPlacement: vi.fn(), registerNewFriendInRoster: mocks.register,
  removeNewFriend: vi.fn(), removeNewFriendFromRoster: vi.fn(),
}));
vi.mock("@/features/semester/registryBridge", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/semester/registryBridge")>()),
  fetchYearLedger: mocks.ledger,
  fetchRegistryStates: mocks.states,
  submitNewFriendToRegistry: mocks.submit,
  cancelNewFriendRegistry: mocks.cancel,
}));
import NewFriendsTab from "./NewFriendsTab";
import { SemesterEditProvider } from "@/features/semester/EditContext";

const ready: NewFriend = {
  id: "1730000000000_ready", name: "접수할친구", part: "1부", grade: 1, decision: "등록", gender: "남",
  week1Date: "2027-03-07", week2Date: "2027-03-14", registeredDate: "2027-03-07", assignedClassKey: "1-1-3",
  createdAt: "2027-03-07T00:00:00Z",
};
const registered: NewFriend = { ...ready, id: "1730000000000_done", name: "등록된친구" };
const waiting: NewFriend = { ...ready, id: "1730000000000_wait", name: "기다리는친구" };
const legacy: NewFriend = { ...ready, id: "1700000000000_old", name: "작년친구", registeredDate: "2026-09-06", createdAt: "2026-09-06T00:00:00Z" };

const states: Record<string, RegistryState> = {
  [registered.id]: { stage: "registered", classLabel: "1부 1-3", classKey: "1-1-3", firstAttended: "2027-03-21" },
  [waiting.id]: { stage: "submitted", submittedClassKey: "1-1-3" },
  [ready.id]: { stage: "none" },
};

function renderTab(canSubmitRegistry: boolean, friends = [ready, registered, waiting, legacy]) {
  return render(<SemesterEditProvider canEdit>
    <NewFriendsTab sid="2027-sunday" friends={friends} privateMap={{}} canSyncRoster canSubmitRegistry={canSubmitRegistry}
      getStorageSid={(friend) => friend === legacy ? "2026-2" : "2027-1"} />
  </SemesterEditProvider>);
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.ledger.mockImplementation(async (year: number) => year >= 2027 ? "wooriteens" : "legacy");
  mocks.states.mockResolvedValue(states);
  mocks.confirm.mockResolvedValue(true);
});
afterEach(cleanup);

const row = (name: string) => within(screen.getByRole("table")).getByText(name).closest("tr") as HTMLElement;

describe("우리틴즈 원장 해(2027~)의 새친구", () => {
  it("출석부 반영 대신 교적 단계를 보이고, 2026 새친구는 지금처럼 출석부 반영이다", async () => {
    renderTab(true);
    await waitFor(() => expect(within(row("등록된친구")).getByText("교적 등록")).toBeInTheDocument());
    expect(within(row("등록된친구")).getByText("1부 1-3 · 첫 출석 2027-03-21")).toBeInTheDocument();
    expect(within(row("등록된친구")).getByText("완료")).toBeInTheDocument();
    expect(within(row("기다리는친구")).getByText("교적 접수됨")).toBeInTheDocument();
    expect(within(row("기다리는친구")).getByRole("button", { name: "접수 취소" })).toBeInTheDocument();
    expect(within(row("접수할친구")).getByRole("button", { name: "교적에 접수" })).toBeInTheDocument();
    expect(within(row("작년친구")).getByRole("button", { name: "출석부 반영" })).toBeInTheDocument();
    expect(within(row("접수할친구")).queryByRole("button", { name: "출석부 반영" })).not.toBeInTheDocument();
    expect(mocks.states).toHaveBeenCalledWith([registered.id, ready.id, waiting.id].sort());
  });

  it("교적에 접수: 확인 뒤 서버에 보내고 단계를 바꾼다. 옛 명단에는 쓰지 않는다", async () => {
    mocks.submit.mockResolvedValue({ stage: "submitted", existing: false });
    mocks.states.mockResolvedValueOnce(states).mockResolvedValue({ ...states, [ready.id]: { stage: "submitted" } });
    renderTab(true);
    fireEvent.click(await within(row("접수할친구")).findByRole("button", { name: "교적에 접수" }));
    await waitFor(() => expect(mocks.submit).toHaveBeenCalledTimes(1));
    expect(mocks.confirm.mock.calls[0][0]).toMatch(/출생연도 2011\(학년으로 짐작한 값\)/);
    expect(mocks.submit).toHaveBeenCalledWith(expect.objectContaining({ nfId: ready.id, year: 2027, classKey: "1-1-3", name: "접수할친구", birthYearEstimated: true }));
    expect(mocks.register).not.toHaveBeenCalled();
    expect(await within(row("접수할친구")).findByText("교적 접수됨")).toBeInTheDocument();
    expect(mocks.toast).toHaveBeenCalledWith("교적 새친구 접수 대기에 보냈습니다.", "success");
  });

  it("접수 취소와 권한 없는 역할", async () => {
    mocks.cancel.mockResolvedValue({ stage: "cancelled" });
    const view = renderTab(true);
    fireEvent.click(await within(row("기다리는친구")).findByRole("button", { name: "접수 취소" }));
    await waitFor(() => expect(mocks.cancel).toHaveBeenCalledWith(waiting.id));
    view.unmount();
    renderTab(false);
    expect(await within(row("접수할친구")).findByText("관리자 확인 대기")).toBeInTheDocument();
    expect(within(row("기다리는친구")).queryByRole("button", { name: "접수 취소" })).not.toBeInTheDocument();
  });

  it("2027 원장을 확인하지 못하면 단추를 숨기고 알린다(옛 명단에 잘못 쓰지 않게)", async () => {
    mocks.ledger.mockImplementation(async (year: number) => { if (year >= 2027) throw new Error("연결 실패"); return "legacy"; });
    renderTab(true);
    expect(await screen.findByRole("alert")).toHaveTextContent("우리틴즈 교적 연동 확인 오류");
    expect(within(row("접수할친구")).getByText("원장 확인 중…")).toBeInTheDocument();
    expect(within(row("작년친구")).getByRole("button", { name: "출석부 반영" })).toBeInTheDocument();
    mocks.ledger.mockImplementation(async (year: number) => year >= 2027 ? "wooriteens" : "legacy");
    fireEvent.click(within(screen.getByRole("alert")).getByRole("button", { name: "다시 확인" }));
    expect(await within(row("접수할친구")).findByRole("button", { name: "교적에 접수" })).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
  });
});
