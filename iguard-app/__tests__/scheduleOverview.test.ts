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
});
