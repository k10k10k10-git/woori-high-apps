import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  get: vi.fn(), onValue: vi.fn(), unsubscribe: vi.fn(), auth: { currentUser: { uid: "admin-1" } as { uid: string } | null },
}));
vi.mock("@/lib/firebase", () => ({ auth: mocks.auth, db: {} }));
vi.mock("@/lib/rtdb", () => ({
  get: mocks.get, onValue: mocks.onValue,
  ref: (_db: unknown, path: string) => path,
  query: (...constraints: unknown[]) => constraints,
  orderByChild: (key: string) => ({ orderBy: key }),
  startAt: (value: number) => ({ startAt: value }),
  endAt: (value: number) => ({ endAt: value }),
  endBefore: (value: number, key: string) => ({ endBefore: value, key }),
  limitToLast: (value: number) => ({ limit: value }),
  limitToFirst: (value: number) => ({ limitFirst: value }),
}));
import { loadActivityLogPage, subscribeActivityLogStatus } from "./db";

const range = { from: "2026-09-01", to: "2026-09-06" };
const time = Date.parse("2026-09-05T00:00:00Z");
function row(id: string) {
  return { id, schemaVersion: 1, occurredAt: time, recordedAt: time + 1,
    actor: { kind: "user", uid: "writer-1" }, area: "attendance", action: "create",
    target: { path: "semesters/example/attendance/team/session/student", label: "검증 학생" },
    changes: [{ field: "출석 상태", after: "출석" }], changedCount: 1 };
}
function snap(value: unknown) {
  return { val: () => value, exists: () => value !== null, forEach: (visit: (child: { key: string; val: () => unknown }) => void) => {
    for (const [key, data] of Object.entries(value ?? {})) visit({ key, val: () => data });
  } };
}
beforeEach(() => {
  vi.resetAllMocks();
  mocks.auth.currentUser = { uid: "admin-1" };
  mocks.onValue.mockReturnValue(mocks.unsubscribe);
});

describe("활동 로그 페이지 조회", () => {
  it("로그인하지 않았거나 실제 admins 플래그가 없으면 기록을 읽지 않는다", async () => {
    mocks.auth.currentUser = null;
    await expect(loadActivityLogPage(range)).rejects.toThrow("통합관리자");
    expect(mocks.get).not.toHaveBeenCalled();
    mocks.auth.currentUser = { uid: "admin-1" };
    mocks.get.mockResolvedValueOnce(snap(false));
    await expect(loadActivityLogPage(range)).rejects.toThrow("통합관리자");
    expect(mocks.get).toHaveBeenCalledTimes(1);
  });
  it("조회 기간을 제한하고 동일 시각 기록은 키까지 커서에 넣어 중복을 피한다", async () => {
    const data = Object.fromEntries(Array.from({ length: 101 }, (_, index) => {
      const id = `event-${String(index).padStart(3, "0")}`;
      return [id, row(id)];
    }));
    mocks.get.mockResolvedValueOnce(snap(true)).mockResolvedValueOnce(snap(data));
    const page = await loadActivityLogPage(range);
    expect(page.records).toHaveLength(100);
    expect(page.records[0].id).toBe("event-100");
    expect(page.nextCursor).toEqual({ occurredAt: time, id: "event-001" });
    expect(mocks.get.mock.calls[1][0]).toEqual([
      "activityLogs/events", { orderBy: "occurredAt" },
      { startAt: Date.parse("2026-09-01T00:00:00+09:00") },
      { endAt: Date.parse("2026-09-06T23:59:59.999+09:00") }, { limit: 101 },
    ]);
    mocks.get.mockResolvedValueOnce(snap(true)).mockResolvedValueOnce(snap({ "event-000": row("event-000") }));
    const last = await loadActivityLogPage(range, page.nextCursor!);
    expect(mocks.get.mock.calls[3][0]).toContainEqual({ endBefore: time, key: "event-001" });
    expect(last.records.map((entry) => entry.id)).toEqual(["event-000"]);
    expect(last.nextCursor).toBeNull();
  });
  it("불법 커서나 넓은 기간은 네트워크 조회 전에 거부한다", async () => {
    await expect(loadActivityLogPage(range, { occurredAt: time, id: "bad/key" })).rejects.toThrow("조회 위치");
    await expect(loadActivityLogPage({ from: "2026-01-01", to: "2026-09-01" })).rejects.toThrow("31일");
    expect(mocks.get).not.toHaveBeenCalled();
  });
  it("조회 중 계정이 바뀌면 이전 계정의 결과를 반환하지 않는다", async () => {
    mocks.get.mockResolvedValueOnce(snap(true)).mockImplementationOnce(async () => {
      mocks.auth.currentUser = { uid: "another" };
      return snap({ record: row("record") });
    });
    await expect(loadActivityLogPage(range)).rejects.toThrow("통합관리자");
  });
  it.each([{ broken: "문자열" }, { actual: row("forged") }, { broken: { ...row("broken"), schemaVersion: 4 } }])("손상된 기록을 조용히 생략하지 않는다", async (data) => {
    mocks.get.mockResolvedValueOnce(snap(true)).mockResolvedValueOnce(snap(data));
    await expect(loadActivityLogPage(range)).rejects.toThrow("읽을 수 없는 형식");
  });
  it("서버의 권한 거부를 빈 결과로 바꾸지 않는다", async () => {
    mocks.get.mockResolvedValueOnce(snap(true)).mockRejectedValueOnce(new Error("PERMISSION_DENIED"));
    await expect(loadActivityLogPage(range)).rejects.toThrow("PERMISSION_DENIED");
  });
});

describe("활동 로그 첫/마지막 저장 시각 구독", () => {
  it("빈 기록과 첫/마지막 시각을 구분하고 구독 오류를 전달한다", () => {
    const onData = vi.fn(), onError = vi.fn();
    const unsubscribe = subscribeActivityLogStatus(onData, onError);
    const [, first, fail] = mocks.onValue.mock.calls[0];
    const [, last] = mocks.onValue.mock.calls[1];
    expect(mocks.onValue.mock.calls[0][0]).toContainEqual({ limitFirst: 1 });
    expect(mocks.onValue.mock.calls[1][0]).toContainEqual({ limit: 1 });
    first(snap(null));
    expect(onData).not.toHaveBeenCalled();
    last(snap(null));
    expect(onData).toHaveBeenCalledWith(null);
    first(snap({ first: row("first") }));
    last(snap({ last: { ...row("last"), occurredAt: time + 10 } }));
    expect(onData).toHaveBeenCalledWith({ startedAt: time, lastRecordedAt: time + 10 });
    fail(new Error("PERMISSION_DENIED"));
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: "PERMISSION_DENIED" }));
    unsubscribe();
    onData.mockClear();
    first(snap(null));
    expect(onData).not.toHaveBeenCalled();
    expect(mocks.unsubscribe).toHaveBeenCalledTimes(2);
  });
  it("로그아웃 후 응답과 손상된 기록 시각을 허용하지 않는다", () => {
    const onData = vi.fn(), onError = vi.fn();
    subscribeActivityLogStatus(onData, onError);
    const receive = mocks.onValue.mock.calls[0][1];
    receive(snap({ bad: { ...row("bad"), occurredAt: NaN } }));
    expect(onError).toHaveBeenCalledOnce();
    mocks.auth.currentUser = null;
    receive(snap({ first: row("first") }));
    expect(onError).toHaveBeenCalledTimes(2);
    expect(onData).not.toHaveBeenCalled();
  });
});
