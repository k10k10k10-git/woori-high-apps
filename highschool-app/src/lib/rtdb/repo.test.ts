import { afterEach, describe, expect, it, vi } from "vitest";
import { createDatabase, type RtdbDatabase } from "./database";
import {
  child, endAt, equalTo, get, limitToLast, onChildAdded, onChildChanged, onChildRemoved, onValue, orderByChild, push,
  query, ref, remove, runTransaction, serverTimestamp, set, startAt, update, type DataSnapshot,
} from "./index";
import { FakeSupabase } from "./testing/fakeSupabase";

const NOW = 1_800_000_000_000;
const databases: RtdbDatabase[] = [];

function setup(initial?: unknown) {
  const fake = new FakeSupabase(initial);
  const db = createDatabase({
    client: () => fake,
    realtime: true,
    watchEnvironment: false,
    refreshDelayMs: 0,
    retryDelayMs: () => 5,
    now: () => NOW,
  });
  databases.push(db);
  return { fake, db };
}

afterEach(() => {
  databases.splice(0).forEach((db) => db._repo.dispose());
});

const tick = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms));

/** onValue 로 받은 값을 차례로 모은다. */
function watch(db: RtdbDatabase, path: string) {
  const values: unknown[] = [];
  const errors: Error[] = [];
  const unsubscribe = onValue(ref(db, path), (snapshot) => values.push(snapshot.val()), (error) => errors.push(error));
  return { values, errors, unsubscribe };
}

describe("구독: 처음 읽기와 캐시", () => {
  it("한 경로는 rtdb_get, 같은 순간 여러 뿌리는 rtdb_get_many 한 번으로 읽는다", async () => {
    const { fake, db } = setup({ a: { x: 1 }, b: { y: 2 }, c: 3 });
    const a = watch(db, "a");
    const b = watch(db, "b");
    await vi.waitFor(() => expect(b.values).toEqual([{ y: 2 }]));
    expect(a.values).toEqual([{ x: 1 }]);
    expect(fake.callsOf("rtdb_get")).toHaveLength(0);
    expect(fake.callsOf("rtdb_get_many").map((call) => call.args.p_paths)).toEqual([["a", "b"]]);
    const c = watch(db, "c");
    await vi.waitFor(() => expect(c.values).toEqual([3]));
    expect(fake.callsOf("rtdb_get").map((call) => call.args.p_path)).toEqual(["c"]);
  });

  it("이미 읽은 위치 아래 구독은 서버에 다시 묻지 않는다", async () => {
    const { fake, db } = setup({ a: { x: { deep: 1 } } });
    const parent = watch(db, "a");
    await vi.waitFor(() => expect(parent.values).toHaveLength(1));
    const deep = watch(db, "a/x/deep");
    await vi.waitFor(() => expect(deep.values).toEqual([1]));
    expect(fake.calls).toHaveLength(1);
    expect((await get(ref(db, "a/x"))).val()).toEqual({ deep: 1 });
    expect(fake.calls).toHaveLength(1);
  });

  it("읽기가 거부되면 Firebase 처럼 cancel 콜백에 PERMISSION_DENIED 를 주고 구독을 끝낸다", async () => {
    const { fake, db } = setup({ secret: { k: 1 }, open: { k: 2 } });
    fake.denyRead = (path) => path === "secret";
    const secret = watch(db, "secret");
    const opened = watch(db, "open");
    await vi.waitFor(() => expect(secret.errors).toHaveLength(1));
    expect(secret.values).toEqual([]);
    expect((secret.errors[0] as Error & { code: string }).code).toBe("PERMISSION_DENIED");
    expect(secret.errors[0].message).toMatch(/^permission_denied at \/secret: /);
    await vi.waitFor(() => expect(opened.values).toEqual([{ k: 2 }]));
  });

  it("상위 구독이 거부돼도 따로 읽을 수 있는 하위 구독은 계속 받는다", async () => {
    const { fake, db } = setup({ a: { mine: 1, other: 2 } });
    fake.denyRead = (path) => path === "a";
    const parent = watch(db, "a");
    const mine = watch(db, "a/mine");
    await vi.waitFor(() => expect(parent.errors).toHaveLength(1));
    await vi.waitFor(() => expect(mine.values).toEqual([1]));
  });

  it("구독을 끝내면 캐시를 버리고, 다시 구독하면 새로 읽는다", async () => {
    const { fake, db } = setup({ a: 1 });
    const first = watch(db, "a");
    await vi.waitFor(() => expect(first.values).toEqual([1]));
    first.unsubscribe();
    fake.data = { a: 2 };
    const second = watch(db, "a");
    await vi.waitFor(() => expect(second.values).toEqual([2]));
    expect(fake.callsOf("rtdb_get")).toHaveLength(2);
  });
});

