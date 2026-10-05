import { describe, expect, it } from "vitest";
import type { Retreat } from "./types";
import { selectRetreatForWork } from "./retreatSelection";
const retreats = [{ id: "winter", createdAt: 1 }, { id: "summer", createdAt: 2 }, { id: "next", createdAt: 3 }] as Retreat[];
const periods = [{ retreatId: "winter", startDate: "2026-01-01", endDate: "2026-01-03" }, { retreatId: "summer", startDate: "2026-08-01", endDate: "2026-08-03" }, { retreatId: "next", startDate: "2027-01-01" }];
describe("수련회 업무 기본 선택", () => {
  it("현재 진행 중, 가장 가까운 예정, 최근 종료 순으로 선택한다", () => {
    expect(selectRetreatForWork(retreats, periods, "2026-08-02")?.id).toBe("summer");
    expect(selectRetreatForWork(retreats, periods, "2026-10-05")?.id).toBe("next");
    expect(selectRetreatForWork(retreats.slice(0, 2), periods, "2026-10-05")?.id).toBe("summer");
  });
  it("삭제된 수련회 기간은 무시하고 날짜가 없으면 최근 개설 수련회를 사용한다", () => {
    expect(selectRetreatForWork(retreats, [], "2026-10-05")?.id).toBe("next");
    expect(selectRetreatForWork([], periods, "2026-10-05")).toBeNull();
  });
});
