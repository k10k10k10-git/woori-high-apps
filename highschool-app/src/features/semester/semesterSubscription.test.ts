import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DataSnapshot } from "firebase/database";

const mocks = vi.hoisted(() => ({ onValue: vi.fn(), unsubscribe: vi.fn() }));
vi.mock("firebase/database", () => ({
  ref: (_db: unknown, path: string) => path,
  onValue: mocks.onValue,
  get: vi.fn(), update: vi.fn(), remove: vi.fn(),
}));
vi.mock("@/features/activityLog/write", () => ({
  auditedUpdate: vi.fn(), auditedRemove: vi.fn(),
}));
vi.mock("@/lib/firebase", () => ({ db: {} }));

import { subscribeSemesters } from "./db";

let deliver: (snapshot: DataSnapshot) => void;
const meta = { title: "2학기", createdAt: "2026-08-01", completionRule: { minRate: 0.7 } };
const snapshot = (value: unknown) => ({ exists: () => value != null, val: () => value }) as DataSnapshot;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.onValue.mockImplementation((_path: string, callback: typeof deliver) => {
    deliver = callback;
    return mocks.unsubscribe;
  });
});

describe("subscribeSemesters — 목록에 영향 없는 하위 갱신 억제", () => {
  it("출석 변경 100건이 와도 같은 학기 목록은 한 번만 전달한다", () => {
    const callback = vi.fn();
    subscribeSemesters(callback);
    deliver(snapshot({ "2026-2": { meta } }));
    for (let index = 0; index < 100; index += 1) {
      deliver(snapshot({
        "2026-2": { meta: structuredClone(meta), attendance: { [index]: { student: { s: "출석" } } } },
      }));
    }
    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith([{ id: "2026-2", meta }]);
  });

  it("제목·날짜·수료 기준처럼 목록 meta가 달라지면 최신값을 전달한다", () => {
    const callback = vi.fn();
    subscribeSemesters(callback);
    for (const changed of [meta, { ...meta, title: "수정한 학기" }, { ...meta, startDate: "2026-09-01" }, { ...meta, completionRule: { minRate: 0.8 } }]) {
      deliver(snapshot({ "2026-2": { meta: changed } }));
    }
    expect(callback).toHaveBeenCalledTimes(4);
    expect(callback).toHaveBeenLastCalledWith([{ id: "2026-2", meta: { ...meta, completionRule: { minRate: 0.8 } } }]);
  });

  it("빈 목록·추가·삭제를 전달하고 meta 없는 주일 작업공간은 제외한다", () => {
    const callback = vi.fn();
    subscribeSemesters(callback);
    deliver(snapshot(null));
    deliver(snapshot({ "2026-sunday": { newFriends: { a: { name: "새친구" } } } }));
    deliver(snapshot({ "2026-1": { meta }, "2026-2": { meta }, "2026-sunday": {} }));
    deliver(snapshot({ "2026-1": { meta } }));
    deliver(snapshot(null));
    expect(callback.mock.calls.map(([value]) => value)).toEqual([
      [], [{ id: "2026-2", meta }, { id: "2026-1", meta }], [{ id: "2026-1", meta }], [],
    ]);
  });

  it("기존 오류 콜백과 구독 해제를 유지한다", () => {
    const onError = vi.fn();
    const unsubscribe = subscribeSemesters(vi.fn(), onError);
    const error = new Error("permission_denied");
    mocks.onValue.mock.calls[0][2](error);
    expect(onError).toHaveBeenCalledWith(error);
    unsubscribe();
    expect(mocks.unsubscribe).toHaveBeenCalledOnce();
  });
});

it("회차 범위가 바뀌면 목록 날짜를 다시 계산하지만 출결 변화로 재발행하지 않는다", () => {
  const callback = vi.fn();
  subscribeSemesters(callback);
  const sessions = { first: { date: "2026-08-29" }, last: { date: "2026-10-23", endDate: "2026-10-24" } };
  deliver(snapshot({ "2026-2": { meta, sessions } }));
  deliver(snapshot({ "2026-2": { meta, sessions, attendance: { value: "changed" } } }));
  expect(callback).toHaveBeenCalledOnce();
  expect(callback).toHaveBeenLastCalledWith([{ id: "2026-2", meta: { ...meta, startDate: "2026-08-29", endDate: "2026-10-24" } }]);
  deliver(snapshot({ "2026-2": { meta, sessions: { ...sessions, next: { date: "2026-11-07" } } } }));
  expect(callback).toHaveBeenLastCalledWith([{ id: "2026-2", meta: { ...meta, startDate: "2026-08-29", endDate: "2026-11-07" } }]);
});
