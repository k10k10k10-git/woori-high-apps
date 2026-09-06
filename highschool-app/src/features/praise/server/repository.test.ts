import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PraiseState } from "../types";
import { defaultPraisePolicy } from "../defaults";
const mocks = vi.hoisted(() => ({ admin: vi.fn(), ref: vi.fn(), get: vi.fn(), on: vi.fn(), off: vi.fn(), transaction: vi.fn(), token: vi.fn(), fetch: vi.fn(), current: null as unknown, primed: false }));
vi.mock("server-only", () => ({}));
vi.mock("./firebaseAdmin", async (importOriginal) => {
  const original = await importOriginal<typeof import("./firebaseAdmin")>();
  return { ...original, getPraiseFirebaseAdmin: mocks.admin };
});
import { listWorkspaceIds, readSemesterReference, readWorkspace, transactWorkspace, transactWorkspaceChecked } from "./repository";

function state(): PraiseState {
  return { schemaVersion: 1,
    meta: { id: "workspace-a", name: "테스트 찬양팀", startDate: "2026-09-01", endDate: "2026-12-31", status: "active", mode: "setup", revision: 1, updatedAt: 1000, updatedBy: "user-a" },
    policy: defaultPraisePolicy(1000, "user-a"), people: {}, meetings: {}, groupVersions: {}, attendance: {}, availability: {}, stageVersions: {}, access: {}, guides: {}, audit: {}, operations: {}, imports: {},
  };
}
beforeEach(() => {
  vi.resetAllMocks(); mocks.current = null; mocks.primed = false;
  mocks.get.mockImplementation(async () => ({ val: () => mocks.current }));
  mocks.on.mockImplementation((_event, listener) => { mocks.primed = true; queueMicrotask(listener); return listener; });
  mocks.transaction.mockImplementation(async (updater) => {
    const next = updater(mocks.primed ? structuredClone(mocks.current) : null);
    if (next !== undefined) mocks.current = next;
    return { committed: next !== undefined, snapshot: { val: () => mocks.current } };
  });
  mocks.ref.mockReturnValue({ get: mocks.get, on: mocks.on, off: mocks.off, transaction: mocks.transaction });
  mocks.token.mockResolvedValue({ access_token: "test-only-token" });
  mocks.admin.mockReturnValue({ database: { ref: mocks.ref }, app: { options: { databaseURL: "https://test-project.firebaseio.com", credential: { getAccessToken: mocks.token } } } });
  vi.stubGlobal("fetch", mocks.fetch);
});
afterEach(() => vi.unstubAllGlobals());

