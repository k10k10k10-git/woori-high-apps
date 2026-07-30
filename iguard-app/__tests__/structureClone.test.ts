import { describe, expect, it } from "vitest";
import { buildStructureClonePayload, occupiedCloneNodes } from "../src/lib/structureClone";

describe("structure-only retreat clone", () => {
  it("copies reusable structure and removes people, free notes, and group assignments", () => {
    const payload = buildStructureClonePayload({
      schedule: {
        oldBlock: {
          day: 1, start: "09:00", end: "10:00", label: "등록", detail: "공통 안내",
          owner: "담당자", notice: "비밀 메모", leaderNote: "조장 메모", note: "제작 메모",
        },
      },
      segments: {
        oldSegment: { blockId: "oldBlock", order: 0, label: "입장", zone: "위", note: "복제 금지" },
      },
      posts: { oldPost: { name: "입구", area: "본관" } },
      movements: {
        staffMove: {
          blockId: "oldBlock", segmentId: "oldSegment", postId: "oldPost",
          staffId: "staff-1", note: "사람 메모", detail: "1층",
        },
        actorMove: {
          blockId: "oldBlock", segmentId: "oldSegment", postId: "oldPost",
          actor: "행정팀", slot: 1,
        },
      },
      seating: {
        oldSeat: { label: "집회", day: 1, order: 0, zones: [{ name: "앞열", groupIds: ["group-1"] }] },
      },
      meals: {
        oldMeal: { label: "저녁", day: 1, slot: 2, entries: [{ groupId: "group-1", seq: 0 }] },
      },
      guide: ["가이드"],
    }, (node, oldId) => `new-${node}-${oldId}`);

    expect(payload["schedule/new-schedule-oldBlock"]).toEqual({
      day: 1, start: "09:00", end: "10:00", label: "등록", detail: "공통 안내", source: "cloned",
    });
    expect(payload["segments/new-segments-oldSegment"]).not.toHaveProperty("note");
    expect(payload["seating/new-seating-oldSeat"]).toMatchObject({ zones: [{ name: "앞열", groupIds: [] }] });
    expect(payload["meals/new-meals-oldMeal"]).toMatchObject({ entries: [] });
    expect(Object.values(payload).some(value => JSON.stringify(value).includes("staff-1"))).toBe(false);
    expect(Object.values(payload).some(value => JSON.stringify(value).includes("행정팀"))).toBe(true);
    expect(Object.values(payload).some(value => JSON.stringify(value).includes("사람 메모"))).toBe(false);
    expect(Object.keys(payload).some(path => path.startsWith("buses/") || path.startsWith("gbs/"))).toBe(false);
  });

  it("detects any existing target structure node before cloning", () => {
    expect(occupiedCloneNodes({ schedule: { one: {} }, guide: [] })).toEqual(["schedule"]);
    expect(occupiedCloneNodes({ buses: { bus: {} }, gbs: { group: {} } })).toEqual([]);
    expect(occupiedCloneNodes(null)).toEqual([]);
  });
});
