/** @vitest-environment jsdom */
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PraiseView } from "./types";
const mocks = vi.hoisted(() => ({ subscribe: vi.fn(), execute: vi.fn(), operationId: vi.fn(), pause: vi.fn(), resume: vi.fn(), dispose: vi.fn(), refresh: vi.fn() }));
vi.mock("./api", () => ({ subscribePraiseWorkspace: mocks.subscribe, executePraiseCommand: mocks.execute, praiseOperationId: mocks.operationId }));
import { usePraiseData } from "./usePraiseData";
import { praiseFixture } from "./components/praiseTestFixtures";
let emit: (view: PraiseView) => void;
let fail: (failure: Error) => void;
beforeEach(() => { vi.clearAllMocks(); let nextId = 0; mocks.operationId.mockImplementation(() => `operation-${++nextId}`); mocks.subscribe.mockImplementation((_id: string, onData: (view: PraiseView) => void, onError: (failure: Error) => void) => { emit = onData; fail = onError; return mocks; }); });
afterEach(cleanup);
describe("찬양 기록 구독과 저장", () => {
  it("응답 유실 뒤 같은 작업은 같은 번호를 재사용하고 성공·내용 변경 뒤에는 새 번호를 쓴다", async () => {
    const view = praiseFixture(); mocks.execute.mockRejectedValueOnce(new Error("응답을 받지 못했습니다.")).mockResolvedValue({ view, logPending: false });
    const { result } = renderHook(() => usePraiseData("workspace-a")); act(() => emit(view));
    const command = { type: "stage.generate" as const, meetingId: "meeting-1", inputRevision: "revision-1", config: { ...view.policy!.stage, leaderType: "STAFF" as const, leaderId: "staff-1", staffOnly: false }, overrides: [] };
    await act(async () => { expect(await result.current.execute(command)).toBe(false); });
    await act(async () => { expect(await result.current.execute(command)).toBe(true); });
    expect(mocks.execute.mock.calls[0][2]).toBe(mocks.execute.mock.calls[1][2]);
    await act(async () => { await result.current.execute(command); });
    expect(mocks.execute.mock.calls[2][2]).not.toBe(mocks.execute.mock.calls[1][2]);
    mocks.execute.mockRejectedValue(new Error("연결 실패"));
    await act(async () => { await result.current.execute(command); });
    await act(async () => { await result.current.execute({ ...command, config: { ...command.config, staffOnly: true } }); });
    expect(mocks.execute.mock.calls[4][2]).not.toBe(mocks.execute.mock.calls[3][2]);
  });
  it("저장 중 조회를 멈추고 성공 응답으로 갱신한 뒤 다시 읽을 수 있다", async () => {
    const view = praiseFixture(); mocks.execute.mockResolvedValue({ view: { ...view, meta: { ...view.meta, revision: 9 } }, logPending: true });
    const { result, unmount } = renderHook(() => usePraiseData("workspace-a"));
    act(() => emit(view));
    let saved = false;
    await act(async () => { saved = await result.current.execute({ type: "attendance.set", meetingId: "meeting-1", personId: "student-1", status: "PRESENT", expectedRevision: 0 }); });
    expect(saved).toBe(true); expect(mocks.pause).toHaveBeenCalledOnce(); expect(mocks.resume).toHaveBeenCalledOnce();
    expect(result.current.view?.meta.revision).toBe(9); expect(result.current.notice).toContain("활동 로그 반영은 지연");
    expect(mocks.pause.mock.invocationCallOrder[0]).toBeLessThan(mocks.execute.mock.invocationCallOrder[0]);
    unmount(); expect(mocks.dispose).toHaveBeenCalledOnce();
  });
  it("실패는 기존 화면과 초안을 보존할 수 있게 오류만 전달한다", async () => {
    const view = praiseFixture(); mocks.execute.mockRejectedValue(new Error("다른 사람이 먼저 수정했습니다."));
    const { result } = renderHook(() => usePraiseData("workspace-a")); act(() => emit(view));
    await act(async () => { expect(await result.current.execute({ type: "attendance.set", meetingId: "meeting-1", personId: "student-1", status: "ABSENT", expectedRevision: 0 })).toBe(false); });
    expect(result.current.view).toBe(view); expect(result.current.error).toContain("다른 사람이 먼저"); expect(result.current.busy).toBe(false);
  });
  it("이전 학기 저장 응답이 현재 선택한 학기를 덮어쓰지 않는다", async () => {
    let resolve!: (value: { view: PraiseView; logPending: boolean }) => void; mocks.execute.mockImplementation(() => new Promise((done) => { resolve = done; }));
    const { result, rerender } = renderHook(({ id }) => usePraiseData(id), { initialProps: { id: "workspace-a" } }); act(() => emit(praiseFixture()));
    let saving!: Promise<boolean>;
    act(() => { saving = result.current.execute({ type: "attendance.set", meetingId: "meeting-1", personId: "student-1", status: null, expectedRevision: 0 }); });
    rerender({ id: "workspace-b" });
    const next = praiseFixture(); next.meta.id = "workspace-b"; act(() => emit(next));
    await act(async () => { resolve({ view: praiseFixture(), logPending: false }); await saving; });
    await waitFor(() => expect(result.current.view?.meta.id).toBe("workspace-b"));
  });
});

it("권한 회수 응답은 이전 화면을 비우고 이후 정상 조회로 복구한다", () => {
  const view = praiseFixture(); const { result } = renderHook(() => usePraiseData("workspace-a"));
  act(() => emit(view));
  act(() => fail(Object.assign(new Error("접근 권한 없음"), { status: 403 })));
  expect(result.current.view).toBeNull();
  act(() => emit(view));
  expect(result.current.view).toBe(view); expect(result.current.error).toBe("");
});
it("서버 연결 준비 오류 코드를 표시 계층에 전달한다", () => {
  const { result } = renderHook(() => usePraiseData("workspace-a"));
  act(() => fail(Object.assign(new Error("연결 준비"), { code: "server_not_configured" })));
  expect(result.current.errorCode).toBe("server_not_configured");
});