describe("쓰기: 즉시 반영·되돌림·대기열", () => {
  it("set 은 콜백을 바로 부르고(서버 응답 전), 서버 확인 뒤에도 값이 깜빡이지 않는다", async () => {
    const { fake, db } = setup({ a: { n: 1 } });
    const a = watch(db, "a");
    await vi.waitFor(() => expect(a.values).toEqual([{ n: 1 }]));
    fake.hold();
    let resolved = false;
    const writing = set(ref(db, "a/n"), 2).then(() => { resolved = true; });
    expect(a.values).toEqual([{ n: 1 }, { n: 2 }]);
    await tick();
    expect(resolved).toBe(false);
    fake.release();
    await writing;
    expect(fake.value("a/n")).toBe(2);
    await vi.waitFor(() => expect(fake.callsOf("rtdb_get").length).toBeGreaterThanOrEqual(1));
    await tick(20);
    expect(a.values).toEqual([{ n: 1 }, { n: 2 }]);
  });

  it("거부되면 로컬 반영을 되돌리고 PERMISSION_DENIED 로 실패한다(검증 실패도 같다)", async () => {
    const { fake, db } = setup({ a: { n: 1 } });
    const a = watch(db, "a");
    await vi.waitFor(() => expect(a.values).toHaveLength(1));
    fake.denyWrite = (path) => path === "a/n";
    const denied = await set(ref(db, "a/n"), 5).catch((error: Error & { code: string }) => error);
    expect(denied).toMatchObject({ code: "PERMISSION_DENIED", message: "PERMISSION_DENIED: Permission denied" });
    expect(a.values).toEqual([{ n: 1 }, { n: 5 }, { n: 1 }]);
    fake.denyWrite = () => false;
    fake.invalidWrite = (path) => path === "a/n";
    const invalid = await update(ref(db, "a"), { n: "x" }).catch((error: Error & { code: string }) => error);
    expect(invalid).toMatchObject({ code: "PERMISSION_DENIED" });
    expect(a.values.at(-1)).toEqual({ n: 1 });
  });

  it("끊긴 동안 쓰기는 화면에 바로 보이고 메모리에 쌓였다가, 다시 연결되면 순서대로 보낸다", async () => {
    const { fake, db } = setup({ a: { n: 1, m: 1, gone: true } });
    fake.setRealtimeStatus("SUBSCRIBED");
    const a = watch(db, "a");
    await vi.waitFor(() => expect(a.values).toHaveLength(1));
    fake.online = false;
    const order: string[] = [];
    const writes = [
      set(ref(db, "a/n"), 2).then(() => order.push("set")),
      update(ref(db, "a"), { m: 3, "deep/x": 1 }).then(() => order.push("update")),
      remove(ref(db, "a/gone")).then(() => order.push("remove")),
    ];
    expect(a.values.at(-1)).toEqual({ n: 2, m: 3, deep: { x: 1 } });
    await tick(30);
    expect(order).toEqual([]);
    expect(db._repo._pendingWrites).toBe(3);
    // 첫 쓰기만 계속 다시 시도한다 — 뒤 쓰기가 앞지르지 않는다.
    expect(new Set(fake.callsOf("rtdb_update").map((call) => JSON.stringify(call.args.p_patch)))).toEqual(new Set(['{"a/n":2}']));
    fake.online = true;
    fake.setRealtimeStatus("SUBSCRIBED");
    await Promise.all(writes);
    expect(order).toEqual(["set", "update", "remove"]);
    const sent = fake.callsOf("rtdb_update").map((call) => call.args.p_patch);
    expect(sent.slice(-3)).toEqual([{ "a/n": 2 }, { "a/m": 3, "a/deep/x": 1 }, { "a/gone": null }]);
    expect(fake.value("a")).toEqual({ n: 2, m: 3, deep: { x: 1 } });
    await tick(20);
    expect(a.values.at(-1)).toEqual({ n: 2, m: 3, deep: { x: 1 } });
  });

  it("serverTimestamp 는 화면에 바로 지금 시각, 서버에는 .sv 로 가고 확정값으로 바뀐다", async () => {
    const { fake, db } = setup({ a: {} });
    const a = watch(db, "a");
    await vi.waitFor(() => expect(a.values).toEqual([null]));
    await set(ref(db, "a/at"), serverTimestamp());
    expect(a.values[1]).toEqual({ at: NOW });
    expect(fake.callsOf("rtdb_update")[0].args.p_patch).toEqual({ "a/at": { ".sv": "timestamp" } });
    await vi.waitFor(() => expect(a.values.at(-1)).toEqual({ at: fake.serverNow }));
  });

  it("update 는 루트 기준 경로 한 번에 보내고, 잘못된 값은 Firebase 처럼 바로 예외", async () => {
    const { fake, db } = setup();
    await update(ref(db), { "x/a": 1, "y/b": [1, 2] });
    expect(fake.callsOf("rtdb_update")[0].args.p_patch).toEqual({ "x/a": 1, "y/b": { 0: 1, 1: 2 } });
    expect(() => update(ref(db), { "x/a": undefined })).toThrow(/contains undefined/);
    expect(() => update(ref(db), { x: 1, "x/a": 2 })).toThrow(/ancestor/);
    expect(() => set(ref(db, "x"), { "bad.key": 1 })).toThrow(/invalid key/);
    expect(() => set(ref(db, ".info/connected"), true)).toThrow(/\.info/);
    expect(() => ref(db, "a#b")).toThrow(/invalid path/);
    await expect(update(ref(db), {})).resolves.toBeUndefined();
    expect(fake.callsOf("rtdb_update")).toHaveLength(1);
  });

  it("push 는 20자 시간순 키를 만들고, 값이 있으면 저장한다", async () => {
    const { fake, db } = setup();
    const empty = push(ref(db, "list"));
    expect(empty.key).toMatch(/^[-0-9A-Za-z_]{20}$/);
    expect(fake.calls).toHaveLength(0);
    const saved = push(ref(db, "list"), { v: 1 });
    expect(saved.key > empty.key).toBe(true);
    const resolved = await saved;
    expect(resolved.key).toBe(saved.key);
    expect(fake.value(`list/${saved.key}`)).toEqual({ v: 1 });
    expect(child(ref(db, "list"), saved.key).parent?.key).toBe("list");
  });
});

