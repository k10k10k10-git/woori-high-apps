import { describe, it, expect } from "vitest";
import { LATE_REGISTRANT_COLORS } from "./constants";

describe("LATE_REGISTRANT_COLORS", () => {
  it("includes the late-registrant colors", () => {
    expect(LATE_REGISTRANT_COLORS.has("blue")).toBe(true);
    expect(LATE_REGISTRANT_COLORS.has("green")).toBe(true);
    expect(LATE_REGISTRANT_COLORS.has("purple")).toBe(true);
    expect(LATE_REGISTRANT_COLORS.has("orange")).toBe(true);
  });

  it("excludes red (used for cancellations)", () => {
    expect(LATE_REGISTRANT_COLORS.has("red")).toBe(false);
  });
});
