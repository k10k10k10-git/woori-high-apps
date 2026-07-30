import { describe, expect, it } from "vitest";
import { buildStaffAssignmentStats } from "@/lib/staffAssignmentStats";
import type { AssignedIguardMovement, IguardStaff } from "@/lib/types";

const staff: IguardStaff[] = [
  { id: "s1", name: "김가나" },
  { id: "s2", name: "박다라" },
  { id: "s3", name: "이마바" },
];

const movements: AssignedIguardMovement[] = [
  { id: "m1", blockId: "b1", postId: "p1", staffId: "s1" },
  { id: "m2", blockId: "b1", postId: "p2", staffId: "s1" },
  { id: "m3", blockId: "b2", postId: "p3", staffId: "s1" },
  { id: "m4", blockId: "b1", postId: "p1", staffId: "s2" },
];

describe("스탭별 동선 배정 횟수", () => {
  it("임의 과부하 기준 없이 실제 동선 수와 일정 수를 집계한다", () => {
    expect(buildStaffAssignmentStats(staff, movements)).toEqual([
      { staffId: "s1", name: "김가나", movementCount: 3, blockCount: 2 },
      { staffId: "s2", name: "박다라", movementCount: 1, blockCount: 1 },
      { staffId: "s3", name: "이마바", movementCount: 0, blockCount: 0 },
    ]);
  });
});
