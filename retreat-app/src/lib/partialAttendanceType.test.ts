import { describe, expect, it } from "vitest";
import { isPartialAttendanceType, PARTIAL_ATTENDANCE_TYPES } from "./partialAttendanceType";

describe("partialAttendanceType", () => {
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
});
