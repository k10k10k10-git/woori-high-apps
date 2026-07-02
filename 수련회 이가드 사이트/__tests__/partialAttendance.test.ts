import { describe, it, expect } from "vitest";
import { isPresentOnDay } from "@/lib/partialAttendance";

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
