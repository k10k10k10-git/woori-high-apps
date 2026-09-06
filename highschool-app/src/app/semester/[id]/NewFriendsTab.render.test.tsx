/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import NewFriendsTab from "./NewFriendsTab";
import { SemesterEditProvider } from "@/features/semester/EditContext";
import type { NewFriend } from "@/features/semester/types";

const mocks = vi.hoisted(() => ({ save: vi.fn(), subscribe: vi.fn(), toast: vi.fn() }));
vi.mock("@/context/AuthContext", () => ({ useAuth: () => ({ user: { uid: "fixture-admin" } }) }));
vi.mock("@/context/UIContext", () => ({ useUI: () => ({ toast: mocks.toast, uiConfirm: vi.fn() }) }));
vi.mock("@/features/semester/db", () => ({
  saveNewFriend: mocks.save,
  subscribeClassesByYear: mocks.subscribe,
  cancelNewFriendPlacement: vi.fn(), registerNewFriendInRoster: vi.fn(), removeNewFriend: vi.fn(), removeNewFriendFromRoster: vi.fn(),
}));

const first: NewFriend = { id: "same-id", name: "김하늘", school: "첫학교", part: "1부", grade: 1, decision: "미정", createdAt: "2026-08-01T00:00:00Z" };
const second: NewFriend = { ...first, name: "박바다", school: "둘학교", part: "2부", grade: 2 };
const props = {
  sid: "2026-sunday",
  friends: [first, second],
  privateMap: {},
  canSyncRoster: false,
  getStorageSid: (friend: NewFriend) => friend === first ? "2026-1" : "2026-2",
  getRecordKey: (friend: NewFriend) => `${friend === first ? "2026-1" : "2026-2"}:${friend.id}`,
  getPrivateValue: (friend: NewFriend) => ({ phone: friend === first ? "010-0000-1234" : "010-0000-5678" }),
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.subscribe.mockImplementation(() => () => {});
  mocks.save.mockResolvedValue(undefined);
});
afterEach(cleanup);

function search(query: string) {
  fireEvent.change(screen.getByRole("searchbox", { name: "새친구 검색" }), { target: { value: query } });
}

function renderList(canEdit = true) {
  return render(<SemesterEditProvider canEdit={canEdit}><NewFriendsTab {...props} /></SemesterEditProvider>);
}

describe("새친구 목록 검색·수정", () => {
  it("PC 표와 모바일 목록에 같은 결과와 원래 번호를 표시하고 빈 결과를 초기화한다", () => {
    renderList();
    search("2부 둘학교");
    expect(screen.getByRole("status")).toHaveTextContent("검색 결과 1명 / 전체 2명");
    expect(within(screen.getByRole("table")).queryByText("김하늘")).not.toBeInTheDocument();
    expect(within(screen.getByLabelText("새친구 진행 현황 모바일 목록")).getByText(/No. 2/)).toBeInTheDocument();
    search("없는학생");
    expect(screen.getByText("검색 결과가 없습니다.")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "전체 목록 보기" }));
    expect(screen.getByRole("status")).toHaveTextContent("전체 2명");
    expect(screen.getByRole("searchbox")).toHaveFocus();
  });

  it("검색된 다른 학기의 같은 ID를 정확한 저장 대상과 연락처로 수정한다", async () => {
    renderList();
    search("5678");
    fireEvent.click(within(screen.getByRole("table")).getByRole("button", { name: "박바다" }));
    const dialog = screen.getByRole("dialog", { name: "박바다 새친구 수정" });
    expect(within(dialog).getByLabelText("본인 연락처")).toHaveValue("010-0000-5678");
    fireEvent.change(within(dialog).getByLabelText("바나바 담당자"), { target: { value: "새담당" } });
    fireEvent.click(within(dialog).getByRole("button", { name: /^저장$/ }));
    expect(mocks.save).toHaveBeenCalledWith("2026-2", expect.objectContaining({ id: "same-id", name: "박바다", owner: "새담당" }), expect.objectContaining({ phone: "010-0000-5678" }));
    expect(await screen.findByRole("status")).toHaveTextContent("검색 결과 1명");
    expect(screen.getByRole("searchbox")).toHaveValue("5678");
  });

  it("조회 전용 역할에서는 연락처로 검색할 수 없고 수정도 열 수 없다", () => {
    renderList(false);
    search("5678");
    expect(screen.getByText("검색 결과가 없습니다.")).toBeInTheDocument();
    search("박바다");
    const button = within(screen.getByRole("table")).getByRole("button", { name: "박바다" });
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it("실시간 수정으로 검색 조건에서 벗어난 학생을 결과에서 제거한다", () => {
    const view = renderList();
    search("둘학교");
    view.rerender(<SemesterEditProvider canEdit><NewFriendsTab {...props} friends={[first, { ...second, school: "새학교" }]} /></SemesterEditProvider>);
    expect(screen.getByText("검색 결과가 없습니다.")).toBeInTheDocument();
  });
});