describe("Realtime 변경 알림", () => {
  it("겹치는 구독만 다시 읽고, 뿌리 아래 변경은 그 경로만 읽어 끼운다", async () => {
    const { fake, db } = setup({ a: { x: 1, y: 1 }, b: { z: 1 } });
    fake.setRealtimeStatus("SUBSCRIBED");
    const a = watch(db, "a");
    const b = watch(db, "b");
    await vi.waitFor(() => expect(b.values).toHaveLength(1));
    const before = fake.calls.length;
    fake.externalWrite({ "a/x": 2 });
    await vi.waitFor(() => expect(a.values.at(-1)).toEqual({ x: 2, y: 1 }));
    expect(fake.calls.slice(before).map((call) => [call.fn, call.args.p_path ?? call.args.p_paths])).toEqual([["rtdb_get", "a/x"]]);
    expect(b.values).toEqual([{ z: 1 }]);
  });

  it("짧은 사이 여러 변경은 한 번의 rtdb_get_many 로 묶고, 뿌리 위 변경은 뿌리를 읽는다", async () => {
    const { fake, db } = setup({ a: { x: 1 }, b: { z: 1 }, c: 1 });
    fake.setRealtimeStatus("SUBSCRIBED");
    const a = watch(db, "a");
    const b = watch(db, "b/z");
    const c = watch(db, "c");
    await vi.waitFor(() => expect(c.values).toHaveLength(1));
    fake.autoNotify = false;
    fake.externalWrite({ "a/x": 5 });
    fake.externalWrite({ b: { z: 9 } });
    const before = fake.calls.length;
    fake.emitChange(["a/x"]);
    fake.emitChange(["b"]);
    await vi.waitFor(() => expect(b.values.at(-1)).toBe(9));
    expect(a.values.at(-1)).toEqual({ x: 5 });
    const after = fake.calls.slice(before);
    expect(after).toHaveLength(1);
    expect(after[0]).toMatchObject({ fn: "rtdb_get_many" });
    expect(new Set(after[0].args.p_paths as string[])).toEqual(new Set(["a/x", "b/z"]));
    expect(c.values).toEqual([1]);
  });

  it("내 쓰기는 확인용으로 한 번만 다시 읽는다(같은 변경 알림으로 또 읽지 않음)", async () => {
    const { fake, db } = setup({ a: { n: 1 } });
    fake.setRealtimeStatus("SUBSCRIBED");
    const a = watch(db, "a");
    await vi.waitFor(() => expect(a.values).toHaveLength(1));
    const before = fake.callsOf("rtdb_get").length + fake.callsOf("rtdb_get_many").length;
    await set(ref(db, "a/n"), 2);
    await tick(30);
    const reads = fake.callsOf("rtdb_get").length + fake.callsOf("rtdb_get_many").length - before;
    expect(reads).toBe(1);
    expect(a.values).toEqual([{ n: 1 }, { n: 2 }]);
  });

  it("다시 연결되면(SUBSCRIBED) 놓친 변경을 위해 모든 뿌리를 다시 읽는다", async () => {
    const { fake, db } = setup({ a: 1, b: 1 });
    fake.setRealtimeStatus("SUBSCRIBED");
    const a = watch(db, "a");
    const b = watch(db, "b");
    await vi.waitFor(() => expect(b.values).toHaveLength(1));
    fake.setRealtimeStatus("CHANNEL_ERROR");
    fake.autoNotify = false;
    fake.externalWrite({ a: 2, b: 3 });
    await tick(10);
    expect(a.values).toEqual([1]);
    fake.setRealtimeStatus("SUBSCRIBED");
    await vi.waitFor(() => expect(b.values).toEqual([1, 3]));
    expect(a.values).toEqual([1, 2]);
  });
});

