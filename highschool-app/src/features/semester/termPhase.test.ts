import { describe, expect, it } from "vitest";
import type { Semester } from "./types";
import { featuredTerm, semesterSummaryMeta } from "./termPhase";

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

it("메타 날짜가 없는 학기는 실제 회차 범위로 판정하고 명시 날짜를 보존한다", () => {
  const meta = { title: "학기", completionRule: { minRate: 0.7 }, createdAt: "2026-08-01" };
  const sessions = { later: { id: "later", type: "행사", date: "2026-10-23", endDate: "2026-10-24" }, first: { id: "first", type: "정규", date: "2026-08-29" } } satisfies NonNullable<Parameters<typeof semesterSummaryMeta>[1]>;
  expect(semesterSummaryMeta(meta, sessions)).toMatchObject({ startDate: "2026-08-29", endDate: "2026-10-24" });
  expect(meta).not.toHaveProperty("startDate");
  expect(semesterSummaryMeta({ ...meta, startDate: "2026-08-01", endDate: "2026-12-01" }, sessions)).toMatchObject({ startDate: "2026-08-01", endDate: "2026-12-01" });
});
