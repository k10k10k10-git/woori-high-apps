import { afterEach, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({
  get: vi.fn(async () => ({ val: () => ({}) })),
  initial: new Map<string, () => void>(),
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
  onValue: (path: string, callback: () => void) => {
    fixture.initial.set(path, callback);
    return () => fixture.initial.delete(path);
  },
}));

import { readCurrentStudentRoster, subscribePeopleSearchData } from "./peopleSearchDb";

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
  expect([...fixture.initial.keys()]).toEqual(["classes", "attendance", "retreats", "semesters", "teacherStaff", "teacherSpecial", "teacherExtra"]);
  for (const [path, callback] of fixture.initial) if (path !== "attendance" && path !== "classes") callback();
  vi.runAllTimers();
  expect(onComplete).not.toHaveBeenCalled();
  fixture.initial.get("attendance")?.();
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
  expect(fixture.initial.size).toBe(0);
});
