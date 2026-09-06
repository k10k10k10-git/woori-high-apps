import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DatabaseReference, TransactionResult } from "firebase/database";

const mocks = vi.hoisted(() => ({
  auth: { currentUser: null as null | { uid: string; getIdTokenResult: () => Promise<{ claims: { name?: unknown } }> } },
  update: vi.fn(), transaction: vi.fn(), push: vi.fn(),
}));

function reference(path = "", root?: DatabaseReference): DatabaseReference {
  if (!root) {
    const object = { key: null, parent: null } as unknown as DatabaseReference;
    Object.assign(object, { root: object });
    root = object;
  }
  let current = root;
  for (const key of path.split("/").filter(Boolean)) current = { key, parent: current, root } as DatabaseReference;
  return current;
}

vi.mock("@/lib/firebase", () => ({ auth: mocks.auth }));
vi.mock("firebase/database", () => ({
  child: (ref: DatabaseReference, path: string) => reference(path, ref.root),
  push: (...args: unknown[]) => mocks.push(...args),
  update: (...args: unknown[]) => mocks.update(...args),
  runTransaction: (...args: unknown[]) => mocks.transaction(...args),
  serverTimestamp: () => ({ ".sv": "timestamp" }),
}));

import { ActivityLogAfterCommitError, auditedRemove, auditedRunTransaction, auditedSet, auditedUpdate } from "./write";

const PATH = "semesters/s1/attendance/team/session1/a1";
function signedUser(name: unknown = "서명된 이름", uid = "user1") {
  return { uid, getIdTokenResult: vi.fn(async () => ({ claims: { name } })) };
}
function loggedRecord() {
  const patch = mocks.update.mock.calls.at(-1)?.[1] as Record<string, unknown>;
  return patch["activityLogs/events/event1"] as {
    actor: { kind: string; uid: string; name?: string };
    target: { label: string; context?: string; path: string };
    occurredAt: unknown; recordedAt: unknown; action: string;
    changes: { field: string; after?: string }[];
  };
}
function transactionResult(value: unknown, committed = true): TransactionResult {
  return { committed, snapshot: { val: () => value } } as TransactionResult;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.currentUser = signedUser();
  mocks.update.mockReset().mockResolvedValue(undefined);
  mocks.transaction.mockReset();
  mocks.push.mockReset().mockImplementation((ref: DatabaseReference) => reference("activityLogs/events/event1", ref.root));
});

