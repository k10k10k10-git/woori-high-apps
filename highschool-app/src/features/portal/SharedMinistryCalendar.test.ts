import { describe, expect, it } from "vitest";
import { calendarItemsForDate, type SharedCalendarItem } from "./SharedMinistryCalendar";

describe("calendarItemsForDate", () => {
  const items: SharedCalendarItem[] = [
    { id: "session", date: "2026-08-29", title: "훈련", kind: "semester", href: "/semester" },
    { id: "retreat", date: "2026-08-20", endDate: "2026-08-22", title: "수련회", kind: "retreat", href: "/retreat" },
  ];

  it("단일 일정과 기간 일정을 선택 날짜에 맞게 반환한다", () => {
    expect(calendarItemsForDate(items, "2026-08-21").map((item) => item.id)).toEqual(["retreat"]);
    expect(calendarItemsForDate(items, "2026-08-29").map((item) => item.id)).toEqual(["session"]);
  });
});
