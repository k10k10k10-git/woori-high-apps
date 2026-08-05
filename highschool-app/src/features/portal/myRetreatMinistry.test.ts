import { describe, expect, it } from "vitest";
import type {
  Group,
  IguardMovement,
  IguardPost,
  IguardScheduleBlock,
  IguardSegment,
  TeacherAttendance,
} from "@/features/iguard/lib/types";
import { buildMyRetreatMinistry } from "./myRetreatMinistry";

const teachers: TeacherAttendance[] = [
  { id: "staff-kim", name: "김성훈", bu: "스탭", classKey: "", status: "전참" },
  { id: "staff-lee", name: "이채희", bu: "스탭", classKey: "", status: "전참" },
];
const groups: Group[] = [
  { id: "g1", name: "1조", bu: "1부", teachers: [], leader: "", studentIds: [], staff: "이채희sf" },
  { id: "g2", name: "12조", bu: "2부", teachers: [], leader: "", studentIds: [] },
];
const schedule: IguardScheduleBlock[] = [
  { id: "b2", day: 2, start: "18:00", label: "저녁식사", owner: "물 배부: 김성훈sf" },
  { id: "b1", day: 1, start: "19:30", label: "저녁 집회", owner: "서약서 준비: 김성훈sf, 이채희sf" },
];
const segments: IguardSegment[] = [
  { id: "s1", blockId: "b1", order: 0, label: "전체" },
];
const movements: IguardMovement[] = [
  { id: "m1", segmentId: "s1", blockId: "b1", postId: "p1", staffId: "staff-kim" },
  { id: "m2", segmentId: "s1", blockId: "b1", postId: "p1", staffId: "staff-lee" },
];
const posts: IguardPost[] = [{ id: "p1", name: "서약서 및 볼펜 준비", area: "수련회장" }];

describe("buildMyRetreatMinistry", () => {
  it("계정 이름을 조스탭·큐싯 역할·동선에 같은 기준으로 연결한다", () => {
    const result = buildMyRetreatMinistry({
      teachers,
      groups,
      groupStaff: { g2: ["staff-kim"] },
      schedule,
      segments,
      movements,
      posts,
      preferredNames: ["김성훈"],
    });

    expect(result.matchedStaffId).toBe("staff-kim");
    expect(result.groups).toEqual([{ id: "g2", name: "12조", bu: "2부" }]);
    expect(result.duties).toEqual([
      {
        blockId: "b1",
        day: 1,
        start: "19:30",
        scheduleLabel: "저녁 집회",
        roles: ["서약서 준비"],
        posts: ["[수련회장] 서약서 및 볼펜 준비"],
      },
      {
        blockId: "b2",
        day: 2,
        start: "18:00",
        scheduleLabel: "저녁식사",
        roles: ["물 배부"],
        posts: [],
      },
    ]);
  });

  it("불참 스탭이나 정확히 연결되지 않는 이름은 배정 결과를 만들지 않는다", () => {
    const result = buildMyRetreatMinistry({
      teachers: [{ ...teachers[0], status: "불참" }],
      groups,
      groupStaff: { g2: ["staff-kim"] },
      schedule,
      segments,
      movements,
      posts,
      preferredNames: ["김성훈"],
    });

    expect(result).toEqual({ matchedStaffId: null, matchedName: null, groups: [], duties: [] });
  });
});
