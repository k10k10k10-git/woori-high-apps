import { describe, it, expect } from "vitest";
import { busCapacityOf, isValidBusCapacity, DEFAULT_BUS_CAPACITY } from "@/lib/busCapacity";

describe("busCapacityOf", () => {
  it("capacity가 없는 기존 버스는 45인승으로 간주한다 (하위호환)", () => {
    expect(busCapacityOf({})).toBe(DEFAULT_BUS_CAPACITY);
    expect(busCapacityOf(undefined)).toBe(DEFAULT_BUS_CAPACITY);
    expect(busCapacityOf(null)).toBe(DEFAULT_BUS_CAPACITY);
  });

  it("정상 범위 capacity는 그대로 쓴다", () => {
    expect(busCapacityOf({ capacity: 28 })).toBe(28);
    expect(busCapacityOf({ capacity: 45 })).toBe(45);
  });

  it("비정상 값(0·음수·범위 밖·NaN)은 기본값으로 흡수한다", () => {
    expect(busCapacityOf({ capacity: 0 })).toBe(DEFAULT_BUS_CAPACITY);
    expect(busCapacityOf({ capacity: -5 })).toBe(DEFAULT_BUS_CAPACITY);
    expect(busCapacityOf({ capacity: 500 })).toBe(DEFAULT_BUS_CAPACITY);
    expect(busCapacityOf({ capacity: NaN })).toBe(DEFAULT_BUS_CAPACITY);
  });
});

describe("isValidBusCapacity", () => {
  it("4~99 정수만 허용한다", () => {
    expect(isValidBusCapacity(45)).toBe(true);
    expect(isValidBusCapacity(28)).toBe(true);
    expect(isValidBusCapacity(3)).toBe(false);
    expect(isValidBusCapacity(100)).toBe(false);
    expect(isValidBusCapacity(44.5)).toBe(false);
  });
});
