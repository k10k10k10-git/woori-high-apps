import { describe, expect, it } from "vitest";
import { applyRealtimeRecordChild } from "./realtimeRecord";

describe("실시간 루트 child 병합", () => {
  it("변경된 child만 교체하고 나머지 연도 데이터는 보존한다", () => {
    const current = { 2025: { value: "old" }, 2026: { value: "before" } };
    const next = applyRealtimeRecordChild(current, "2026", { value: "after" });

    expect(next).toEqual({ 2025: { value: "old" }, 2026: { value: "after" } });
    expect(current).toEqual({ 2025: { value: "old" }, 2026: { value: "before" } });
  });

  it("삭제 이벤트는 해당 child만 제거한다", () => {
    expect(applyRealtimeRecordChild({ a: 1, b: 2 }, "a", undefined, true)).toEqual({ b: 2 });
  });
});
