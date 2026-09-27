import { describe, expect, it } from "vitest";
import type { Semester } from "./types";
import { featuredTerm } from "./termPhase";

const term = (id: string, startDate?: string, endDate?: string) => ({ id, meta: { title: id, startDate, endDate } }) as Semester;

describe("featuredTerm", () => {
  const today = "2026-09-27";
  it("활성 학기가 없으면 가장 가까운 예정 학기와 지난 학기를 구별한다", () => {
    expect(featuredTerm([term("past", "2026-01-01", "2026-06-30"), term("future", "2027-01-01", "2027-06-30"), term("next", "2026-10-01", "2026-12-01")], today))
      .toMatchObject({ semester: { id: "next" }, phase: "upcoming" });
    expect(featuredTerm([term("old", "2025-01-01", "2025-06-30"), term("recent", "2026-01-01", "2026-06-30")], today))
      .toMatchObject({ semester: { id: "recent" }, phase: "past" });
  });
  it("오늘 포함 활성 기간을 우선하고 날짜가 없는 학기는 현재라고 부르지 않는다", () => {
    expect(featuredTerm([term("active", today, today), term("future", "2026-10-01", "2026-12-01")], today))
      .toMatchObject({ semester: { id: "active" }, phase: "current" });
    expect(featuredTerm([term("unscheduled")], today)).toMatchObject({ phase: "unscheduled" });
  });
});
