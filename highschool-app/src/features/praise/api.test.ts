/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ auth: { currentUser: null as null | { uid: string; getIdToken: () => Promise<string> } } }));
vi.mock("@/lib/firebase", () => ({ auth: state.auth }));
import { executePraiseCommand, listPraiseWorkspaces, loadPraiseWorkspace, subscribePraiseWorkspace } from "./api";
beforeEach(() => { state.auth.currentUser = { uid: "synthetic-user", getIdToken: vi.fn().mockResolvedValue("synthetic-token") }; });
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
describe("찬양 API 인증과 조회 수명", () => {
  it("조회는 bearer/no-store GET만 보내고 mutation은 명령과 operationId를 보낸다", async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ workspaces: [], canCreate: true }) }); vi.stubGlobal("fetch", fetcher);
    await listPraiseWorkspaces();
    expect(fetcher).toHaveBeenCalledWith("/api/praise", expect.objectContaining({ cache: "no-store", headers: expect.objectContaining({ Authorization: "Bearer synthetic-token" }) }));
    const command = { type: "attendance.set" as const, meetingId: "meeting-1", personId: "student-1", status: "PRESENT" as const, expectedRevision: 0 };
    await executePraiseCommand("workspace-a", command, "operation-a");
    expect(fetcher).toHaveBeenLastCalledWith("/api/praise/workspace-a", expect.objectContaining({ method: "POST", body: JSON.stringify({ operationId: "operation-a", command }) }));
  });
  it("로그인 없음과 토큰 조회 중 계정 변경은 HTTP 요청을 보내지 않는다", async () => {
    const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher); state.auth.currentUser = null;
    await expect(listPraiseWorkspaces()).rejects.toThrow("로그인");
    state.auth.currentUser = { uid: "first", getIdToken: async () => { state.auth.currentUser = { uid: "second", getIdToken: async () => "other" }; return "first-token"; } };
    await expect(loadPraiseWorkspace("workspace-a")).rejects.toThrow("계정이 바뀌었습니다"); expect(fetcher).not.toHaveBeenCalled();
  });
  it("충돌 응답의 구체적인 복구 안내를 전달한다", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 409, json: async () => ({ error: "다른 사람이 먼저 수정했습니다.", code: "revision_conflict" }) }));
    await expect(loadPraiseWorkspace("workspace-a")).rejects.toMatchObject({ status: 409, message: "다른 사람이 먼저 수정했습니다.", code: "revision_conflict" });
  });
  it("구독 해제는 진행 중 조회를 취소하고 포커스·타이머 후속 조회를 막는다", async () => {
    vi.useFakeTimers(); let signal: AbortSignal | undefined;
    const fetcher = vi.fn((_path: string, options: RequestInit) => { signal = options.signal ?? undefined; return new Promise(() => {}); }); vi.stubGlobal("fetch", fetcher);
    const callback = vi.fn(); const subscription = subscribePraiseWorkspace("workspace-a", callback, vi.fn());
    await Promise.resolve(); await Promise.resolve(); expect(fetcher).toHaveBeenCalledTimes(1);
    subscription.dispose(); expect(signal?.aborted).toBe(true); window.dispatchEvent(new Event("focus")); await vi.advanceTimersByTimeAsync(30_000);
    expect(fetcher).toHaveBeenCalledTimes(1); expect(callback).not.toHaveBeenCalled();
  });
});
