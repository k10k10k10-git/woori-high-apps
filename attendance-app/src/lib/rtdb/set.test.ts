// 출석부가 23곳에서 쓰는 set() 이 루트가 아닌 경로에서 Firebase set 과 같게 동작하는지 확인한다.
import { afterEach, describe, expect, it, vi } from "vitest";
import { createDatabase, type RtdbDatabase } from "./database";
import { get, onValue, ref, remove, set } from "./index";
import { FakeSupabase } from "./testing/fakeSupabase";

const databases: RtdbDatabase[] = [];
afterEach(() => databases.splice(0).forEach((db) => db._repo.dispose()));

function setup(initial?: unknown) {
  const fake = new FakeSupabase(initial);
  const db = createDatabase({ client: () => fake, realtime: false, watchEnvironment: false, refreshDelayMs: 0, retryDelayMs: () => 5, now: () => 1_800_000_000_000 });
  databases.push(db);
  return { fake, db };
}

const initial = {
  classes: { 2026: {
    "1-1-1": { teacher: "담임", students: { s1: { id: "s1", name: "가", phone: "010" }, s2: { id: "s2", name: "나" } } },
    "1-1-2": { teacher: "다른 반" },
  } },
  attendance: { 2026: { "1-1-1": { s1: { "0-0": "O", "0-1": "X" } } } },
};

describe("set: 루트가 아닌 경로", () => {
  it("그 위치의 하위 트리를 통째로 바꾸고(빠진 자식은 사라짐) 형제·부모의 다른 자식은 그대로 둔다", async () => {
    const { fake, db } = setup(initial);
    await set(ref(db, "classes/2026/1-1-1/students/s1"), { id: "s1", name: "가2" });
    expect(fake.callsOf("rtdb_update").map((call) => call.args.p_patch)).toEqual([{ "classes/2026/1-1-1/students/s1": { id: "s1", name: "가2" } }]);
    expect(fake.value("classes/2026/1-1-1/students/s1")).toEqual({ id: "s1", name: "가2" });
    expect(fake.value("classes/2026/1-1-1/students/s2")).toEqual({ id: "s2", name: "나" });
    expect(fake.value("classes/2026/1-1-2")).toEqual({ teacher: "다른 반" });
    expect(fake.value("attendance")).toEqual(initial.attendance);
  });

  it("없던 깊은 경로는 중간 노드를 만들고, 잎 값(출석 셀)은 그 셀만 바꾼다", async () => {
    const { fake, db } = setup(initial);
    await set(ref(db, "attendance/2026/1-1-1/s2/0-0"), "O");
    await set(ref(db, "attendance/2026/1-1-1/s1/0-1"), "O");
    expect(fake.value("attendance/2026/1-1-1")).toEqual({ s1: { "0-0": "O", "0-1": "O" }, s2: { "0-0": "O" } });
  });

  it("null·remove 는 지우고, 자식이 모두 없어진 부모는 Firebase 처럼 사라진다", async () => {
    const { fake, db } = setup(initial);
    await set(ref(db, "attendance/2026/1-1-1/s1/0-0"), null);
    expect(fake.callsOf("rtdb_update")[0].args.p_patch).toEqual({ "attendance/2026/1-1-1/s1/0-0": null });
    await remove(ref(db, "attendance/2026/1-1-1/s1/0-1"));
    expect(fake.value("attendance")).toBeNull();
    expect((await get(ref(db, "attendance/2026"))).exists()).toBe(false);
  });

  it("빈 객체·빈 배열은 null 과 같다(지우기)", async () => {
    const { fake, db } = setup(initial);
    await set(ref(db, "classes/2026/1-1-2"), {});
    expect(fake.value("classes/2026/1-1-2")).toBeNull();
    await set(ref(db, "classes/2026/1-1-1/students"), []);
    expect(fake.value("classes/2026/1-1-1")).toEqual({ teacher: "담임" });
  });

  it("배열은 인덱스 키로 저장하고 읽을 때 다시 배열로 준다", async () => {
    const { fake, db } = setup();
    await set(ref(db, "config/list"), ["a", "b"]);
    expect(fake.callsOf("rtdb_update")[0].args.p_patch).toEqual({ "config/list": { 0: "a", 1: "b" } });
    expect((await get(ref(db, "config/list"))).val()).toEqual(["a", "b"]);
  });

  it("구독 중인 화면에는 서버 응답 전에 바로 보이고, 거부되면 되돌린 뒤 PERMISSION_DENIED 로 실패한다", async () => {
    const { fake, db } = setup(initial);
    const values: unknown[] = [];
    onValue(ref(db, "attendance/2026/1-1-1/s1"), (snapshot) => values.push(snapshot.val()));
    await vi.waitFor(() => expect(values).toHaveLength(1));
    fake.denyWrite = (path) => path.startsWith("attendance/");
    const writing = set(ref(db, "attendance/2026/1-1-1/s1/0-0"), "X");
    expect(values.at(-1)).toEqual({ "0-0": "X", "0-1": "X" });
    await expect(writing).rejects.toMatchObject({ code: "PERMISSION_DENIED" });
    expect(values.at(-1)).toEqual({ "0-0": "O", "0-1": "X" });
    expect(fake.value("attendance/2026/1-1-1/s1")).toEqual({ "0-0": "O", "0-1": "X" });
  });

  it("Firebase 처럼 undefined·잘못된 키는 보내기 전에 바로 예외, 루트 set 은 막는다(출석부는 쓰지 않음)", () => {
    const { fake, db } = setup();
    expect(() => set(ref(db, "a"), undefined)).toThrow(/undefined/);
    expect(() => set(ref(db, "a"), { "b.c": 1 })).toThrow(/invalid key/);
    expect(() => set(ref(db), { a: 1 })).toThrow(/root/);
    expect(fake.calls).toEqual([]);
  });
});