describe("query 구독", () => {
  it("limitToLast 창은 클라이언트가 거르고, 바뀌면 다시 거른다", async () => {
    const { fake, db } = setup({ log: { a: { t: 1 }, b: { t: 3 }, c: { t: 2 } } });
    fake.setRealtimeStatus("SUBSCRIBED");
    const values: unknown[] = [];
    const keys: string[][] = [];
    onValue(query(ref(db, "log"), orderByChild("t"), limitToLast(2)), (snapshot) => {
      values.push(snapshot.val());
      const order: string[] = [];
      snapshot.forEach((item) => { order.push(item.key); });
      keys.push(order);
    });
    await vi.waitFor(() => expect(keys).toEqual([["c", "b"]]));
    fake.externalWrite({ "log/d": { t: 9 } });
    await vi.waitFor(() => expect(keys.at(-1)).toEqual(["b", "d"]));
    expect(values.at(-1)).toEqual({ b: { t: 3 }, d: { t: 9 } });
  });

  it("get(query) 는 위치 전체를 읽어 거른다", async () => {
    const { fake, db } = setup({ p: { r1: { s: "k1" }, r2: { s: "k2" }, r3: { s: "k1" } } });
    const snapshot = await get(query(ref(db, "p"), orderByChild("s"), equalTo("k1")));
    expect(snapshot.val()).toEqual({ r1: { s: "k1" }, r3: { s: "k1" } });
    expect(fake.callsOf("rtdb_get")[0].args).toEqual({ p_path: "p" });
    const ranged = await get(query(ref(db, "p"), orderByChild("s"), startAt("k2"), endAt("k9")));
    expect(Object.keys(ranged.val() as object)).toEqual(["r2"]);
  });
});

