import { describe, it, expect } from "vitest";
import { isPresentOnDay, normalizePartialAttendanceMap } from "@/lib/partialAttendance";

describe("isPresentOnDay", () => {
  it("본대(undefined)는 모든 일차에 참석한다", () => {
    expect(isPresentOnDay(undefined, 1)).toBe(true);
    expect(isPresentOnDay(undefined, 2)).toBe(true);
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

  it("선복귀·후발대는 중간 2일차에 참석한다", () => {
    expect(isPresentOnDay("선복귀", 2)).toBe(true);
    expect(isPresentOnDay("후발대", 2)).toBe(true);
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

describe("당일참석 (2026-07-18 신규 타입)", () => {
  it("기록된 일차에만 현장에 있고, 다른 일차엔 없다", () => {
    expect(isPresentOnDay({ type: "당일참석", day: 1 }, 1)).toBe(true);
    expect(isPresentOnDay({ type: "당일참석", day: 1 }, 3)).toBe(false);
    expect(isPresentOnDay({ type: "당일참석", day: 2 }, 1)).toBe(false);
    expect(isPresentOnDay({ type: "당일참석", day: 2 }, 2)).toBe(true);
    expect(isPresentOnDay({ type: "당일참석", day: 2 }, 3)).toBe(false);
    expect(isPresentOnDay({ type: "당일참석", day: 3 }, 3)).toBe(true);
  });

  it("일차 미기록 당일참석은 불참 취급(안전측)", () => {
    expect(isPresentOnDay({ type: "당일참석" }, 1)).toBe(false);
    expect(isPresentOnDay("당일참석", 3)).toBe(false);
  });

  it("normalize가 당일참석 type과 day를 통과시킨다", () => {
    expect(normalizePartialAttendanceMap({
      d2: { type: "당일참석", day: 2, note: "토 저녁부터", updatedAt: 5 },
    })).toEqual({
      d2: { type: "당일참석", day: 2, note: "토 저녁부터", updatedAt: 5 },
    });
  });
});
