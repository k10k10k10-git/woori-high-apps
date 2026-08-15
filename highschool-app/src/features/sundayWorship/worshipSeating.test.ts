import { describe, expect, it } from "vitest";
import type { Milestone } from "@/lib/types";
import {
  assignedKeys,
  classKeysForService,
  defaultSections,
  isWorshipMilestone,
  parseSeatingPlans,
  planKey,
  previousSunday,
  resizeSection,
  resizeSections,
  seatingRecordId,
  seatingRecords,
  seatLabel,
  sundayOf,
  totalSeated,
  type SeatSection,
} from "./worshipSeating";

const milestone = (over: Partial<Milestone>): Milestone => ({
  id: "m", title: "t", targetDate: "2099-12-31", done: false, ...over,
});

describe("주일 자리 배치 격자", () => {
  it("분단 개수와 줄 수를 바꿔도 기존 배정을 유지한다", () => {
    const section: SeatSection = {
      id: "s1", label: "1분단",
      cells: [{ key: "1-1-5", count: 2 }, { key: "1-3-1", count: 2 }, null],
    };
    expect(resizeSection(section, 5).cells).toHaveLength(5);
    expect(resizeSection(section, 5).cells[0]).toEqual({ key: "1-1-5", count: 2 });
    // 줄이면 뒤에서 잘린다
    expect(resizeSection(section, 2).cells).toHaveLength(2);
    expect(resizeSection(section, 2).cells[1]).toEqual({ key: "1-3-1", count: 2 });
  });

  it("분단을 늘리면 빈 분단이 붙고 줄이면 뒤에서 잘린다", () => {
    const sections = defaultSections(3, 4);
    expect(resizeSections(sections, 5, 4)).toHaveLength(5);
    expect(resizeSections(sections, 5, 4)[4].cells).toHaveLength(4);
    expect(resizeSections(sections, 2, 4)).toHaveLength(2);
  });

  it("이미 배정된 반을 알려 같은 반이 두 자리에 놓이지 않게 한다", () => {
    const sections: SeatSection[] = [
      { id: "s1", label: "1분단", cells: [{ key: "1-1-5", count: 2 }, null] },
      { id: "s2", label: "2분단", cells: [{ key: "1-3-1", count: 3 }] },
    ];
    expect(assignedKeys(sections)).toEqual(new Set(["1-1-5", "1-3-1"]));
    expect(totalSeated(sections)).toBe(5);
  });

  it("반 라벨은 학년-반으로 읽고 고정석은 이름을 그대로 쓴다", () => {
    expect(seatLabel("1-3-11")).toBe("3학년 11반");
    expect(seatLabel("fixed:new-friend")).toBe("새친구");
  });

  it("그 부에 속한 반만 학년·반 순서로 고른다", () => {
    const keys = ["2-1-1", "1-3-2", "1-1-9", "1-1-10", "2-2-4"];
    expect(classKeysForService(keys, "1")).toEqual(["1-1-9", "1-1-10", "1-3-2"]);
    expect(classKeysForService(keys, "2")).toEqual(["2-1-1", "2-2-4"]);
  });
});

describe("주일 날짜", () => {
  it("그 주의 주일을 KST로 계산한다", () => {
    // 2026-08-15는 토요일 → 그 주 주일은 8/9
    expect(sundayOf(new Date("2026-08-15T12:00:00Z"))).toBe("2026-08-09");
    expect(sundayOf(new Date("2026-08-16T12:00:00Z"))).toBe("2026-08-16");
  });

  it("지난주 주일은 7일 전이다", () => {
    expect(previousSunday("2026-08-16")).toBe("2026-08-09");
    expect(previousSunday("2026-01-04")).toBe("2025-12-28");
  });
});

describe("저장 인코딩", () => {
  const sections: SeatSection[] = [
    { id: "s1", label: "1분단", cells: [{ key: "1-1-5", count: 2 }, null, { key: "fixed:new-friend", count: 2 }] },
    { id: "s2", label: "2분단", cells: [{ key: "1-3-1", count: 3 }] },
  ];

  it("분단 하나가 레코드 하나가 되고 id가 결정적이다", () => {
    const records = seatingRecords("2026-08-16", "1", sections, 2);
    expect(records.map((r) => r.id)).toEqual(["ws_20260816_1_01", "ws_20260816_1_02"]);
    expect(seatingRecordId("2026-08-16", "2", 0)).toBe("ws_20260816_2_01");
  });

  it("분단이 줄면 남은 레코드를 지우도록 null을 낸다", () => {
    const records = seatingRecords("2026-08-16", "1", sections, 4);
    expect(records).toHaveLength(4);
    expect(records[2].value).toBeNull();
    expect(records[3].value).toBeNull();
  });

  it("저장한 배치를 그대로 되읽는다", () => {
    const records = seatingRecords("2026-08-16", "1", sections, 2);
    const plans = parseSeatingPlans(
      records.map((r, i) => milestone({ id: r.id, ...(r.value as object), title: `t${i}` })),
    );
    expect(plans[planKey("2026-08-16", "1")]).toEqual(sections);
  });

  it("주차와 부가 다르면 서로 섞이지 않는다", () => {
    const first = seatingRecords("2026-08-16", "1", sections, 2);
    const second = seatingRecords("2026-08-16", "2", [sections[0]], 1);
    const plans = parseSeatingPlans(
      [...first, ...second].map((r) => milestone({ id: r.id, ...(r.value as object) })),
    );
    expect(plans[planKey("2026-08-16", "1")]).toHaveLength(2);
    expect(plans[planKey("2026-08-16", "2")]).toHaveLength(1);
  });

  it("한 분단이 저장 한도를 넘으면 저장 전에 막는다", () => {
    const huge: SeatSection = {
      id: "s1", label: "1분단",
      cells: Array.from({ length: 40 }, () => ({ key: "1-11-11", count: 22 })),
    };
    expect(() => seatingRecords("2026-08-16", "1", [huge], 1)).toThrow(/줄 수를 줄여/);
  });

  it("다른 화면의 일정 조각은 배치로 읽지 않는다", () => {
    const plans = parseSeatingPlans([
      milestone({ id: "a", sourceSite: "move-guide", note: "그냥 메모" }),
      milestone({ id: "b", sourceSite: "ministry-guide-month", note: '{"month":3}' }),
      milestone({ id: "c", sourceSite: "sunday-worship-seating", note: "깨진 JSON {" }),
    ]);
    expect(plans).toEqual({});
  });

  it("자리 배치 조각을 일정 목록에서 걸러낼 수 있다", () => {
    expect(isWorshipMilestone({ sourceSite: "sunday-worship-seating" })).toBe(true);
    expect(isWorshipMilestone({ sourceSite: "move-guide" })).toBe(false);
    expect(isWorshipMilestone({ sourceSite: undefined })).toBe(false);
  });
});
