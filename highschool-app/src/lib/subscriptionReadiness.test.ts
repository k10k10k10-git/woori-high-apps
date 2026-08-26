import { describe, expect, it, vi } from "vitest";
import { createSubscriptionReadinessGate } from "./subscriptionReadiness";

describe("createSubscriptionReadinessGate", () => {
  it("모든 구독의 첫 응답 뒤 한 번만 준비 완료를 알린다", () => {
    const onReady = vi.fn();
    const gate = createSubscriptionReadinessGate(["meta", "list", "attendance"], onReady);

    gate.markReady("list");
    gate.markReady("meta");
    expect(onReady).not.toHaveBeenCalled();
    expect(gate.pendingKeys()).toEqual(["attendance"]);

    gate.markReady("attendance");
    gate.markReady("attendance");
    expect(onReady).toHaveBeenCalledTimes(1);
  });

  it("기다릴 구독이 없으면 즉시 준비 완료한다", () => {
    const onReady = vi.fn();
    createSubscriptionReadinessGate([], onReady);
    expect(onReady).toHaveBeenCalledTimes(1);
  });
});
