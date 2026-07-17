import { describe, it, expect } from "vitest";
import { isPresentOnDay, normalizePartialAttendanceMap } from "@/lib/partialAttendance";

describe("isPresentOnDay", () => {
  it("본대(undefined) is present on both days", () => {
    expect(isPresentOnDay(undefined, 1)).toBe(true);
    expect(isPresentOnDay(undefined, 3)).toBe(true);
  });

  it("선복귀 is present on day 1, absent on day 3", () => {
    expect(isPresentOnDay("선복귀", 1)).toBe(true);
    expect(isPresentOnDay("선복귀", 3)).toBe(false);
  });

  it("후발대 is absent on day 1, present on day 3", () => {
    expect(isPresentOnDay("후발대", 1)).toBe(false);
    expect(isPresentOnDay("후발대", 3)).toBe(true);
  });
});

describe("normalizePartialAttendanceMap", () => {
  it("객체형 note를 보존하고 과거 문자열형도 흡수한다", () => {
    expect(normalizePartialAttendanceMap({
      dayOnly: { type: "선복귀", note: "25일 당일참여", updatedAt: 123 },
      legacy: "후발대",
      invalid: { type: "본대", note: "제외" },
    })).toEqual({
      dayOnly: { type: "선복귀", note: "25일 당일참여", updatedAt: 123 },
      legacy: { type: "후발대" },
    });
  });
});
