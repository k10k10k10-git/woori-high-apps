import { describe, expect, it } from "vitest";
import { endAt, endBefore, equalTo, limitToFirst, limitToLast, orderByChild, orderByKey, orderByValue, query, startAfter, startAt, type QueryConstraint } from "./index";
import { applyQuery, orderedKeys } from "./queryParams";
import { QueryImpl, ReferenceImpl } from "./reference";
import { normalize } from "./tree";

const repo = { url: "rtdb:" };
const base = new ReferenceImpl(repo, "events");
function keys(value: unknown, ...constraints: QueryConstraint[]): string[] {
  const built = query(base, ...constraints) as QueryImpl;
  return orderedKeys(applyQuery(normalize(value), built._params), built._params.index);
}

const events = {
  e1: { at: 30, kind: "b" },
  e2: { at: 10, kind: "a" },
  e3: { at: 20, kind: "a" },
  e4: { kind: "c" },
  e5: { at: "문자", kind: "a" },
  e6: { at: 20, kind: "z" },
  e7: { at: true },
};

describe("클라이언트 query 거르기(Firebase 순서)", () => {
  it("orderByChild 는 없음 < true < 숫자 < 문자열 순서이고 같으면 키 순서", () => {
    expect(keys(events, orderByChild("at"))).toEqual(["e4", "e7", "e2", "e3", "e6", "e1", "e5"]);
  });

  it("startAt·endAt 은 경계를 포함하고 equalTo 는 같은 값만", () => {
    expect(keys(events, orderByChild("at"), startAt(20), endAt(30))).toEqual(["e3", "e6", "e1"]);
    expect(keys(events, orderByChild("at"), equalTo(20))).toEqual(["e3", "e6"]);
    expect(keys(events, orderByChild("kind"), equalTo("a"))).toEqual(["e2", "e3", "e5"]);
  });

  it("키를 함께 주면 같은 값 안에서 키로 경계를 정한다(startAfter·endBefore 는 제외)", () => {
    expect(keys(events, orderByChild("at"), startAt(20, "e6"))).toEqual(["e6", "e1", "e5"]);
    expect(keys(events, orderByChild("at"), startAfter(20, "e3"))).toEqual(["e6", "e1", "e5"]);
    expect(keys(events, orderByChild("at"), startAfter(20))).toEqual(["e1", "e5"]);
    expect(keys(events, orderByChild("at"), endBefore(20, "e6"))).toEqual(["e4", "e7", "e2", "e3"]);
    expect(keys(events, orderByChild("at"), endBefore(20))).toEqual(["e4", "e7", "e2"]);
  });

  it("limitToFirst·limitToLast 는 거른 뒤 앞·뒤 n 개", () => {
    expect(keys(events, orderByChild("at"), limitToFirst(2))).toEqual(["e4", "e7"]);
    expect(keys(events, orderByChild("at"), startAt(10), endAt(30), limitToLast(2))).toEqual(["e6", "e1"]);
  });

  it("활동 로그 쪽 넘기기 query(startAt + endBefore(값, 키) + limitToLast)", () => {
    const log = { a1: { occurredAt: 100 }, a2: { occurredAt: 200 }, a3: { occurredAt: 200 }, a4: { occurredAt: 300 }, a5: { occurredAt: 50 } };
    expect(keys(log, orderByChild("occurredAt"), startAt(100), endBefore(200, "a3"), limitToLast(10))).toEqual(["a1", "a2"]);
    expect(keys(log, orderByChild("occurredAt"), startAt(100), endAt(300), limitToLast(2))).toEqual(["a3", "a4"]);
  });

  it("orderByKey·orderByValue", () => {
    expect(keys({ b: 1, a: 2, 10: 3, 9: 4 }, orderByKey(), startAt("9"), endAt("a"))).toEqual(["9", "10", "a"]);
    expect(keys({ x: 3, y: 1, z: 2 }, orderByValue(), limitToFirst(2))).toEqual(["y", "z"]);
  });

  it("정렬만 있는 query 는 값을 그대로 두고, 맞는 게 없으면 null", () => {
    const built = query(base, orderByChild("at")) as QueryImpl;
    const node = normalize(events);
    expect(applyQuery(node, built._params)).toBe(node);
    const none = query(base, orderByChild("at"), equalTo(999)) as QueryImpl;
    expect(applyQuery(node, none._params)).toBeNull();
  });

  it("Firebase 처럼 잘못 섞은 조건은 바로 예외", () => {
    expect(() => query(base, orderByChild("a"), orderByKey())).toThrow(/multiple orderBy/);
    expect(() => query(base, startAt(1), equalTo(2))).toThrow(/Starting point was already set/);
    expect(() => query(base, limitToFirst(1), limitToLast(1))).toThrow(/Limit was already set/);
    expect(() => limitToFirst(0)).toThrow(/positive integer/);
    expect(() => orderByChild("$key")).toThrow(/orderByKey/);
  });

  it("같은 조건의 query 는 같다고 본다", () => {
    const a = query(base, orderByChild("at"), limitToLast(1));
    const b = query(new ReferenceImpl(repo, "events"), orderByChild("at"), limitToLast(1));
    expect(a.isEqual(b)).toBe(true);
    expect(a.isEqual(query(base, orderByChild("at"), limitToLast(2)))).toBe(false);
    expect(a.ref.isEqual(base)).toBe(true);
  });
});
