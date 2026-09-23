import { describe, expect, it } from "vitest";
import type { Milestone } from "@/lib/types";
import {
  assignedKeys,
  attendanceAverage,
  blockStartRow,
  classKeysForService,
  defaultSections,
  isFrontBlock,
  isOverCapacity,
  isWorshipMilestone,
  parseSeatingPlans,
  planKey,
  previousSunday,
  recentAttendedSundays,
  recentSundays,
  remainingRows,
  resizeSections,
  rowsForAverage,
  seatingRecordId,
  seatingRecords,
  seatLabel,
  sundayCellKey,
  sundayOf,
  usedRows,
  worshipSeatingSource,
  type ClassAttendance,
  type SeatSection,
} from "./worshipSeating";

const milestone = (over: Partial<Milestone>): Milestone => ({
  id: "m", title: "t", targetDate: "2099-12-31", done: false, ...over,
});

const section = (over: Partial<SeatSection> = {}): SeatSection => ({
  id: "s1", label: "1분단", totalRows: 6,
  blocks: [{ key: "1-1-5", rows: 2 }, { key: "1-3-1", rows: 1 }],
  ...over,
});

describe("줄 수 계산 - 지난 3주 출석 평균 + 담임 1명", () => {
  const marks = (values: Record<string, string>): Record<string, string> => values;
  const students: ClassAttendance = {
    a: marks({ "7-0": "O", "7-1": "O", "7-2": "O" }),
    b: marks({ "7-0": "O", "7-1": "X", "7-2": "T" }),
    c: marks({ "7-0": "X", "7-1": "X", "7-2": "X" }),
    d: marks({ "7-0": "O", "7-1": "O", "7-2": "O" }),
  };

  it("이전 지각 값 T도 출석으로 세고 결석·미입력은 뺀다", () => {
    // 7-0: a,b,d = 3명 / 7-1: a,d = 2명 / 7-2: a,b(이전 T),d = 3명
    expect(attendanceAverage(students, ["7-0", "7-1", "7-2"])).toBeCloseTo(8 / 3);
  });

  it("한 줄 의자 6개 기준으로 올림한다", () => {
    expect(rowsForAverage(8 / 3)).toBe(1);   // (2.67 + 1) / 6 = 0.61 → 1줄
    expect(rowsForAverage(5)).toBe(1);       // (5 + 1) / 6 = 1 → 1줄
    expect(rowsForAverage(6)).toBe(2);       // (6 + 1) / 6 = 1.17 → 2줄
    expect(rowsForAverage(11)).toBe(2);      // (11 + 1) / 6 = 2 → 2줄
    expect(rowsForAverage(12)).toBe(3);      // (12 + 1) / 6 = 2.17 → 3줄
  });

  it("출석 기록이 없으면 근거가 없으므로 최소 1줄로 둔다", () => {
    expect(attendanceAverage(undefined, ["7-0"])).toBeNull();
    expect(attendanceAverage({ a: {} }, ["7-0"])).toBeNull();
    expect(rowsForAverage(null)).toBe(1);
  });
});

it("예배 자리 배치 자료는 개인 명단·연락처·출석 원본 없이 반별 평균만 돌려준다", () => {
  const result = worshipSeatingSource(
    { "1-1-1": { students: { student: { name: "노출금지", phone: "010-9999-9999" } } }, "2-1-1": {} },
    { "1-1-1": { student: { "7-1": "O", "7-0": "T" } }, "2-1-1": { other: { "7-1": "O" } } },
    "2026-08-16", "1",
  );
  expect(result).toEqual({ classKeys: ["1-1-1"], cellKeys: ["7-1", "7-0"], averageByClass: { "1-1-1": 1 } });
  expect(JSON.stringify(result)).not.toMatch(/노출금지|010-9999-9999|student|"O"|"T"/);
});

