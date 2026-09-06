/** @vitest-environment jsdom */
import { StrictMode } from "react";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ActivityLogPage, ActivityLogRecord } from "@/features/activityLog/types";
import type { MinistryRoles } from "./accessPolicy";

const mocks = vi.hoisted(() => ({
  auth: { user: { uid: "test-admin" } as { uid: string } | null, roles: { semester: "superAdmin", retreat: "none" } as MinistryRoles },
  load: vi.fn(), subscribe: vi.fn(), unsubscribe: vi.fn(),
  pending: [] as { resolve: (page: ActivityLogPage) => void; reject: (error: Error) => void }[],
}));
vi.mock("@/context/AuthContext", () => ({ useAuth: () => mocks.auth }));
vi.mock("@/features/activityLog/db", () => ({ loadActivityLogPage: mocks.load, subscribeActivityLogStatus: mocks.subscribe }));
import ActivityLogPanel from "./ActivityLogPanel";

const NOW = Date.parse("2026-09-05T16:00:00Z");
function record(id: string, patch: Partial<ActivityLogRecord> = {}): ActivityLogRecord {
  return {
    id, schemaVersion: 1, occurredAt: NOW - 60_000, recordedAt: NOW,
    actor: { kind: "user", uid: `uid-${id}`, name: "가상담당" },
    area: "newFriends", action: "update", target: { path: `semesters/2026-sunday/newFriends/${id}`, label: `새친구 ${id}`, context: "주일 사역" },
    changes: [{ field: "등록 결정", before: "미정", after: "등록" }], changedCount: 1,
    ...patch,
  };
}
async function respond(records: ActivityLogRecord[], nextCursor: ActivityLogPage["nextCursor"] = null, index = 0) {
  await act(async () => { mocks.pending[index].resolve({ records, nextCursor }); });
}
function status(index = 0) {
  act(() => mocks.subscribe.mock.calls[index][0]({ startedAt: NOW - 4 * 86_400_000, lastRecordedAt: NOW }));
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.pending.length = 0;
  mocks.auth.user = { uid: "test-admin" };
  mocks.auth.roles = { semester: "superAdmin", retreat: "none" };
  vi.spyOn(Date, "now").mockReturnValue(NOW);
  mocks.load.mockImplementation(() => new Promise<ActivityLogPage>((resolve, reject) => { mocks.pending.push({ resolve, reject }); }));
  mocks.subscribe.mockReturnValue(mocks.unsubscribe);
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("활동 로그 조회", () => {
  it("한국 시간의 최근 7일을 조회하고 첫 응답 전에는 0건·빈 목록으로 표시하지 않는다", async () => {
    render(<ActivityLogPanel />);
    expect(mocks.load).toHaveBeenCalledWith({ from: "2026-08-31", to: "2026-09-06" });
    expect(screen.getByLabelText("시작일")).toHaveValue("2026-08-31");
    expect(screen.getByText("활동 로그를 불러오는 중…")).toBeInTheDocument();
    expect(screen.queryByText(/조회된 0건/)).not.toBeInTheDocument();
    expect(screen.queryByText("조회 기간에 기록된 활동이 없습니다.")).not.toBeInTheDocument();
    await respond([]);
    expect(screen.getByText("조회 기간에 기록된 활동이 없습니다.")).toBeInTheDocument();
    expect(screen.getByText("조회된 0건에서 검색 · 0건 표시")).toBeInTheDocument();
  });

  it("이름·UID 검색과 영역·동작 필터는 조회된 기록만 좁히고 서버를 재조회하지 않는다", async () => {
    render(<ActivityLogPanel />);
    const first = record("new", { actor: { kind: "user", uid: "unique-actor-uid", name: "가상봄담당" } });
    const second = record("attendance", { area: "attendance", action: "create", actor: { kind: "user", uid: "other-user", name: "가상가을담당" } });
    await respond([first, second]);
    fireEvent.change(screen.getByRole("searchbox", { name: "활동 로그 검색" }), { target: { value: "  unique-actor-uid " } });
    expect(screen.getByText("조회된 2건에서 검색 · 1건 표시")).toBeInTheDocument();
    expect(screen.getByText("새친구 new")).toBeInTheDocument();
    expect(screen.queryByText("새친구 attendance")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "활동 로그 검색 초기화" }));
    fireEvent.change(screen.getByLabelText("활동 영역"), { target: { value: "attendance" } });
    fireEvent.change(screen.getByLabelText("활동 동작"), { target: { value: "create" } });
    expect(screen.getByText("새친구 attendance")).toBeInTheDocument();
    expect(screen.queryByText("새친구 new")).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "없는이름" } });
    expect(screen.getByText("검색 조건에 맞는 활동이 없습니다.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "전체 조회 목록 보기" }));
    expect(screen.getByText("조회된 2건에서 검색 · 2건 표시")).toBeInTheDocument();
    expect(mocks.load).toHaveBeenCalledTimes(1);
  });

  it("기록 주체와 변경 전후를 보여 주고 민감정보 원문은 DOM에 넣지 않는다", async () => {
    render(<ActivityLogPanel />);
    status();
    await respond([record("details", {
      changes: [{ field: "등록 결정", before: "미정", after: "등록" }, { field: "연락처", before: "민감원문이전", after: "민감원문이후", redacted: true }], changedCount: 2,
    }), record("system", { actor: { kind: "system" } }), record("unknown", { actor: { kind: "unknown" } })]);
    expect(screen.getByText("시스템")).toBeInTheDocument();
    expect(screen.getByText("주체 미확인")).toBeInTheDocument();
    expect(screen.getByText(/저장 요청에 사용된 인증 계정입니다. 사람이 직접 조작했는지는 확인할 수 없습니다/)).toBeInTheDocument();
    expect(screen.getByText(/구버전 화면·직접 DB 수정은 포함되지 않을 수 있습니다/)).toBeInTheDocument();
    expect(screen.getByText(/첫 변경 기록 2026/)).toBeInTheDocument();
    const detail = screen.getByText("새친구 details").closest("details")!;
    fireEvent.click(detail.querySelector("summary")!);
    expect(within(detail).getByText("변경 전")).toBeInTheDocument();
    expect(within(detail).getByText("미정")).toBeInTheDocument();
    expect(within(detail).getByText("변경 후")).toBeInTheDocument();
    expect(within(detail).getByText("등록")).toBeInTheDocument();
    expect(screen.getByText("변경됨 · 원문 생략")).toBeInTheDocument();
    expect(screen.queryByText("민감원문이전")).not.toBeInTheDocument();
    expect(screen.queryByText("민감원문이후")).not.toBeInTheDocument();
  });

  it("이전 값 미기록과 실제 값 없음을 구분하고 새 출석 입력은 저장값으로 표시한다", async () => {
    render(<ActivityLogPanel />);
    await respond([record("attendance-save", {
      area: "attendance",
      changes: [{ field: "출석", after: "출석" }, { field: "비어 있던 항목", before: null, after: "등록" }],
      changedCount: 2,
    })]);
    const detail = screen.getByText("새친구 attendance-save").closest("details")!;
    expect(within(detail).getByText("저장")).toBeInTheDocument();
    expect(within(detail).queryByText("수정")).not.toBeInTheDocument();
    expect(within(detail).getByText("저장 상세")).toBeInTheDocument();
    fireEvent.click(detail.querySelector("summary")!);
    const changes = detail.querySelectorAll(".activity-log-change");
    expect(within(changes[0] as HTMLElement).getByText("기록하지 않음")).toBeInTheDocument();
    expect(within(changes[0] as HTMLElement).getByText("저장값")).toBeInTheDocument();
    expect(within(changes[0] as HTMLElement).queryByText("값 없음")).not.toBeInTheDocument();
    expect(within(changes[1] as HTMLElement).getByText("값 없음")).toBeInTheDocument();
    expect(within(changes[1] as HTMLElement).getByText("변경 후")).toBeInTheDocument();
  });

  it("더보기는 cursor를 넘기며 중복 ID를 다시 표시하지 않고 중복 클릭을 막는다", async () => {
    render(<ActivityLogPanel />);
    const cursor = { occurredAt: NOW - 60_000, id: "first" };
    await respond([record("first")], cursor);
    const more = screen.getByRole("button", { name: "이전 기록 더 불러오기" });
    fireEvent.click(more);
    fireEvent.click(more);
    expect(mocks.load).toHaveBeenCalledTimes(2);
    expect(mocks.load).toHaveBeenLastCalledWith({ from: "2026-08-31", to: "2026-09-06" }, cursor);
    await respond([record("first"), record("second")], null, 1);
    expect(screen.getByText("조회된 2건에서 검색 · 2건 표시")).toBeInTheDocument();
    expect(screen.getAllByText("새친구 first")).toHaveLength(1);
    expect(screen.queryByRole("button", { name: "이전 기록 더 불러오기" })).not.toBeInTheDocument();
  });

  it("기간 적용은 검색·cursor·이전 데이터를 비우고 늦은 이전 응답을 무시한다", async () => {
    render(<ActivityLogPanel />);
    await respond([record("old")], { occurredAt: NOW, id: "old" });
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "old" } });
    fireEvent.click(screen.getByRole("button", { name: "이전 기록 더 불러오기" }));
    fireEvent.change(screen.getByLabelText("시작일"), { target: { value: "2026-09-01" } });
    fireEvent.click(screen.getByRole("button", { name: "기간 조회" }));
    expect(screen.getByRole("searchbox")).toHaveValue("");
    expect(screen.queryByText("새친구 old")).not.toBeInTheDocument();
    expect(mocks.unsubscribe).toHaveBeenCalledTimes(1);
    expect(mocks.load).toHaveBeenLastCalledWith({ from: "2026-09-01", to: "2026-09-06" });
    await respond([record("late-old")], null, 1);
    expect(screen.queryByText("새친구 late-old")).not.toBeInTheDocument();
    act(() => mocks.subscribe.mock.calls[0][1](new Error("이전 구독 오류")));
    await respond([record("current")], null, 2);
    expect(screen.getByText("새친구 current")).toBeInTheDocument();
    expect(screen.queryByText("이전 구독 오류")).not.toBeInTheDocument();
  });

  it("31일을 넘는 기간은 오류로 알리고 조회를 실행하지 않는다", () => {
    render(<ActivityLogPanel />);
    fireEvent.change(screen.getByLabelText("시작일"), { target: { value: "2026-08-01" } });
    fireEvent.click(screen.getByRole("button", { name: "기간 조회" }));
    expect(screen.getByRole("alert")).toHaveTextContent(/31일/);
    expect(mocks.load).toHaveBeenCalledTimes(1);
  });

  it("더보기 실패는 이전 기록을 숨기고 재조회는 처음부터 시작한다", async () => {
    render(<ActivityLogPanel />);
    await respond([record("old")], { occurredAt: NOW, id: "old" });
    fireEvent.click(screen.getByRole("button", { name: "이전 기록 더 불러오기" }));
    await act(async () => mocks.pending[1].reject(new Error("조회 권한이 없습니다.")));
    expect(screen.getByRole("alert")).toHaveTextContent("조회 권한이 없습니다.");
    expect(screen.queryByText("새친구 old")).not.toBeInTheDocument();
    expect(screen.queryByRole("searchbox")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "다시 불러오기" }));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(mocks.load).toHaveBeenLastCalledWith({ from: "2026-08-31", to: "2026-09-06" });
    await respond([record("retry")], null, 2);
    expect(screen.getByText("새친구 retry")).toBeInTheDocument();
  });

  it("상태 구독에서 권한 오류가 오면 기록을 비우고 진행 중 응답도 표시하지 않는다", async () => {
    render(<ActivityLogPanel />);
    await respond([record("old")], { occurredAt: NOW, id: "old" });
    fireEvent.click(screen.getByRole("button", { name: "이전 기록 더 불러오기" }));
    act(() => mocks.subscribe.mock.calls[0][1](new Error("permission_denied")));
    expect(screen.getByRole("alert")).toHaveTextContent("permission_denied");
    await respond([record("late")], null, 1);
    expect(screen.queryByText("새친구 old")).not.toBeInTheDocument();
    expect(screen.queryByText("새친구 late")).not.toBeInTheDocument();
  });

  it("StrictMode에서 폐기한 구독의 늦은 응답·오류가 새 조회를 덮지 않는다", async () => {
    render(<StrictMode><ActivityLogPanel /></StrictMode>);
    expect(mocks.load).toHaveBeenCalledTimes(2);
    act(() => mocks.subscribe.mock.calls[0][1](new Error("폐기한 구독 오류")));
    await respond([record("stale")], null, 0);
    status(1);
    await respond([record("active")], null, 1);
    expect(screen.getByText("새친구 active")).toBeInTheDocument();
    expect(screen.queryByText("새친구 stale")).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("권한이 없는 계정은 조회하지 않고 계정 변경·권한 회수 시 이전 내용을 폐기한다", async () => {
    mocks.auth.roles = { semester: "pastor", retreat: "pastor" };
    const { rerender } = render(<ActivityLogPanel />);
    expect(screen.getByRole("alert")).toHaveTextContent("활동 로그 조회 권한이 없습니다.");
    expect(mocks.load).not.toHaveBeenCalled();
    expect(mocks.subscribe).not.toHaveBeenCalled();
    mocks.auth.roles = { semester: "superAdmin", retreat: "none" };
    rerender(<ActivityLogPanel />);
    await respond([record("account-one")]);
    mocks.auth.user = { uid: "other-admin" };
    rerender(<ActivityLogPanel />);
    expect(screen.queryByText("새친구 account-one")).not.toBeInTheDocument();
    await respond([record("account-two")], null, 1);
    mocks.auth.roles = { semester: "staff", retreat: "none" };
    rerender(<ActivityLogPanel />);
    expect(screen.queryByText("새친구 account-two")).not.toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("활동 로그 조회 권한이 없습니다.");
    expect(mocks.unsubscribe).toHaveBeenCalledTimes(2);
  });
});