describe("일반 업무와 활동 로그의 원자 저장", () => {
  it("호출한 DB root에 원장과 로그를 한 번에 쓰며 원본 값을 유지한다", async () => {
    const ref = reference(PATH);
    const value = Object.freeze({ s: "출석", by: "untrusted", at: Object.freeze({ ".sv": "timestamp" }) });
    await auditedSet(ref, value);
    expect(mocks.update).toHaveBeenCalledTimes(1);
    const [root, patch] = mocks.update.mock.calls[0];
    expect(root).toBe(ref.root);
    expect(patch[PATH]).toBe(value);
    expect(Object.keys(patch)).toEqual([PATH, "activityLogs/events/event1"]);
    expect(loggedRecord().actor).toEqual({ kind: "user", uid: "user1", name: "서명된 이름" });
    expect(loggedRecord().occurredAt).toEqual({ ".sv": "timestamp" });
    expect(loggedRecord().recordedAt).toEqual({ ".sv": "timestamp" });
    expect(loggedRecord().changes[0]).toEqual({ field: "저장된 출석 상태", after: "출석" });
    expect(JSON.stringify(loggedRecord())).not.toContain("untrusted");
  });

  it("다중 경로 root update도 저장 호출 하나와 로그 하나를 유지한다", async () => {
    const patch = Object.fromEntries(Array.from({ length: 127 }, (_, index) => [`semesters/s1/applications/a${index}`, { name: "합성" }]));
    await auditedUpdate(reference(), patch);
    expect(mocks.update).toHaveBeenCalledTimes(1);
    expect(Object.keys(mocks.update.mock.calls[0][1])).toHaveLength(128);
    expect(loggedRecord().changes).toHaveLength(30);
  });

  it("표시 맥락은 업무 값에 추가하지 않고 update와 삭제 요약에만 사용한다", async () => {
    const context = { subjectName: "테스트 학생", date: "2026-09-05" };
    await auditedUpdate(reference(PATH), { s: "결석" }, context);
    expect(mocks.update.mock.calls[0][1][`${PATH}/s`]).toBe("결석");
    expect(loggedRecord().target.label).toContain("테스트 학생");
    expect(loggedRecord().target.context).toContain("2026-09-05");
    await auditedRemove(reference(PATH), context);
    expect(mocks.update.mock.calls[1][1][PATH]).toBeNull();
    expect(loggedRecord().action).toBe("delete");
    expect(loggedRecord().target.label).toContain("테스트 학생");
  });

  it("set(null)은 삭제로 기록한다", async () => {
    await auditedSet(reference(PATH), null);
    expect(loggedRecord().action).toBe("delete");
  });

  it("빈 update는 인증 조회나 쓰기 없이 끝난다", async () => {
    mocks.auth.currentUser = null;
    await auditedUpdate(reference(PATH), {});
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it("백업·알림 확인은 원장을 그대로 쓰되 활동 기록을 만들지 않는다", async () => {
    const patch = { "retreats/r1/participantsBackups/123": { name: "합성" }, "iguardPending/user1/siteRequests/r1/notifiedAt": 123 };
    await auditedUpdate(reference(), patch);
    expect(mocks.update.mock.calls[0][1]).toEqual(patch);
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it("로그 거부는 업무와 함께 실패하고 별도 부분 쓰기를 시도하지 않는다", async () => {
    const denial = new Error("PERMISSION_DENIED");
    mocks.update.mockRejectedValueOnce(denial);
    await expect(auditedSet(reference(PATH), { s: "출석" })).rejects.toBe(denial);
    expect(mocks.update).toHaveBeenCalledTimes(1);
  });

  it.each(["root", "overlap", "log"])("%s 비정상 쓰기는 SDK에 전달하지 않는다", async (kind) => {
    const promise = kind === "root" ? auditedSet(reference(), {}) : kind === "overlap"
      ? auditedUpdate(reference(), { "semesters/a": {}, "semesters/a-b": {}, "semesters/a/name": "합성" })
      : auditedSet(reference("activityLogs/events/forged"), {});
    await expect(promise).rejects.toThrow();
    expect(mocks.update).not.toHaveBeenCalled();
  });
});

describe("인증 작성자 계약", () => {
  it("미로그인은 원장 쓰기 전에 거부한다", async () => {
    mocks.auth.currentUser = null;
    await expect(auditedSet(reference(PATH), { s: "출석" })).rejects.toThrow("로그인 상태");
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("토큰 이름 조회가 실패해도 현재 UID로 기존 오프라인 쓰기 큐를 사용할 수 있다", async () => {
    const user = signedUser();
    user.getIdTokenResult.mockRejectedValueOnce(new Error("token failed"));
    mocks.auth.currentUser = user;
    await auditedSet(reference(PATH), { s: "출석" });
    expect(mocks.update).toHaveBeenCalledTimes(1);
    expect(loggedRecord().actor).toEqual({ kind: "user", uid: "user1" });
  });

  it("토큰 조회 실패 중 계정 전환은 이름 fallback으로 덮지 않는다", async () => {
    const user = signedUser();
    user.getIdTokenResult.mockImplementationOnce(async () => {
      mocks.auth.currentUser = signedUser("다른 계정", "user2");
      throw new Error("token failed");
    });
    mocks.auth.currentUser = user;
    await expect(auditedSet(reference(PATH), { s: "출석" })).rejects.toThrow("계정이 변경");
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("토큰 대기 중 계정이 바뀌면 이전 UID로 쓰지 않는다", async () => {
    const user = signedUser();
    user.getIdTokenResult.mockImplementationOnce(async () => {
      mocks.auth.currentUser = signedUser("다른 계정", "user2");
      return { claims: { name: "이전 계정" } };
    });
    mocks.auth.currentUser = user;
    await expect(auditedSet(reference(PATH), { s: "출석" })).rejects.toThrow("계정이 변경");
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("로그 준비 후 계정 변경도 실제 원장 쓰기 직전에 거부한다", async () => {
    mocks.push.mockImplementationOnce((ref: DatabaseReference) => {
      mocks.auth.currentUser = null;
      return reference("activityLogs/events/event1", ref.root);
    });
    await expect(auditedSet(reference(PATH), { s: "출석" })).rejects.toThrow("계정이 변경");
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("토큰 name은 공백을 변형하지 않아 Rules의 정확 비교와 일치한다", async () => {
    mocks.auth.currentUser = signedUser("  토큰 이름  ");
    await auditedSet(reference(PATH), { s: "출석" });
    expect(loggedRecord().actor.name).toBe("  토큰 이름  ");
  });

  it.each([undefined, "  ", "x".repeat(81), "person@example.test", "이름\n", "010-9999-8888"])("표시할 수 없는 claim 이름은 생략한다", async (name) => {
    mocks.auth.currentUser = { uid: "user1", getIdTokenResult: async () => ({ claims: { name } }) };
    await auditedSet(reference(PATH), { s: "출석" });
    expect(loggedRecord().actor).toEqual({ kind: "user", uid: "user1" });
  });

  it("긴 자기 UID로 미승인 접근 요청을 해도 Rules가 비교할 경로를 유지한다", async () => {
    const uid = "requester_123456789_" + "x".repeat(90);
    mocks.auth.currentUser = signedUser("신청자", uid);
    await auditedUpdate(reference(`iguardPending/${uid}`), { name: "신청자", requestedAt: 1 });
    expect(loggedRecord().target.path).toBe(`iguardPending/${uid}`);
  });
});

describe("기존 transaction 범위와 저장 이후 실패", () => {
  it("성공한 변경만 커밋 후 별도 로그로 남기고 원래 결과와 옵션을 보존한다", async () => {
    const ref = reference("retreats/r1/participants/p1");
    const result = transactionResult({ isOnSite: true });
    mocks.transaction.mockImplementationOnce(async (target, fn, options) => {
      expect(target).toBe(ref);
      expect(options).toEqual({ applyLocally: false });
      expect(fn({ isOnSite: false })).toEqual({ isOnSite: true });
      expect(mocks.update).not.toHaveBeenCalled();
      return result;
    });
    await expect(auditedRunTransaction(ref, () => ({ isOnSite: true }), { applyLocally: false })).resolves.toBe(result);
    expect(Object.keys(mocks.update.mock.calls[0][1])).toEqual(["activityLogs/events/event1"]);
  });

  it("재시도 중 처음에는 달라도 마지막 callback이 동일값이면 기록하지 않는다", async () => {
    mocks.transaction.mockImplementationOnce(async (_ref, fn) => {
      fn({ isOnSite: false });
      fn({ isOnSite: true });
      return transactionResult({ isOnSite: true });
    });
    await auditedRunTransaction(reference("retreats/r1/participants/p1"), (current) => current.isOnSite ? current : { ...current, isOnSite: true });
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("직접 객체 수정과 재시도 최종 변경도 빠뜨리지 않는다", async () => {
    mocks.transaction.mockImplementationOnce(async (_ref, fn) => {
      fn({ isOnSite: true });
      const next = fn({ isOnSite: false });
      return transactionResult(next);
    });
    await auditedRunTransaction(reference("retreats/r1/participants/p1"), (current) => { current.isOnSite = true; return current; });
    expect(mocks.update).toHaveBeenCalledTimes(1);
  });

  it("객체 키 순서만 달라진 callback은 no-op이다", async () => {
    mocks.transaction.mockImplementationOnce(async (_ref, fn) => transactionResult(fn({ a: 1, b: 2 })));
    await auditedRunTransaction(reference("retreats/r1/participants/p1"), () => ({ b: 2, a: 1 }));
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("abort는 기록하지 않고 업무 실패는 원래 오류를 전달한다", async () => {
    mocks.transaction.mockImplementationOnce(async (_ref, fn) => { expect(fn(null)).toBeUndefined(); return transactionResult(null, false); });
    await auditedRunTransaction(reference(PATH), () => undefined);
    expect(mocks.update).not.toHaveBeenCalled();
    const error = new Error("business failed");
    mocks.transaction.mockRejectedValueOnce(error);
    await expect(auditedRunTransaction(reference(PATH), () => ({ s: "출석" }))).rejects.toBe(error);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("업무 커밋 후 로그 실패는 재시도 오해를 막는 전용 오류로 구분한다", async () => {
    mocks.transaction.mockImplementationOnce(async (_ref, fn) => transactionResult(fn(null)));
    mocks.update.mockRejectedValueOnce(new Error("log denied"));
    const operation = auditedRunTransaction(reference(PATH), () => ({ s: "출석" }));
    await expect(operation).rejects.toBeInstanceOf(ActivityLogAfterCommitError);
    await expect(operation).rejects.toMatchObject({ businessCommitted: true, message: "업무는 저장됐으나 활동 로그 저장에 실패했습니다. 새로고침 후 확인해 주세요." });
    expect(mocks.transaction).toHaveBeenCalledTimes(1);
    expect(mocks.update).toHaveBeenCalledTimes(1);
  });

  it("transaction 커밋 중 계정이 바뀌면 다른 UID 로그를 만들지 않는다", async () => {
    mocks.transaction.mockImplementationOnce(async (_ref, fn) => {
      const result = transactionResult(fn(null));
      mocks.auth.currentUser = signedUser("다른 사람", "user2");
      return result;
    });
    await expect(auditedRunTransaction(reference(PATH), () => ({ s: "출석" }))).rejects.toBeInstanceOf(ActivityLogAfterCommitError);
    expect(mocks.update).not.toHaveBeenCalled();
  });
});