describe("runTransaction", () => {
  it("rtdb_get_hashed → 콜백 → rtdb_cas, 충돌하면 서버 값으로 다시 부른다", async () => {
    const { fake, db } = setup({ counter: 1 });
    fake.casConflicts = 1;
    fake.casConflictValue = 5;
    const seen: unknown[] = [];
    const result = await runTransaction(ref(db, "counter"), (current: number | null) => {
      seen.push(current);
      return (current ?? 0) + 1;
    });
    expect(seen).toEqual([1, 5]);
    expect(result.committed).toBe(true);
    expect(result.snapshot.val()).toBe(6);
    expect(fake.value("counter")).toBe(6);
    expect(fake.calls.map((call) => call.fn)).toEqual(["rtdb_get_hashed", "rtdb_cas", "rtdb_cas"]);
  });

  it("콜백이 undefined 면 쓰지 않고 committed=false", async () => {
    const { fake, db } = setup({ x: { a: 1 } });
    const result = await runTransaction(ref(db, "x"), () => undefined);
    expect(result.committed).toBe(false);
    expect(result.snapshot.val()).toEqual({ a: 1 });
    expect(fake.callsOf("rtdb_cas")).toHaveLength(0);
  });

  it("25번 넘게 충돌하면 maxretry, 거부되면 permission_denied 로 실패한다", async () => {
    const { fake, db } = setup({ x: 1 });
    fake.casConflicts = 100;
    await expect(runTransaction(ref(db, "x"), (value: number) => value + 1)).rejects.toThrow("maxretry");
    expect(fake.callsOf("rtdb_cas")).toHaveLength(25);
    fake.casConflicts = 0;
    fake.denyWrite = () => true;
    await expect(runTransaction(ref(db, "x"), (value: number) => value + 1)).rejects.toMatchObject({ code: "PERMISSION_DENIED", message: "permission_denied" });
  });

  it("로컬에 바로 반영하고, 앞서 쌓인 쓰기를 먼저 보낸 뒤 실행한다", async () => {
    const { fake, db } = setup({ c: { n: 0 } });
    fake.setRealtimeStatus("SUBSCRIBED");
    const c = watch(db, "c");
    await vi.waitFor(() => expect(c.values).toHaveLength(1));
    fake.online = false;
    const write = set(ref(db, "c/n"), 10);
    const transaction = runTransaction(ref(db, "c/n"), (value: number | null) => (value ?? 0) + 1);
    await tick(20);
    fake.online = true;
    fake.setRealtimeStatus("SUBSCRIBED");
    await write;
    const result = await transaction;
    expect(result.snapshot.val()).toBe(11);
    const order = fake.calls.filter((call) => call.fn !== "rtdb_get" && call.fn !== "rtdb_get_many").map((call) => call.fn);
    expect(order.lastIndexOf("rtdb_update")).toBeLessThan(order.indexOf("rtdb_get_hashed"));
    await vi.waitFor(() => expect(c.values.at(-1)).toEqual({ n: 11 }));
  });
});

describe("onChildAdded / onChildChanged / onChildRemoved", () => {
  it("처음엔 자식마다 child_added(이전 키 포함), 이후엔 값 차이로 추가·변경·삭제를 낸다", async () => {
    const { fake, db } = setup({ list: { b: 2, a: 1 } });
    fake.setRealtimeStatus("SUBSCRIBED");
    const events: Array<[string, string | null, unknown, (string | null)?]> = [];
    const target = ref(db, "list");
    const record = (type: string) => (snapshot: DataSnapshot, previous?: string | null) => {
      events.push(type === "removed" ? [type, snapshot.key, snapshot.val()] : [type, snapshot.key, snapshot.val(), previous]);
    };
    onChildAdded(target, record("added"));
    onChildChanged(target, record("changed"));
    onChildRemoved(target, record("removed"));
    // 사람 검색 화면처럼 같은 위치의 onlyOnce value 는 child 이벤트 뒤에 온다.
    onValue(target, () => events.push(["value", null, null]), { onlyOnce: true });
    await vi.waitFor(() => expect(events).toHaveLength(3));
    expect(events).toEqual([["added", "a", 1, null], ["added", "b", 2, "a"], ["value", null, null]]);
    events.length = 0;
    fake.externalWrite({ "list/c": 3, "list/a": 10, "list/b": null });
    await vi.waitFor(() => expect(events).toHaveLength(3));
    expect(events).toEqual([["removed", "b", 2], ["added", "c", 3, "a"], ["changed", "a", 10, null]]);
  });

  it("로컬 쓰기도 child 이벤트를 즉시 낸다", async () => {
    const { db } = setup({ list: { a: 1 } });
    const added: string[] = [];
    onChildAdded(ref(db, "list"), (snapshot) => { added.push(snapshot.key!); });
    await vi.waitFor(() => expect(added).toEqual(["a"]));
    void set(ref(db, "list/z"), 1);
    expect(added).toEqual(["a", "z"]);
  });
});