describe("평균 기준 주 고르기 - 수련회·방학 주는 건너뛴다", () => {
  // 2026-08-16 기준 직전 주일 → 08-09="7-1", 08-02="7-0", 07-26="6-3", 07-19="6-2", 07-12="6-1"
  const WEEK = "2026-08-16";
  const on = (...cells: string[]): ClassAttendance => ({ s1: Object.fromEntries(cells.map((c) => [c, "O"])) });

  it("부 전체 출석이 0인 주는 빼고 그만큼 더 거슬러 올라간다", () => {
    // 08-09(7-1)이 수련회라 출석부가 통째로 비었다.
    const attendance = { "1-1-1": on("7-0", "6-3", "6-2", "6-1"), "1-1-2": on("7-0", "6-3") };
    expect(recentAttendedSundays(attendance, ["1-1-1", "1-1-2"], WEEK)).toEqual(["7-0", "6-3", "6-2"]);
  });

  it("빈 주가 없으면 그냥 직전 3주다", () => {
    const attendance = { "1-1-1": on("7-1", "7-0", "6-3", "6-2") };
    expect(recentAttendedSundays(attendance, ["1-1-1"], WEEK)).toEqual(["7-1", "7-0", "6-3"]);
  });

  it("한 반만 비어 있는 주는 빼지 않는다 - 그 반 입력 누락일 수 있다", () => {
    // 08-09에 1-1-2만 기록이 없다. 이걸 빼면 그 반 평균만 부풀어 남의 자리를 가져간다.
    const attendance = { "1-1-1": on("7-1", "7-0", "6-3"), "1-1-2": on("7-0", "6-3") };
    expect(recentAttendedSundays(attendance, ["1-1-1", "1-1-2"], WEEK)).toEqual(["7-1", "7-0", "6-3"]);
  });

  it("출석이 3주치가 안 되면 있는 만큼만 준다", () => {
    const attendance = { "1-1-1": on("7-0") };
    expect(recentAttendedSundays(attendance, ["1-1-1"], WEEK)).toEqual(["7-0"]);
  });

  it("기록이 아예 없으면 빈 배열 - 평균 계산 근거가 없다", () => {
    expect(recentAttendedSundays({}, ["1-1-1"], WEEK)).toEqual([]);
    expect(attendanceAverage({ s1: { "7-0": "O" } }, [])).toBeNull();
  });

  it("해가 바뀌면 멈춘다 - 셀 키에 연도가 없어 작년 키와 겹친다", () => {
    // 2026-01-04의 직전 주일은 2025-12-28이다. 작년 "11-3"을 올해 것으로 세면 안 된다.
    const attendance = { "1-1-1": on("11-3", "11-2", "11-1") };
    expect(recentAttendedSundays(attendance, ["1-1-1"], "2026-01-04")).toEqual([]);
  });
});

describe("주일과 출석 셀 키", () => {
  it("그 주의 주일을 KST로 계산한다", () => {
    expect(sundayOf(new Date("2026-08-15T12:00:00Z"))).toBe("2026-08-09");
    expect(sundayOf(new Date("2026-08-16T12:00:00Z"))).toBe("2026-08-16");
  });

  it("지난 3주는 이번 주를 빼고 직전 3개다", () => {
    expect(recentSundays("2026-08-16")).toEqual(["2026-08-09", "2026-08-02", "2026-07-26"]);
    expect(previousSunday("2026-01-04")).toBe("2025-12-28");
  });

  it("출석부와 같은 규칙으로 셀 키를 만든다", () => {
    // 2026-08: 2·9·16·23·30이 주일 → 8월(인덱스 7)의 0,1,2,3,4번째
    expect(sundayCellKey("2026-08-02")).toBe("7-0");
    expect(sundayCellKey("2026-08-16")).toBe("7-2");
    expect(sundayCellKey("2026-08-30")).toBe("7-4");
    expect(sundayCellKey("2026-01-04")).toBe("0-0");
  });
});

