import { describe, expect, it } from "vitest";
import { parseAssignedAreas, roomMatchesAssignedAreas } from "@/lib/assignedArea";
import { badgeCardsHtml, buildBadgeCard, type BadgeCardInput } from "@/lib/badgeCard";
import type { Room } from "@/lib/types";

const room = (overrides: Partial<Room> = {}): Room => ({
  id: "room-1",
  dong: "C동",
  roomNumber: "301",
  capacity: 3,
  type: "여",
  studentIds: ["student-1"],
  ...overrides,
});

describe("담당 구역 파싱", () => {
  it("건물과 여러 층을 구조화하고 원문이 모호하면 추정하지 않는다", () => {
    expect(parseAssignedAreas("C동 3,4층")).toEqual([{ building: "C동", floors: [3, 4] }]);
    expect(parseAssignedAreas("2층+별관")).toEqual([
      { building: null, floors: [2] },
      { building: "별관", floors: [] },
    ]);
    expect(parseAssignedAreas("남자 숙소")).toBeNull();
  });

  it("건물·층이 모두 일치하는 호실만 담당 구역에 포함한다", () => {
    const areas = parseAssignedAreas("C동 3,4층");
    expect(roomMatchesAssignedAreas(room(), areas)).toBe(true);
    expect(roomMatchesAssignedAreas(room({ roomNumber: "201" }), areas)).toBe(false);
    expect(roomMatchesAssignedAreas(room({ dong: "A동" }), areas)).toBe(false);
  });
});

describe("명찰카드 파생과 인쇄 안전", () => {
  const input: BadgeCardInput = {
    staff: [{ id: "staff-1", name: "박혜원sf" }],
    groups: [{
      id: "group-1", name: "1조", bu: "1부", teachers: [], leader: "",
      studentIds: ["student-1"],
    }],
    groupStaff: { "group-1": ["staff-1"] },
    gbs: { "group-1": { groupId: "group-1", place: "분임실 131호" } },
    buses: [{
      id: "bus-1", busNo: 2, day: 1, groupIds: ["group-1"],
      staff: "선탑/동승: 박혜원sf, 김동연sf",
    }],
    meals: [{
      id: "meal-1", label: "1일차 저녁", day: 1, slot: 2,
      entries: [{ groupId: "group-1", seq: 0 }],
    }],
    seating: [{
      id: "seat-1", label: "저녁집회", day: 1, order: 0,
      zones: [{ name: "앞열", groupIds: ["group-1"] }],
    }],
    schedule: [{
      id: "block-1", day: 1, start: "19:30", end: "22:30", label: "저녁집회",
    }],
    posts: [{ id: "post-1", name: "강당 입구", area: "본관" }],
    movements: [{
      id: "movement-1", blockId: "block-1", segmentId: "segment-1",
      postId: "post-1", staffId: "staff-1", detail: "C동 3층",
    }],
    rooms: [room()],
    students: {
      "student-1": {
        id: "student-1", name: "홍<script>alert(1)</script>", num: 1,
        grade: 1, class: 1, buNum: 1,
      },
    },
    partial: {},
    cellColors: {},
  };

  it("호차·공통 순서·GBS·자리·담당 호실 학생을 한 카드로 만든다", () => {
    const card = buildBadgeCard("staff-1", input);
    expect(card).not.toBeNull();
    expect(card?.buses[0]).toMatchObject({
      day: 1,
      busNo: 2,
      groups: ["1조"],
      companions: ["김동연"],
    });
    expect(card?.meals[0].groups).toEqual(["1조"]);
    expect(card?.gbs[0]).toEqual({ place: "분임실 131호", groups: ["1조"] });
    expect(card?.seating[0].zones).toEqual(["앞열: 1조"]);
    expect(card?.seating[0].zoneGroups).toEqual([["1조"]]);
    expect(card?.timeline).toEqual([{
      day: 1,
      time: "19:30~22:30",
      label: "저녁집회",
      assignments: ["[본관] 강당 입구"],
    }]);
    expect(card?.assignedRooms).toEqual([{
      label: "C동 301호",
      studentNames: ["홍<script>alert(1)</script>"],
    }]);
  });

  it("인쇄 HTML의 수련회명·스탭명·학생명을 모두 이스케이프한다", () => {
    const card = buildBadgeCard("staff-1", {
      ...input,
      staff: [{ id: "staff-1", name: "<img src=x onerror=alert(1)>" }],
      buses: [],
    });
    expect(card).not.toBeNull();
    const html = badgeCardsHtml([card!], "<script>retreat</script>", 2026);
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<img src=x");
    expect(html).toContain("&lt;script&gt;retreat&lt;/script&gt;");
    expect(html).toContain("전체 일정");
    expect(html).toContain("[본관] 강당 입구");
    expect(html).not.toContain("담당 호실");
    expect(html).not.toContain("특정 학생");
    expect(html).toContain("height:277mm");
    expect(html).toContain("page-break-after:always");
  });

  it("개인 일정에서는 다른 스탭 이름 목록을 숨기고 담당 역할만 남긴다", () => {
    const card = buildBadgeCard("staff-1", {
      ...input,
      staff: [
        { id: "staff-1", name: "박혜원sf" },
        { id: "staff-2", name: "김동연sf" },
      ],
      posts: [{ id: "post-1", name: "숙소 총장: 박혜원sf, 김동연sf", area: "수련회장" }],
    });
    expect(card?.timeline[0].assignments).toEqual(["[수련회장] 숙소 총장"]);
    expect(card?.timeline[0].assignments.join(" ")).not.toContain("김동연");
  });
});
