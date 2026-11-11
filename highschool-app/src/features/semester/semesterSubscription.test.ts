// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DataSnapshot } from "@/lib/rtdb";

const mocks = vi.hoisted(() => ({
  onValue: vi.fn(), get: vi.fn(), fetch: vi.fn(),
  user: { uid: "approved", getIdToken: vi.fn(async () => "test-id-token") } as { uid: string; getIdToken: () => Promise<string> } | null,
}));
vi.mock("@/lib/rtdb", () => ({ ref: (_db: unknown, path: string) => path, onValue: mocks.onValue, get: mocks.get }));
vi.mock("@/lib/firebase", () => ({ db: {}, auth: { get currentUser() { return mocks.user; } } }));
import { getSemesters, refreshSemesterList, subscribeSemesters } from "./semesterList";

const meta = { title: "2학기", createdAt: "2026-08-01", completionRule: { minRate: 0.7 } };
const dated = { ...meta, startDate: "2026-08-29", endDate: "2026-11-07" };
const paths = new Map<string, { deliver: (snap: DataSnapshot) => void; fail: (error: Error) => void; off: ReturnType<typeof vi.fn> }>();
const stops: (() => void)[] = [];
const snapshot = (value: unknown) => ({ val: () => value }) as DataSnapshot;
const deliver = (path: string, value: unknown) => paths.get(path)!.deliver(snapshot(value));
const flush = async () => { for (let i = 0; i < 15; i++) await Promise.resolve(); };
function subscribe(cb = vi.fn(), error = vi.fn()) { const off = subscribeSemesters(cb, error); stops.push(off); return { cb, error, off }; }