describe("격자 - 한 반이 여러 줄을 차지한다", () => {
  it("쓴 줄과 남은 줄을 센다", () => {
    expect(usedRows(section())).toBe(3);
    expect(remainingRows(section())).toBe(3);
    expect(isOverCapacity(section())).toBe(false);
  });

  it("분단 줄 수를 넘으면 초과로 표시한다", () => {
    const over = section({ totalRows: 2 });
    expect(remainingRows(over)).toBe(-1);
    expect(isOverCapacity(over)).toBe(true);
  });

  it("블록이 시작하는 줄을 앞 블록의 줄 수만큼 밀어서 계산한다", () => {
    const s = section({ blocks: [{ key: "a", rows: 2 }, { key: "b", rows: 1 }, { key: "c", rows: 3 }] });
    expect(blockStartRow(s, 0)).toBe(1);
    expect(blockStartRow(s, 1)).toBe(3);
    expect(blockStartRow(s, 2)).toBe(4);
  });

  it("위에서 두 줄과 겹치는 블록만 앞자리다", () => {
    const s = section({ blocks: [{ key: "a", rows: 1 }, { key: "b", rows: 1 }, { key: "c", rows: 2 }] });
    expect(isFrontBlock(s, 0)).toBe(true);   // 1줄에서 시작
    expect(isFrontBlock(s, 1)).toBe(true);   // 2줄에서 시작
    expect(isFrontBlock(s, 2)).toBe(false);  // 3줄에서 시작
  });

  it("두 줄짜리 반 하나가 앞자리를 다 차지할 수 있다", () => {
    const s = section({ blocks: [{ key: "a", rows: 2 }, { key: "b", rows: 1 }] });
    expect(isFrontBlock(s, 0)).toBe(true);
    expect(isFrontBlock(s, 1)).toBe(false);
  });

  it("분단을 늘리면 빈 분단이 붙고 줄이면 뒤에서 잘린다", () => {
    const sections = defaultSections(3, 5);
    expect(resizeSections(sections, 5, 5)).toHaveLength(5);
    expect(resizeSections(sections, 5, 5)[4].totalRows).toBe(5);
    expect(resizeSections(sections, 2, 5)).toHaveLength(2);
  });

  it("이미 배정된 반을 알려 같은 반이 두 자리에 놓이지 않게 한다", () => {
    expect(assignedKeys([section()])).toEqual(new Set(["1-1-5", "1-3-1"]));
  });

  it("반 라벨은 학년-반으로 읽고 고정석은 이름을 그대로 쓴다", () => {
    expect(seatLabel("1-3-11")).toBe("3-11");
    expect(seatLabel("fixed:new-friend")).toBe("새친구");
  });

  it("그 부에 속한 반만 학년·반 순서로 고른다", () => {
    const keys = ["2-1-1", "1-3-2", "1-1-9", "1-1-10", "2-2-4"];
    expect(classKeysForService(keys, "1")).toEqual(["1-1-9", "1-1-10", "1-3-2"]);
    expect(classKeysForService(keys, "2")).toEqual(["2-1-1", "2-2-4"]);
  });
});

describe("저장 인코딩", () => {
  const sections = [
    section(),
    section({ id: "s2", label: "2분단", totalRows: 4, blocks: [{ key: "fixed:new-friend", rows: 1 }] }),
  ];

  it("분단 하나가 레코드 하나가 되고 id가 결정적이다", () => {
    expect(seatingRecords("2026-08-16", "1", sections, 2).map((r) => r.id))
      .toEqual(["ws_20260816_1_01", "ws_20260816_1_02"]);
    expect(seatingRecordId("2026-08-16", "2", 0)).toBe("ws_20260816_2_01");
  });

  it("분단이 줄면 남은 레코드를 지우도록 null을 낸다", () => {
    const records = seatingRecords("2026-08-16", "1", sections, 4);
    expect(records).toHaveLength(4);
    expect(records[2].value).toBeNull();
    expect(records[3].value).toBeNull();
  });

  it("저장한 배치를 줄 수까지 그대로 되읽는다", () => {
    const records = seatingRecords("2026-08-16", "1", sections, 2);
    const plans = parseSeatingPlans(records.map((r) => milestone({ id: r.id, ...(r.value as object) })));
    expect(plans[planKey("2026-08-16", "1")]).toEqual(sections);
  });

  it("주차와 부가 다르면 서로 섞이지 않는다", () => {
    const first = seatingRecords("2026-08-16", "1", sections, 2);
    const second = seatingRecords("2026-08-16", "2", [sections[0]], 1);
    const plans = parseSeatingPlans([...first, ...second].map((r) => milestone({ id: r.id, ...(r.value as object) })));
    expect(plans[planKey("2026-08-16", "1")]).toHaveLength(2);
    expect(plans[planKey("2026-08-16", "2")]).toHaveLength(1);
  });

  it("한 분단이 저장 한도를 넘으면 저장 전에 막는다", () => {
    const huge = section({ blocks: Array.from({ length: 40 }, () => ({ key: "1-11-11", rows: 2 })) });
    expect(() => seatingRecords("2026-08-16", "1", [huge], 1)).toThrow(/다른 분단으로 옮겨/);
  });

  it("다른 화면의 일정 조각은 배치로 읽지 않는다", () => {
    expect(parseSeatingPlans([
      milestone({ id: "a", sourceSite: "move-guide", note: "그냥 메모" }),
      milestone({ id: "b", sourceSite: "ministry-guide-month", note: '{"month":3}' }),
      milestone({ id: "c", sourceSite: "sunday-worship-seating", note: "깨진 JSON {" }),
    ])).toEqual({});
  });

  it("자리 배치 조각을 일정 목록에서 걸러낼 수 있다", () => {
    expect(isWorshipMilestone({ sourceSite: "sunday-worship-seating" })).toBe(true);
    expect(isWorshipMilestone({ sourceSite: "move-guide" })).toBe(false);
    expect(isWorshipMilestone({ sourceSite: undefined })).toBe(false);
  });
});
