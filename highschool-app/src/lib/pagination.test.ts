import { describe, expect, it } from "vitest";
import { clampPage, pageCount, pageSlice } from "./pagination";

describe("목록 페이지 처리", () => {
  it("빈 목록도 1페이지로 유지한다", () => {
    expect(pageCount(0, 40)).toBe(1);
    expect(clampPage(9, 0, 40)).toBe(1);
  });

  it("범위를 벗어난 페이지를 마지막 페이지로 보정한다", () => {
    expect(pageCount(91, 40)).toBe(3);
    expect(clampPage(7, 91, 40)).toBe(3);
    expect(pageSlice(Array.from({ length: 91 }, (_, index) => index), 7, 40)).toEqual(
      Array.from({ length: 11 }, (_, index) => index + 80),
    );
  });
});
