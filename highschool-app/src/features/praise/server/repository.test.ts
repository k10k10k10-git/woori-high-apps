import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PraiseState } from "../types";
import { defaultPraisePolicy } from "../defaults";
const mocks = vi.hoisted(() => ({ admin: vi.fn(), ref: vi.fn(), get: vi.fn(), on: vi.fn(), off: vi.fn(), transaction: vi.fn(), token: vi.fn(), fetch: vi.fn(), current: null as unknown, primed: false }));
vi.mock("server-only", () => ({}));
vi.mock("./firebaseAdmin", async (importOriginal) => {
  const original = await importOriginal<typeof import("./firebaseAdmin")>();
  return { ...original, getPraiseFirebaseAdmin: mocks.admin };
});
import { listWorkspaceIds, readSemesterReference, readWorkspace, transactWorkspace } from "./repository";

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