describe("찬양팀 단일 workspace 저장소", () => {
  it("없는 workspace는 null이고 다른 원장을 읽지 않는다", async () => {
    expect(await readWorkspace("workspace-a")).toBeNull();
    expect(mocks.ref).toHaveBeenCalledWith("praiseOps/workspace-a");
  });
  it.each(["../semesters", "bad/id", "__proto__", "constructor"])("경로 이탈 ID를 SDK 호출 전에 거절한다", async (id) => {
    await expect(readWorkspace(id)).rejects.toThrow(); expect(mocks.admin).not.toHaveBeenCalled();
  });
  it("RTDB에서 생략된 빈 맵과 필수 목록을 복원한다", async () => {
    const original = state(); mocks.current = { schemaVersion: 1, meta: original.meta, policy: { ...original.policy, rules: undefined } };
    expect(await readWorkspace("workspace-a")).toEqual(original);
  });
  it("빈 조·등단·안내·감사 목록과 미기록 상태를 복원한다", async () => {
    mocks.current = { ...state(),
      groupVersions: { group1: { id: "group1", groups: [{ id: "group-a" }] } },
      stageVersions: { stage1: { id: "stage1", services: [{ department: "FIRST" }] } },
      attendance: { meeting1: { student1: { revision: 1 } } }, availability: { meeting1: { staff1: { revision: 1, role: "SINGER" } } },
      audit: { audit1: { id: "audit1" } },
      guides: { guide1: { content: { roles: [{ id: "role1" }], steps: [{ id: "step1" }] } } },
    };
    const result = await readWorkspace("workspace-a");
    expect(result?.groupVersions.group1).toMatchObject({ rules: [], warnings: [], groups: [{ studentIds: [], staffIds: [] }] });
    expect(result?.stageVersions.stage1).toMatchObject({ warnings: [], candidates: [], overrides: [], services: [{ assignments: [] }] });
    expect(result?.attendance.meeting1.student1.status).toBeNull();
    expect(result?.availability.meeting1.staff1.present).toBeNull();
    expect(result?.audit.audit1.changes).toEqual([]);
    expect(result?.guides.guide1.content).toMatchObject({ preparation: [], roles: [{ responsibilities: [] }], steps: [{ instructions: [] }] });
  });
  it("공통 출결 삭제 영수증에서 RTDB가 생략한 null 상태를 복원한다", async () => {
    mocks.current = { ...state(), operations: { pending: { at: 2000, actorUid: "synthetic_actor", fingerprint: "synthetic_hash", sharedAttendance: {
      phase: "attempting", meetingId: "meeting", personId: "student", semesterId: "2026-2", sessionId: "session", applicationKey: "1_student", groupVersionId: "group", expectedSourceRevision: "synthetic_revision",
    } } } };
    const loaded = await readWorkspace("workspace-a");
    expect(loaded?.operations.pending.sharedAttendance).toMatchObject({ phase: "attempting", status: null, beforeStatus: null });
  });
  it("숫자 키 map의 RTDB 배열 표현을 키를 보존한 객체로 돌려준다", async () => {
    mocks.current = { ...state(), people: [null, { id: "1", name: "테스트" }], attendance: [null, [null, { revision: 1 }]], availability: [null, [null, { present: false, role: "SINGER" }]] };
    const result = await readWorkspace("workspace-a");
    expect(result?.people).toEqual({ "1": { id: "1", name: "테스트" } });
    expect(result?.attendance).toEqual({ "1": { "1": { revision: 1, status: null } } });
    expect(result?.availability).toEqual({ "1": { "1": { present: false, role: "SINGER" } } });
  });
  it.each([{ ...state(), schemaVersion: 2 }, { ...state(), meta: { id: "different" } }, { ...state(), policy: null }])("다른 버전·경로·손상 데이터를 조용히 덮어쓰지 않는다", async (current) => {
    mocks.current = current;
    await expect(readWorkspace("workspace-a")).rejects.toMatchObject({ status: 503, code: "invalid_workspace_data" });
  });
  it("cold start에서 첫 서버값을 확보하고 업무와 audit·operation을 같은 커밋에 저장한다", async () => {
    mocks.current = state();
    const result = await transactWorkspace("workspace-a", (current) => {
      if (!current) throw new Error("기존 workspace 누락");
      return { ...current, meta: { ...current.meta, revision: 2 }, audit: { event1: { id: "event1", at: 2000, actor: { uid: "user-a" }, action: "test", label: "테스트", changes: [] } }, operations: { op1: { at: 2000, actorUid: "user-a", fingerprint: "request" } } };
    });
    expect(result?.meta.revision).toBe(2); expect(result?.audit.event1).toBeDefined(); expect(result?.operations.op1).toBeDefined();
    expect(mocks.transaction).toHaveBeenCalledTimes(1); expect(mocks.transaction.mock.calls[0].slice(1)).toEqual([undefined, false]);
    expect(mocks.on).toHaveBeenCalledBefore(mocks.transaction); expect(mocks.off).toHaveBeenCalledOnce();
    expect(mocks.ref).toHaveBeenCalledTimes(1);
  });
  it("동시 수정 재시도에서 마지막 원장으로 updater를 다시 평가한다", async () => {
    mocks.current = state();
    mocks.transaction.mockImplementationOnce(async (updater) => {
      updater(state()); const concurrent = state(); concurrent.meta.revision = 3;
      const next = updater(concurrent); mocks.current = next;
      return { committed: true, snapshot: { val: () => next } };
    });
    expect((await transactWorkspace("workspace-a", (current) => ({ ...current!, meta: { ...current!.meta, revision: current!.meta.revision + 1 } })))?.meta.revision).toBe(4);
  });
  it("도메인 거절을 그대로 전달하고 listener를 해제하며 원장은 보존한다", async () => {
    mocks.current = state(); const denied = Object.assign(new Error("수정 권한이 없습니다."), { status: 403 });
    await expect(transactWorkspace("workspace-a", () => { throw denied; })).rejects.toBe(denied);
    expect(mocks.current).toEqual(state()); expect(mocks.off).toHaveBeenCalledOnce();
  });
  it("undefined abort는 기존 원장으로 돌아오며 optional undefined는 저장에서 제외한다", async () => {
    mocks.current = state(); expect(await transactWorkspace("workspace-a", () => undefined)).toEqual(state());
    await transactWorkspace("workspace-a", (current) => ({ ...current!, meta: { ...current!.meta, semesterId: undefined } }));
    expect(Object.hasOwn((mocks.current as PraiseState).meta, "semesterId")).toBe(false);
  });
  it("workspace 삭제·ID 변경은 커밋하지 않는다", async () => {
    mocks.current = state();
    await expect(transactWorkspace("workspace-a", () => null as unknown as PraiseState)).rejects.toMatchObject({ status: 503 });
    await expect(transactWorkspace("workspace-a", () => ({ ...state(), meta: { ...state().meta, id: "another" } }))).rejects.toMatchObject({ status: 503 });
    expect(mocks.current).toEqual(state());
  });
  it("SDK 장애의 민감한 내부 오류는 전달하지 않는다", async () => {
    mocks.transaction.mockRejectedValueOnce(new Error("private credential"));
    await expect(transactWorkspace("workspace-a", () => state())).rejects.toMatchObject({ status: 503, code: "workspace_write_unavailable" });
    expect(mocks.off).toHaveBeenCalledOnce();
  });
});

