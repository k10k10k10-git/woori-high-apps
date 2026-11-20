import { afterEach, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({
  get: vi.fn(async (): Promise<{ val: () => unknown }> => ({ val: () => ({}) })),
  initial: new Map<string, (snapshot?: { val: () => unknown }) => void>(),
  added: new Map<string, (snapshot: { key: string; val: () => unknown }) => void>(),
}));
vi.mock("@/lib/firebase", () => ({ db: {} }));
vi.mock("@/lib/rtdb", () => ({
  ref: (_db: unknown, path: string) => path,
  get: fixture.get,
  onChildAdded: (path: string, callback: (snapshot: { key: string; val: () => unknown }) => void) => {
    fixture.added.set(path, callback);
    return () => fixture.added.delete(path);
  },
  onChildChanged: () => () => undefined,
  onChildRemoved: () => () => undefined,
  onValue: (path: string, callback: (snapshot?: { val: () => unknown }) => void) => {
    fixture.initial.set(path, callback);
    return () => fixture.initial.delete(path);
  },
}));

import { readCurrentStudentRoster, subscribeStudentAttendance, subscribePeopleSearchData } from "./peopleSearchDb";

afterEach(() => {
  fixture.get.mockClear();
  fixture.initial.clear();
  fixture.added.clear();
  vi.useRealTimers();
});

it("학생 원장이 들어온 뒤에만 무거운 상세 조회를 시작하고 권한 없는 루트는 열지 않는다", () => {
  vi.useFakeTimers();
  const onComplete = vi.fn();
  const onRosterReady = vi.fn();
  const unsubscribe = subscribePeopleSearchData(
    { includeSemester: true, includePrivate: false, includeAttendancePrivate: false },
    onComplete, undefined, onRosterReady,
  );
  expect([...fixture.initial.keys()]).toEqual(["classes"]);
  fixture.added.get("classes")?.({ key: "2026", val: () => ({ "1-2-6": { students: { sample: { name: "가상학생" } } } }) });
  fixture.initial.get("classes")?.();
  expect(onRosterReady).toHaveBeenCalledOnce();
  expect(onRosterReady.mock.calls[0][0].classes["2026"]["1-2-6"].students.sample.name).toBe("가상학생");
  expect([...fixture.initial.keys()]).toEqual(["classes", "retreats", "semesters", "teacherStaff", "teacherSpecial", "teacherExtra"]);
  for (const [path, callback] of fixture.initial) if (path !== "retreats" && path !== "classes") callback();
  vi.runAllTimers();
  expect(onComplete).not.toHaveBeenCalled();
  fixture.initial.get("retreats")?.();
  vi.runAllTimers();
  expect(onComplete).toHaveBeenCalledOnce();
  unsubscribe();
  expect(fixture.initial.size).toBe(0);
});


it("서울 시간의 현재 연도 명단만 단건 조회한다", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-12-31T15:05:00Z"));
  const preview = await readCurrentStudentRoster();
  expect(fixture.get).toHaveBeenCalledExactlyOnceWith("classes/2027");
  expect(preview.classes).toEqual({ 2027: {} });
  expect(preview.attendance).toBeUndefined();
  expect(fixture.initial.size).toBe(0);
});


it("선택한 연도·반·학생의 출석만 읽어 구형 지각도 기존대로 집계한다", async () => {
  fixture.get.mockResolvedValueOnce({ val: () => ({ a: "O", b: "T", c: "X" }) });
  const summary = vi.fn();
  const stop = subscribeStudentAttendance({ year: "2025", classKey: "1-2-6", studentId: "sample" }, summary, vi.fn());
  await Promise.resolve();
  expect(summary).toHaveBeenLastCalledWith("출석 2 · 결석 1");
  const path = "attendance/2025/1-2-6/sample";
  expect(fixture.get).toHaveBeenCalledExactlyOnceWith(path);
  expect([...fixture.initial.keys()]).toEqual([path]);
  fixture.initial.get(path)?.({ val: () => ({ a: "O", b: "T", c: "O" }) });
  expect(summary).toHaveBeenLastCalledWith("출석 3 · 결석 0");
  stop();
  expect(fixture.initial.size).toBe(0);
});


it("늦게 도착한 최초 조회가 이미 받은 실시간 출석을 덮지 않는다", async () => {
  let resolveInitial!: (value: { val: () => unknown }) => void;
  fixture.get.mockReturnValueOnce(new Promise<{ val: () => unknown }>((resolve) => { resolveInitial = resolve; }));
  const summary = vi.fn();
  const stop = subscribeStudentAttendance({ year: "2026", classKey: "1-2-6", studentId: "sample" }, summary, vi.fn());
  fixture.initial.get("attendance/2026/1-2-6/sample")?.({ val: () => ({ a: "X" }) });
  resolveInitial({ val: () => ({ a: "O" }) });
  await Promise.resolve();
  expect(summary).toHaveBeenCalledExactlyOnceWith("출석 0 · 결석 1");
  stop();
});
