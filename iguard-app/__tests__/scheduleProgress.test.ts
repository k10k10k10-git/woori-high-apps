import { describe, expect, it } from "vitest";
import { actualStartForBlock, effectiveBlockTime, effectiveTimeRangeLabel, progressCurrentBlock } from "../src/lib/scheduleProgress";
import { IguardScheduleBlock } from "../src/lib/types";

const block = (value: Partial<IguardScheduleBlock> & Pick<IguardScheduleBlock, "id" | "start">): IguardScheduleBlock => ({
  day: 1,
  label: value.id,
  ...value,
});

describe("field progress timeline", () => {
  it("uses the most recently marked block rather than planned clock order", () => {
    const olderLaterBlock = block({ id: "later", day: 2, start: "10:00", actualStart: "10:30", actualStartAt: 100 });
    const newlySelectedEarlierBlock = block({ id: "earlier", day: 1, start: "09:00", actualStart: "09:40", actualStartAt: 200 });
    expect(progressCurrentBlock([olderLaterBlock, newlySelectedEarlierBlock])?.id).toBe("earlier");
  });

  it("shifts the current and all following display times by the anchor delay", () => {
    const anchor = block({ id: "anchor", start: "09:00", end: "10:00", actualStart: "09:30", actualStartAt: 1 });
    const next = block({ id: "next", start: "10:10", end: "11:00" });
    const previous = block({ id: "previous", start: "08:00", end: "08:30" });
    expect(effectiveTimeRangeLabel(anchor, anchor)).toBe("09:30~10:30");
    expect(effectiveTimeRangeLabel(next, anchor)).toBe("10:40~11:30");
    expect(effectiveBlockTime(previous, anchor)).toMatchObject({ start: "08:00", end: "08:30", shifted: false });
  });

  it("records a midnight clock as 24-hour-plus for an overnight block", () => {
    expect(actualStartForBlock(block({ id: "night", start: "24:30" }), "00:45")).toBe("24:45");
    expect(actualStartForBlock(block({ id: "morning", start: "09:00" }), "09:15")).toBe("09:15");
  });
});