describe(".info/connected", () => {
  it("Realtime 연결 상태를 따르고, 쓰기가 끊김으로 실패하면 false 가 된다", async () => {
    const { fake, db } = setup({ a: 1 });
    const states: unknown[] = [];
    onValue(ref(db, ".info/connected"), (snapshot) => states.push(snapshot.val()));
    await vi.waitFor(() => expect(states).toEqual([false]));
    fake.setRealtimeStatus("SUBSCRIBED");
    expect(states).toEqual([false, true]);
    fake.setRealtimeStatus("CHANNEL_ERROR");
    fake.setRealtimeStatus("SUBSCRIBED");
    expect(states).toEqual([false, true, false, true]);
    fake.online = false;
    const pending = set(ref(db, "a"), 2);
    await vi.waitFor(() => expect(states.at(-1)).toBe(false));
    fake.online = true;
    await pending;
    expect(states.at(-1)).toBe(true);
    expect((await get(ref(db, ".info/connected"))).val()).toBe(true);
  });
});

describe("get()", () => {
  it("거부는 message 'Permission denied'·code PERMISSION_DENIED, 계속 끊기면 'Client is offline.'", async () => {
    const { fake, db } = setup({ a: 1 });
    fake.denyRead = () => true;
    await expect(get(ref(db, "a"))).rejects.toMatchObject({ message: "Permission denied", code: "PERMISSION_DENIED" });
    fake.denyRead = () => false;
    fake.online = false;
    await expect(get(ref(db, "a"))).rejects.toThrow("Client is offline.");
    expect(fake.callsOf("rtdb_get").length).toBe(4);
    fake.online = true;
    expect((await get(ref(db, "a"))).val()).toBe(1);
  });

  it("아직 서버에 안 간 내 쓰기는 get 결과에도 보인다", async () => {
    const { fake, db } = setup({ a: { n: 1, m: 1 } });
    fake.hold();
    const writing = set(ref(db, "a/n"), 2);
    const reading = get(ref(db, "a"));
    await vi.waitFor(() => expect(fake.heldCount).toBe(2));
    fake.releaseOnly("rtdb_get");
    expect((await reading).val()).toEqual({ n: 2, m: 1 });
    expect(fake.value("a/n")).toBe(1);
    fake.release();
    await writing;
  });
});

