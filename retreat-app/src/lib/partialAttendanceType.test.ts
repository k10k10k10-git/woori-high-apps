import { describe, expect, it } from "vitest";
import { isDayAttendanceOn, isPartialAttendanceType, PARTIAL_ATTENDANCE_TYPES } from "./partialAttendanceType";

describe("부분참 유형", () => {
  it("선복귀·후발대·당일참석을 모두 지원한다", () => {
    expect(PARTIAL_ATTENDANCE_TYPES).toEqual(["선복귀", "후발대", "당일참석"]);
    expect(isPartialAttendanceType("선복귀")).toBe(true);
    expect(isPartialAttendanceType("후발대")).toBe(true);
    expect(isPartialAttendanceType("당일참석")).toBe(true);
  });

  it("알 수 없는 값은 제외한다", () => {
    expect(isPartialAttendanceType("미지정")).toBe(false);
    expect(isPartialAttendanceType(undefined)).toBe(false);
  });

  it("당일참석은 지정한 일차에만 참석으로 판정한다", () => {
    const record = { id: "1_student", type: "당일참석" as const, day: 2 as const };
    expect(isDayAttendanceOn(record, 1)).toBe(false);
    expect(isDayAttendanceOn(record, 2)).toBe(true);
    expect(isDayAttendanceOn(record, 3)).toBe(false);
  });
});
