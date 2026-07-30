import { describe, expect, it } from "vitest";
import { buildScheduleAssignmentSummary } from "../src/lib/scheduleSheet";
import type { IguardMovement, IguardPost, IguardSegment, IguardStaff } from "../src/lib/types";

const segments: IguardSegment[] = [
  { id: "s2", blockId: "b1", order: 1, label: "퇴식" },
  { id: "s1", blockId: "b1", order: 0, label: "입장" },
];
const posts: IguardPost[] = [
  { id: "p1", area: "교회", name: "1층 입구" },
  { id: "p2", name: "퇴식구" },
];
const staff: IguardStaff[] = [
  { id: "u1", name: "박세원" },
  { id: "u2", name: "김우진" },
];

describe("시트형 큐싯 담당·동선 요약", () => {
  it("구간 순서와 포스트별로 담당자를 묶는다", () => {
    const movements: IguardMovement[] = [
      { id: "m3", blockId: "b1", segmentId: "s2", postId: "p2", staffId: null, actor: "행정팀" },
      { id: "m2", blockId: "b1", segmentId: "s1", postId: "p1", staffId: "u2", round: "후밥" },
      { id: "m1", blockId: "b1", segmentId: "s1", postId: "p1", staffId: "u1" },
      { id: "other", blockId: "b2", segmentId: "s1", postId: "p1", staffId: "u1" },
    ];

    expect(buildScheduleAssignmentSummary("b1", segments, movements, staff, posts)).toEqual([
      {
        segmentId: "s1",
        segmentLabel: "입장",
        postId: "p1",
        postLabel: "[교회] 1층 입구",
        assignees: ["김우진 (후밥)", "박세원"],
      },
      {
        segmentId: "s2",
        segmentLabel: "퇴식",
        postId: "p2",
        postLabel: "퇴식구",
        assignees: ["행정팀"],
      },
    ]);
  });

  it("명단 불일치와 담당 미정도 숨기지 않는다", () => {
    const movements: IguardMovement[] = [
      { id: "m1", blockId: "b1", segmentId: "s1", postId: "p1", staffId: "missing" },
      { id: "m2", blockId: "b1", segmentId: "s1", postId: "p1", staffId: null, slot: 1 },
    ];

    expect(buildScheduleAssignmentSummary("b1", segments, movements, staff, posts)[0].assignees)
      .toEqual(["명단 없음", "담당 미정"]);
  });
});