describe("오류·경계", () => {
  it("거부된 쓰기는 대기열을 막지 않고 다음 쓰기가 이어서 간다", async () => {
    const { fake, db } = setup({ a: 1, b: 1 });
    fake.denyWrite = (path) => path === "a";
    const results = await Promise.allSettled([set(ref(db, "a"), 2), set(ref(db, "b"), 2)]);
    expect(results.map((result) => result.status)).toEqual(["rejected", "fulfilled"]);
    expect(fake.value()).toEqual({ a: 1, b: 2 });
  });

  it("서버 함수 오류로 처음 읽기에 실패하면 무한 대기 대신 cancel 콜백을 부른다", async () => {
    const { fake, db } = setup({ a: 1 });
    fake.brokenFunctions.add("rtdb_get");
    const a = watch(db, "a");
    await vi.waitFor(() => expect(a.errors).toHaveLength(1));
    expect(a.errors[0]).toMatchObject({ code: "UNKNOWN_ERROR" });
  });

  it("한 뿌리 아래 바뀐 경로가 많으면 조각 대신 뿌리를 한 번 읽는다", async () => {
    const { fake, db } = setup({ big: { k0: 0 } });
    fake.setRealtimeStatus("SUBSCRIBED");
    const big = watch(db, "big");
    await vi.waitFor(() => expect(big.values).toHaveLength(1));
    fake.autoNotify = false;
    const patch = Object.fromEntries(Array.from({ length: 25 }, (_, index) => [`big/k${index}`, index + 1]));
    fake.externalWrite(patch);
    const before = fake.calls.length;
    fake.emitChange(Object.keys(patch));
    await vi.waitFor(() => expect((big.values.at(-1) as Record<string, number>).k24).toBe(25));
    expect(fake.calls.slice(before).map((call) => [call.fn, call.args.p_path])).toEqual([["rtdb_get", "big"]]);
  });

  it("일괄 저장처럼 깊은 경로가 많으면 뿌리 전체가 아니라 공통 상위 경로만 읽는다", async () => {
    const { fake, db } = setup({ retreats: { r1: { name: "여름", participants: { p0: { n: 0 } } }, r2: { name: "겨울" } } });
    fake.setRealtimeStatus("SUBSCRIBED");
    const all = watch(db, "retreats");
    await vi.waitFor(() => expect(all.values).toHaveLength(1));
    fake.autoNotify = false;
    const patch = Object.fromEntries(Array.from({ length: 40 }, (_, index) => [`retreats/r1/participants/p${index}/n`, index]));
    fake.externalWrite(patch);
    const before = fake.calls.length;
    fake.emitChange(Object.keys(patch));
    await vi.waitFor(() => expect((all.values.at(-1) as { r1: { participants: Record<string, unknown> } }).r1.participants.p39).toEqual({ n: 39 }));
    expect(fake.calls.slice(before).map((call) => [call.fn, call.args.p_path])).toEqual([["rtdb_get", "retreats/r1/participants"]]);
  });

  it("경로가 없는 변경 알림이면 구독 중인 뿌리를 모두 다시 읽는다", async () => {
    const { fake, db } = setup({ a: 1, b: 1 });
    fake.setRealtimeStatus("SUBSCRIBED");
    const a = watch(db, "a");
    const b = watch(db, "b");
    await vi.waitFor(() => expect(b.values).toHaveLength(1));
    fake.autoNotify = false;
    fake.externalWrite({ a: 2, b: 2 });
    fake.emitChange(null);
    await vi.waitFor(() => expect([a.values.at(-1), b.values.at(-1)]).toEqual([2, 2]));
  });
});

describe("로그아웃·설정 오류", () => {
  it("함수 실행 자체가 거부되면(로그아웃) 여러 구독을 모두 cancel 하고, 쓰기는 PERMISSION_DENIED", async () => {
    const { fake, db } = setup({ a: 1, b: 1 });
    fake.signedOut = true;
    const a = watch(db, "a");
    const b = watch(db, "b");
    await vi.waitFor(() => expect([a.errors.length, b.errors.length]).toEqual([1, 1]));
    expect(fake.callsOf("rtdb_get_many")).toHaveLength(1);
    await expect(set(ref(db, "a"), 2)).rejects.toMatchObject({ code: "PERMISSION_DENIED" });
  });

  it("Supabase 클라이언트를 만들 수 없으면(환경 변수 없음) 기다리지 않고 오류로 끝난다", async () => {
    const db = createDatabase({ client: () => { throw new Error("Supabase 공개 환경 변수가 없습니다"); }, realtime: true, watchEnvironment: true });
    databases.push(db);
    const errors: Error[] = [];
    onValue(ref(db, "a"), () => undefined, (error) => errors.push(error));
    await expect(set(ref(db, "a"), 1)).rejects.toMatchObject({ code: "UNKNOWN_ERROR" });
    await expect(get(ref(db, "a"))).rejects.toMatchObject({ code: "UNKNOWN_ERROR" });
    await vi.waitFor(() => expect(errors).toHaveLength(1));
  });
});
