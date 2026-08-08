import { describe, it, expect } from "vitest";
import { buildRetreatRemovalUpdates } from "./retreatRemoval";

describe("buildRetreatRemovalUpdates", () => {
  it("공개 노드와 민감정보 노드를 함께 지운다", () => {
    expect(buildRetreatRemovalUpdates("-OnzAiq")).toEqual({
      "retreats/-OnzAiq": null,
      "retreatsPrivate/-OnzAiq": null,
    });
  });

  it("retreatsPrivate가 반드시 포함된다 — 빠지면 민감정보가 고아로 남는다", () => {
    const updates = buildRetreatRemovalUpdates("abc");
    expect(Object.keys(updates)).toContain("retreatsPrivate/abc");
  });
});
