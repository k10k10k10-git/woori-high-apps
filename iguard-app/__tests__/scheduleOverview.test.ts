import { describe, expect, it } from "vitest";
import { buildScheduleOverview } from "@/lib/scheduleOverview";
import type { IguardScheduleBlock } from "@/lib/types";

const block = (id: string, day: number, start: string, label = id): IguardScheduleBlock => ({
  id, day, start, label,
});

describe("buildScheduleOverview", () => {
  it("일차를 열, 시작 시각을 행으로 파생한다", () => {
    const grid = buildScheduleOverview([
      block("a", 1, "09:00"),
      block("b", 2, "09:00"),
      block("c", 1, "14:00"),
    ]);
    expect(grid.days).toEqual([1, 2]);
    expect(grid.rows.map(row => row.start)).toEqual(["09:00", "14:00"]);
    expect(grid.rows[0].cells[1].map(item => item.id)).toEqual(["a"]);
    expect(grid.rows[0].cells[2].map(item => item.id)).toEqual(["b"]);
  });

  it("24시+ 시각도 문자열이 아닌 실제 분 값으로 정렬한다", () => {
    const grid = buildScheduleOverview([
      block("late", 2, "24:30"),
      block("morning", 1, "07:30"),
      block("night", 1, "19:30"),
    ]);
    expect(grid.rows.map(row => row.start)).toEqual(["07:30", "19:30", "24:30"]);
  });

  it("같은 일차·시각의 복수 블록도 손실하지 않는다", () => {
    const grid = buildScheduleOverview([block("a", 1, "10:00"), block("b", 1, "10:00")]);
    expect(grid.rows[0].cells[1]).toHaveLength(2);
  });

  it("긴 일정은 중간 시각 행을 rowspan으로 덮어 빈칸을 만들지 않는다", () => {
    const grid = buildScheduleOverview([
      { ...block("breakfast", 2, "07:30", "아침 식사"), end: "09:00" },
      { ...block("day3", 3, "08:30", "기상"), end: "10:00" },
      { ...block("program", 2, "09:00", "둘째날 오전"), end: "12:00" },
    ]);
    const breakfastRow = grid.rows.find(row => row.start === "07:30");
    const middleRow = grid.rows.find(row => row.start === "08:30");
    expect(breakfastRow?.rowSpans[2]).toBe(2);
    expect(middleRow?.coveredDays).toContain(2);
    expect(grid.rows.find(row => row.start === "09:00")?.cells[2][0].id).toBe("program");
  });
});