describe("최소 공개 참조 및 목록 읽기", () => {
  it("workspace 목록은 shallow REST로 ID만 읽고 서버 토큰은 헤더에만 둔다", async () => {
    mocks.fetch.mockResolvedValue(new Response(JSON.stringify({ "workspace-b": true, "workspace-a": true })));
    expect(await listWorkspaceIds()).toEqual(["workspace-a", "workspace-b"]);
    const [url, options] = mocks.fetch.mock.calls[0];
    expect(url.toString()).toBe("https://test-project.firebaseio.com/praiseOps.json?shallow=true");
    expect(options.headers).toEqual({ Authorization: "Bearer test-only-token" }); expect(options.cache).toBe("no-store");
    expect(mocks.ref).not.toHaveBeenCalled();
  });
  it("workspace 목록이 비어 있으면 빈 배열을 반환한다", async () => {
    mocks.fetch.mockResolvedValue(new Response("null")); expect(await listWorkspaceIds()).toEqual([]);
  });
  it("shallow 대신 원문이 반환되거나 잘못된 키가 있으면 반환하지 않는다", async () => {
    mocks.fetch.mockResolvedValue(new Response(JSON.stringify({ "workspace-a": { private: "fixture" } })));
    await expect(listWorkspaceIds()).rejects.toMatchObject({ status: 503 });
    mocks.fetch.mockResolvedValue(new Response('{"__proto__":true}'));
    await expect(listWorkspaceIds()).rejects.toMatchObject({ status: 503 });
  });
  it("학기 링크에는 공개 최소 필드만 남기고 private·출석 경로를 읽지 않는다", async () => {
    const values: Record<string, unknown> = {
      "semesters/2026-2/meta": { title: "테스트 학기", privateNote: "excluded" },
      "semesters/2026-2/teams": { team1: { name: "찬양팀", goal: "excluded" } },
      "semesters/2026-2/sessions": { session1: { date: "2026-09-05", memo: "excluded" } },
      "semesters/2026-2/applications": { app1: { id: "wrong-key", name: "테스트", teamId: "team1", phone: "excluded", parentPhone: "excluded", motive: "excluded", createdBy: "excluded" } },
    };
    mocks.ref.mockImplementation((path: string) => ({ get: async () => ({ val: () => values[path] }) }));
    expect(await readSemesterReference("2026-2")).toEqual({ id: "2026-2", meta: { title: "테스트 학기" }, teams: { team1: { id: "team1", name: "찬양팀" } }, sessions: { session1: { id: "session1", date: "2026-09-05" } }, applications: { app1: { id: "app1", name: "테스트", teamId: "team1" } } });
    expect(mocks.ref.mock.calls.map(([path]) => path)).toEqual(Object.keys(values));
  });
});


