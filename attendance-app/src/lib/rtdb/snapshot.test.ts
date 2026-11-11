import { describe, expect, it } from "vitest";
import { compareKeys, nodeToValue, sortedKeys } from "./ordering";
import { ReferenceImpl } from "./reference";
import { DataSnapshot } from "./snapshot";
import { normalize } from "./tree";

const repo = { url: "https://example.test/rtdb" };
const snap = (value: unknown, path = "a") => new DataSnapshot(normalize(value), new ReferenceImpl(repo, path));

describe("Firebase 배열 변환 규칙", () => {
  it("키가 모두 0 이상 정수이고 최댓값 < 2×개수면 배열로 바꾼다", () => {
    expect(snap({ 0: "a", 1: "b", 2: "c" }).val()).toEqual(["a", "b", "c"]);
    // 3개 중 최댓값 4 < 6 → 배열, 빈 자리는 구멍
    const sparse = snap({ 0: "a", 2: "c", 4: "e" }).val() as unknown[];
    expect(Array.isArray(sparse)).toBe(true);
    expect(sparse.length).toBe(5);
    expect(1 in sparse).toBe(false);
    expect(sparse[4]).toBe("e");
  });

  it("너무 듬성하거나 정수가 아닌 키가 섞이면 객체로 둔다", () => {
    expect(snap({ 0: "a", 5: "f" }).val()).toEqual({ 0: "a", 5: "f" });
    expect(snap({ 0: "a", x: "b" }).val()).toEqual({ 0: "a", x: "b" });
    expect(snap({ "01": "a", 1: "b" }).val()).toEqual({ "01": "a", 1: "b" });
    expect(snap({ "-1": "a", 0: "b" }).val()).toEqual({ "-1": "a", 0: "b" });
  });

  it("쓸 때 준 배열은 인덱스 키로 펼쳐 저장되고 null 항목은 사라진다", () => {
    expect(normalize(["a", null, "c"])).toEqual({ 0: "a", 2: "c" });
    expect(normalize({ list: [], empty: {}, keep: 1 })).toEqual({ keep: 1 });
    expect(snap(["a", null, "c"]).val()).toEqual(["a", undefined, "c"]);
  });

  it("exportVal·toJSON 은 배열로 바꾸지 않는다", () => {
    expect(snap(["x", "y"]).exportVal()).toEqual({ 0: "x", 1: "y" });
    expect(snap(["x", "y"]).toJSON()).toEqual({ 0: "x", 1: "y" });
  });

  it("val() 은 매번 새 객체라 호출자가 고쳐도 다음 값이 오염되지 않는다", () => {
    const snapshot = snap({ a: { b: 1 } });
    (snapshot.val() as { a: { b: number } }).a.b = 99;
    expect(snapshot.val()).toEqual({ a: { b: 1 } });
  });
});

describe("Firebase 키 순서", () => {
  it("32비트 정수 키 오름차순 → 문자열 사전순", () => {
    const keys = ["b", "10", "a", "2", "-5", "1", "A", "2147483648", "0"];
    expect([...keys].sort(compareKeys)).toEqual(["-5", "0", "1", "2", "10", "2147483648", "A", "a", "b"]);
  });

  it("forEach 와 val() 의 키 순서가 같고 true 를 돌려주면 멈춘다", () => {
    const value = { b: 1, 10: 2, a: 3, 2: 4 };
    const seen: string[] = [];
    const stopped = snap(value).forEach((child) => {
      seen.push(child.key);
      return child.key === "a";
    });
    expect(seen).toEqual(["2", "10", "a"]);
    expect(stopped).toBe(true);
    expect(Object.keys(nodeToValue(normalize(value)) as object)).toEqual(["2", "10", "a", "b"]);
    expect(sortedKeys(normalize(value))).toEqual(["2", "10", "a", "b"]);
  });
});

describe("DataSnapshot 도구", () => {
  it("child·exists·hasChild·hasChildren·numChildren·size·key·ref·priority", () => {
    const snapshot = snap({ x: { y: 1 }, z: true }, "root/node");
    expect(snapshot.key).toBe("node");
    expect(snapshot.ref.toString()).toBe("https://example.test/rtdb/root/node");
    expect(snapshot.priority).toBeNull();
    expect(snapshot.exists()).toBe(true);
    expect(snapshot.hasChildren()).toBe(true);
    expect(snapshot.numChildren()).toBe(2);
    expect(snapshot.size).toBe(2);
    expect(snapshot.hasChild("x/y")).toBe(true);
    expect(snapshot.hasChild("x/q")).toBe(false);
    const child = snapshot.child("x/y");
    expect(child.val()).toBe(1);
    expect(child.key).toBe("y");
    expect(child.ref.parent?.key).toBe("x");
    expect(snapshot.child("missing").exists()).toBe(false);
    expect(snapshot.child("missing").val()).toBeNull();
    expect(snap(null).exists()).toBe(false);
    expect(snap("leaf").hasChildren()).toBe(false);
    expect(snap("leaf").forEach(() => true)).toBe(false);
  });
});
