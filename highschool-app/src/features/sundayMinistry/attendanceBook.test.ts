import { describe, expect, it } from "vitest";
import { attendanceSummary, attendanceWeeks, classKeysForPart, classLabel, sortedRoster } from "./attendanceBook";

describe("주일 사역 출석부 조회 모델", () => {
  it("출석부 원본과 같은 0기반 월·주차 키를 만든다", () => {
    const weeks = attendanceWeeks(2026, "first", { holiday: { month: "2", day: "15", label: "설 연휴" } });
    expect(weeks.find((week) => week.month === 1 && week.day === 4)?.cellKey).toBe("0-0");
    expect(weeks.find((week) => week.month === 2 && week.day === 15)).toMatchObject({ cellKey: "1-2", label: "설 연휴" });
    expect(weeks.every((week) => week.month <= 6)).toBe(true);
  });

  it("1학기·2학기 구분을 유지하면서 1년 전체 주차도 제공한다", () => {
    const first = attendanceWeeks(2026, "first", {});
    const second = attendanceWeeks(2026, "second", {});
    const all = attendanceWeeks(2026, "all", {});

    expect(first.every((week) => week.month <= 6)).toBe(true);
    expect(second.every((week) => week.month >= 7)).toBe(true);
    expect(all).toEqual([...first, ...second]);
    expect(new Set(all.map((week) => week.month))).toEqual(new Set([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]));
  });

  it("부별 반과 학생을 안정된 순서로 정렬한다", () => {
    expect(classKeysForPart(["2-1-1", "1-2-2", "1-1-9", "1-1-2"], 1)).toEqual(["1-1-2", "1-1-9", "1-2-2"]);
    expect(classLabel("2-3-4")).toBe("2부 3학년 4반");
    expect(sortedRoster({ a: { name: "가", num: 2 }, b: { name: "나", num: 1 } }).map(([id]) => id)).toEqual(["b", "a"]);
  });

  it("행사 주차를 제외하고 출석·지각·결석과 출석률을 집계한다", () => {
    const weeks = [
      { cellKey: "0-0", month: 1, day: 4 },
      { cellKey: "0-1", month: 1, day: 11 },
      { cellKey: "0-2", month: 1, day: 18 },
      { cellKey: "0-3", month: 1, day: 25, label: "휴강" },
    ];
    expect(attendanceSummary({ "0-0": "O", "0-1": "T", "0-2": "X", "0-3": "O" }, weeks)).toEqual({
      present: 1,
      tardy: 1,
      absent: 1,
      recorded: 3,
      rate: 33,
    });
  });
});