describe("등단 저장 직전 외부 원장 검증을 포함한 ETag CAS", () => {
  it("workspace 읽기·계산·외부 재검증 이후에만 If-Match 저장한다", async () => {
    const order: string[] = [];
    mocks.fetch.mockImplementation(async (_url, init) => {
      if (init.method === "PUT") { order.push("put"); expect(init.headers["If-Match"]).toBe('"v1"'); return new Response(init.body); }
      order.push("get"); expect(init.headers["X-Firebase-ETag"]).toBe("true"); return new Response(JSON.stringify(state()), { headers: { ETag: '"v1"' } });
    });
    const result = await transactWorkspaceChecked("workspace-a", current => { order.push("compute"); return { ...current!, meta: { ...current!.meta, revision: 2 } }; }, async () => { order.push("verify"); });
    expect(result?.meta.revision).toBe(2); expect(order).toEqual(["get", "compute", "verify", "put"]);
    expect(mocks.fetch.mock.calls[0][0].toString()).not.toContain("test-only-token");
  });
  it("최종 외부 출석 검사가 실패하면 PUT·감사 저장을 하지 않는다", async () => {
    mocks.fetch.mockResolvedValue(new Response(JSON.stringify(state()), { headers: { ETag: '"v1"' } }));
    const conflict = Object.assign(new Error("synthetic conflict"), { status: 409, code: "input_conflict" });
    await expect(transactWorkspaceChecked("workspace-a", current => ({ ...current!, meta: { ...current!.meta, revision: 2 } }), async () => { throw conflict; })).rejects.toBe(conflict);
    expect(mocks.fetch).toHaveBeenCalledOnce();
  });
  it("412 충돌 뒤 최신 workspace로 재계산하며 외부 출석도 다시 검사한다", async () => {
    let reads = 0, puts = 0; const verify = vi.fn(async () => {});
    mocks.fetch.mockImplementation(async (_url, init) => {
      if (init.method === "PUT") { puts++; return puts === 1 ? new Response("{}", { status: 412 }) : new Response(init.body); }
      reads++; const current = state(); current.meta.revision = reads === 1 ? 1 : 3;
      return new Response(JSON.stringify(current), { headers: { ETag: `"v${reads}"` } });
    });
    const result = await transactWorkspaceChecked("workspace-a", current => ({ ...current!, meta: { ...current!.meta, revision: current!.meta.revision + 1 } }), verify);
    expect(result?.meta.revision).toBe(4); expect(verify).toHaveBeenCalledTimes(2); expect(puts).toBe(2);
  });
  it("이미 완료한 동일 작업은 다시 저장하거나 외부 검증을 반복하지 않는다", async () => {
    mocks.fetch.mockResolvedValue(new Response(JSON.stringify(state()), { headers: { ETag: '"v1"' } }));
    const verify = vi.fn(); expect(await transactWorkspaceChecked("workspace-a", current => current!, verify)).toEqual(state()); expect(verify).not.toHaveBeenCalled(); expect(mocks.fetch).toHaveBeenCalledOnce();
  });
});
