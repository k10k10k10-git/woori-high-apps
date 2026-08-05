import { describe, expect, it } from "vitest";
import { buildSemesterTimeline, SEMESTER_REGULAR_TITLE } from "./semesterTimeline";
import type { Session } from "@/features/semester/types";

const session = (id: string, date: string, type: Session["type"], label?: string): Session =>
  ({ id, date, type, ...(label ? { label } : {}) });

describe("buildSemesterTimeline", () => {
  it("정규 회차를 주차별로 나열하지 않고 전체 기간 한 줄로 합친다", () => {
    const entries = buildSemesterTimeline([
      session("s1", "2026-03-08", "정규"),
      session("s2", "2026-03-15", "정규"),
      session("s3", "2026-06-14", "정규"),
    ]);
    expect(entries).toEqual([
      { key: "semester-regular", date: "2026-03-08", endDate: "2026-06-14", title: SEMESTER_REGULAR_TITLE },
    ]);
  });

  it("정규 회차가 하루뿐이면 종료일을 붙이지 않는다", () => {
    expect(buildSemesterTimeline([session("s1", "2026-03-08", "정규")])).toEqual([
      { key: "semester-regular", date: "2026-03-08", title: SEMESTER_REGULAR_TITLE },
    ]);
  });

  it("휴강·행사는 개별 항목으로 남기고 날짜순으로 정렬한다", () => {
    const entries = buildSemesterTimeline([
      session("s3", "2026-05-03", "휴강"),
      session("s1", "2026-03-08", "정규"),
      session("s2", "2026-03-15", "정규"),
      session("s4", "2026-06-21", "행사", "종강예배"),
    ]);
    expect(entries.map((entry) => [entry.date, entry.title])).toEqual([
      ["2026-03-08", SEMESTER_REGULAR_TITLE],
      ["2026-05-03", "휴강"],
      ["2026-06-21", "종강예배"],
    ]);
  });

  it("회차가 없으면 빈 배열이다", () => {
    expect(buildSemesterTimeline([])).toEqual([]);
  });
});
