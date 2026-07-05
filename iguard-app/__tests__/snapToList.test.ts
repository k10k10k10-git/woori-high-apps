import { describe, it, expect } from "vitest";
import { snapToList } from "@/lib/snapToList";
import type { DataSnapshot } from "firebase/database";

// DataSnapshot 최소 모의(mock) — snapToList가 사용하는 exists()/val()만 구현
function mockSnap(value: unknown, exists = true): DataSnapshot {
  return {
    exists: () => exists,
    val: () => value,
  } as unknown as DataSnapshot;
}

describe("snapToList", () => {
  it("returns empty array when snapshot does not exist", () => {
    const result = snapToList(mockSnap(null, false));
    expect(result).toEqual([]);
  });

  it("returns empty array when val() is null", () => {
    const result = snapToList(mockSnap(null, true));
    expect(result).toEqual([]);
  });

  it("returns empty array when val() is an array (not object map)", () => {
    const result = snapToList(mockSnap(["a", "b"], true));
    expect(result).toEqual([]);
  });

  it("returns empty array when val() is a primitive", () => {
    expect(snapToList(mockSnap("hello", true))).toEqual([]);
    expect(snapToList(mockSnap(42, true))).toEqual([]);
    expect(snapToList(mockSnap(true, true))).toEqual([]);
  });

  it("converts valid object map to typed list with id injected", () => {
    const snap = mockSnap({
      abc: { name: "Alice", age: 20 },
      def: { name: "Bob", age: 22 },
    });
    const result = snapToList<{ id: string; name: string; age: number }>(snap);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ id: "abc", name: "Alice", age: 20 });
    expect(result[1]).toEqual({ id: "def", name: "Bob", age: 22 });
  });

  it("skips entries where value is not an object", () => {
    const snap = mockSnap({
      good: { name: "Valid" },
      bad1: "string value",
      bad2: null,
      bad3: 42,
      bad4: true,
      bad5: [1, 2],
    });
    const result = snapToList<{ id: string; name?: string }>(snap);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ id: "good", name: "Valid" });
  });

  it("handles empty object map (returns empty array)", () => {
    const result = snapToList(mockSnap({}));
    expect(result).toEqual([]);
  });

  it("preserves nested data in entries", () => {
    const snap = mockSnap({
      k1: { title: "Test", nested: { x: 1, y: 2 } },
    });
    const result = snapToList<{ id: string; title: string; nested: { x: number; y: number } }>(snap);
    expect(result[0].nested).toEqual({ x: 1, y: 2 });
  });
});