beforeEach(() => {
  vi.useFakeTimers(); vi.clearAllMocks(); paths.clear();
  mocks.user = { uid: "approved", getIdToken: vi.fn(async () => "test-id-token") };
  vi.stubGlobal("fetch", mocks.fetch);
  mocks.fetch.mockResolvedValue({ ok: true, json: async () => ({ ids: ["2026-2"] }) });
  mocks.onValue.mockImplementation((path: string, callback: (snap: DataSnapshot) => void, fail: (error: Error) => void) => {
    const off = vi.fn(); paths.set(path, { deliver: callback, fail, off }); return off;
  });
});
afterEach(() => { stops.splice(0).forEach((off) => off()); vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("학기 목록의 최소 경로 조회", () => {
  it("여러 화면이 ID 탐색과 meta 구독을 공유하고 출석·신청·루트 원장을 받지 않는다", async () => {
    const one = subscribe(), two = subscribe(); await flush();
    expect(mocks.fetch).toHaveBeenCalledOnce();
    expect(mocks.fetch).toHaveBeenCalledWith("/api/semester-ids", expect.objectContaining({ headers: { Authorization: "Bearer test-id-token" }, cache: "no-store" }));
    deliver("semesters/2026-2/meta", dated);
    expect([...paths.keys()]).toEqual(["semesters/2026-2/meta"]);
    expect(one.cb).toHaveBeenLastCalledWith([{ id: "2026-2", meta: dated }]);
    expect(two.cb).toHaveBeenCalledOnce();
    for (let i = 0; i < 100; i++) deliver("semesters/2026-2/meta", { ...dated });
    expect(one.cb).toHaveBeenCalledOnce();
    one.off(); expect(paths.get("semesters/2026-2/meta")!.off).not.toHaveBeenCalled();
    two.off(); expect(paths.get("semesters/2026-2/meta")!.off).toHaveBeenCalledOnce();
  });

  it("설정 기간이 없을 때만 회차를 읽고 기간 편집·추정을 실시간 보존한다", async () => {
    const { cb } = subscribe(); await flush();
    deliver("semesters/2026-2/meta", meta);
    expect(cb).not.toHaveBeenCalled();
    deliver("semesters/2026-2/sessions", { first: { date: "2026-08-29" }, last: { date: "2026-10-23", endDate: "2026-10-24" } });
    expect(cb).toHaveBeenLastCalledWith([{ id: "2026-2", meta: { ...meta, startDate: "2026-08-29", endDate: "2026-10-24" } }]);
    deliver("semesters/2026-2/sessions", { first: { date: "2026-08-29" }, last: { date: "2026-11-07" } });
    expect(cb).toHaveBeenLastCalledWith([{ id: "2026-2", meta: dated }]);
    const sessionOff = paths.get("semesters/2026-2/sessions")!.off;
    deliver("semesters/2026-2/meta", { ...dated, title: "수정" });
    expect(sessionOff).toHaveBeenCalledOnce();
    deliver("semesters/2026-2/meta", { ...meta, endDate: dated.endDate });
    expect(cb).toHaveBeenLastCalledWith([{ id: "2026-2", meta: { ...dated, title: "수정" } }]);
    deliver("semesters/2026-2/sessions", { first: { date: "2026-09-05" } });
    expect(cb).toHaveBeenLastCalledWith([{ id: "2026-2", meta: { ...dated, startDate: "2026-09-05" } }]);
  });

  it("다른 화면의 추가·삭제와 meta 없는 주일 공간을 처리하며 완성된 목록만 발행한다", async () => {
    mocks.fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ ids: ["2026-sunday", "2026-2"] }) });
    const { cb } = subscribe(); await flush();
    deliver("semesters/2026-2/meta", dated); expect(cb).not.toHaveBeenCalled();
    deliver("semesters/2026-sunday/meta", null);
    expect(cb).toHaveBeenCalledOnce();
    mocks.fetch.mockResolvedValue({ ok: true, json: async () => ({ ids: ["2026-1", "2026-2"] }) });
    window.dispatchEvent(new Event("focus")); await flush();
    deliver("semesters/2026-1/meta", dated);
    expect(cb).toHaveBeenLastCalledWith([{ id: "2026-2", meta: dated }, { id: "2026-1", meta: dated }]);
    mocks.fetch.mockResolvedValue({ ok: true, json: async () => ({ ids: [] }) });
    refreshSemesterList(); await flush();
    expect(cb).toHaveBeenLastCalledWith([]);
    expect(paths.get("semesters/2026-2/meta")!.off).toHaveBeenCalledOnce();
    deliver("semesters/2026-2/meta", { ...dated, title: "삭제 후 지연 응답" });
    expect(cb).toHaveBeenLastCalledWith([]);
  });

  it("실패는 빈 학기로 바꾸지 않고 재시도 성공 시 같은 목록도 복구 알림을 보낸다", async () => {
    const { cb, error } = subscribe(); await flush(); deliver("semesters/2026-2/meta", dated);
    const reason = new Error("permission_denied"); paths.get("semesters/2026-2/meta")!.fail(reason);
    expect(error).toHaveBeenCalledWith(reason); expect(cb).toHaveBeenCalledOnce();
    refreshSemesterList(); await flush(); deliver("semesters/2026-2/meta", dated);
    expect(cb).toHaveBeenCalledTimes(2);
    mocks.fetch.mockRejectedValueOnce(new Error("offline")); refreshSemesterList(); await flush();
    expect(error).toHaveBeenLastCalledWith(expect.objectContaining({ message: "offline" }));
    expect(cb).toHaveBeenCalledTimes(2);
    refreshSemesterList(); await flush(); expect(cb).toHaveBeenCalledTimes(3);
  });

  it("지연 요청·토큰 조회 중 로그아웃·구독 해제를 하면 결과를 내보내지 않는다", async () => {
    let resolve!: (value: unknown) => void;
    mocks.fetch.mockReturnValueOnce(new Promise((done) => { resolve = done; }));
    const { cb, off } = subscribe(); await flush();
    const signal = mocks.fetch.mock.calls[0][1].signal as AbortSignal;
    off(); expect(signal.aborted).toBe(true);
    resolve({ ok: true, json: async () => ({ ids: ["2026-2"] }) }); await flush();
    expect(mocks.onValue).not.toHaveBeenCalled(); expect(cb).not.toHaveBeenCalled();
    mocks.user!.getIdToken = vi.fn(async () => { mocks.user = null; return "old-account"; });
    subscribe(); await flush(); expect(mocks.fetch).toHaveBeenCalledOnce();
  });

  it("계정이 바뀌면 이전 캐시·실시간 콜백을 새 사용자에게 넘기지 않는다", async () => {
    const old = subscribe(); await flush(); deliver("semesters/2026-2/meta", dated);
    const previous = paths.get("semesters/2026-2/meta")!;
    mocks.user = { uid: "other", getIdToken: async () => "other-token" };
    const current = subscribe(); await flush();
    previous.deliver(snapshot({ ...dated, title: "이전 계정" }));
    expect(old.cb).toHaveBeenCalledOnce(); expect(current.cb).not.toHaveBeenCalled();
    deliver("semesters/2026-2/meta", dated); expect(current.cb).toHaveBeenCalledOnce();
  });

  it("ID 탐색은 1분 간격이고 숨겨진 화면에서는 중지하며 동시 새로고침을 겹치지 않는다", async () => {
    subscribe(); await flush(); deliver("semesters/2026-2/meta", dated);
    await vi.advanceTimersByTimeAsync(60000); expect(mocks.fetch).toHaveBeenCalledTimes(2);
    const visibility = vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    await vi.advanceTimersByTimeAsync(120000); expect(mocks.fetch).toHaveBeenCalledTimes(2);
    visibility.mockRestore();
    let resolve!: (value: unknown) => void;
    mocks.fetch.mockReturnValueOnce(new Promise((done) => { resolve = done; }));
    refreshSemesterList(); await flush(); refreshSemesterList(); refreshSemesterList();
    expect(mocks.fetch).toHaveBeenCalledTimes(3);
    resolve({ ok: true, json: async () => ({ ids: ["2026-2"] }) }); await flush();
    expect(mocks.fetch).toHaveBeenCalledTimes(4);
  });

  it.each([{ ok: false, json: async () => ({ error: "internal" }) }, { ok: true, json: async () => ({ ids: ["../private"] }) }, { ok: true, json: async () => ({ ids: null }) }])("잘못된 탐색 응답은 하위 경로를 읽거나 빈 목록으로 성공시키지 않는다", async (response) => {
    mocks.fetch.mockResolvedValue(response); const { cb, error } = subscribe(); await flush();
    expect(error).toHaveBeenCalledOnce(); expect(cb).not.toHaveBeenCalled(); expect(mocks.onValue).not.toHaveBeenCalled();
  });

  it("단건 조회도 ID→meta→필요한 회차만 읽는다", async () => {
    mocks.fetch.mockResolvedValue({ ok: true, json: async () => ({ ids: ["2026-1", "2026-2", "2026-sunday"] }) });
    mocks.get.mockImplementation(async (path: string) => snapshot(path === "semesters/2026-1/meta" ? meta : path === "semesters/2026-2/meta" ? dated : path.endsWith("sessions") ? { first: { date: "2026-03-01" } } : null));
    const list = await getSemesters();
    expect(list.map((item) => item.id)).toEqual(["2026-2", "2026-1"]);
    expect(mocks.get.mock.calls.map(([path]) => path).sort()).toEqual(["semesters/2026-1/meta", "semesters/2026-1/sessions", "semesters/2026-2/meta", "semesters/2026-sunday/meta"]);
  });
});
