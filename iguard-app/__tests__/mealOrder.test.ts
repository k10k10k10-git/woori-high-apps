import { describe, expect, it } from "vitest";
import { buildMealOrderItems, buildMealOrderSummaries } from "@/lib/mealOrder";
import type { Group, IguardMeal } from "@/lib/types";

const group = (id: string, bu: string, name: string, count = 0): Group => ({
  id,
  bu,
  name,
  studentIds: Array.from({ length: count }, (_, index) => `${id}_${index}`),
  teachers: [],
  leader: "",
});

describe("식사 순서 가로 표시 모델", () => {
  it("저장된 순서를 유지하면서 알파벳 없이 전역 조 번호를 만든다", () => {
    const groups = [
      group("g1", "1부", "1조", 10),
      group("g2", "1부", "2조", 11),
      group("g3", "2부", "1조", 12),
    ];
    const meal: IguardMeal = {
      id: "lunch",
      label: "1일차 점심",
      day: 1,
      slot: 1,
      entries: [
        { groupId: "g3", seq: 0 },
        { groupId: "g1", seq: 1 },
      ],
    };

    const items = buildMealOrderItems(meal, groups);
    expect(items.map(item => item.label)).toEqual(["3조", "1조", "2조"]);
    expect(items.map(item => item.order)).toEqual([1, 2, 3]);
    expect(items.map(item => item.people)).toEqual([12, 10, 11]);
    expect(items.every(item => !/^[A-Z]$/.test(item.label))).toBe(true);
  });

  it("조별정보 상단용 요약을 끼니 순서대로 만든다", () => {
    const groups = [
      group("g1", "1부", "1조", 10),
      group("g2", "1부", "2조", 11),
      group("g3", "2부", "1조", 12),
    ];
    const meals: IguardMeal[] = [
      {
        id: "dinner",
        label: "1일차 저녁",
        day: 1,
        slot: 2,
        entries: [{ groupId: "g2", seq: 0 }, { groupId: "g1", seq: 1 }, { groupId: "g3", seq: 2 }],
      },
      {
        id: "lunch",
        label: "1일차 점심",
        day: 1,
        slot: 1,
        entries: [{ groupId: "g3", seq: 0 }, { groupId: "g1", seq: 1 }, { groupId: "g2", seq: 2 }],
      },
    ];

    expect(buildMealOrderSummaries(meals, groups)).toEqual([
      { id: "lunch", label: "1일차 점심", groups: ["3조", "1조", "2조"] },
      { id: "dinner", label: "1일차 저녁", groups: ["2조", "1조", "3조"] },
    ]);
  });
});
