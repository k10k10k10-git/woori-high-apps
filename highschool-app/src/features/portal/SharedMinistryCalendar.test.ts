import { describe, expect, it } from "vitest";
import { CALENDAR_KIND_STYLE, calendarItemsForDate, calendarKindForSourceSite, calendarSourceSiteForKind, SHARED_CALENDAR_KIND_OPTIONS, type SharedCalendarItem } from "./SharedMinistryCalendar";

describe("calendarItemsForDate", () => {
  const items: SharedCalendarItem[] = [
    { id: "session", date: "2026-08-29", title: "훈련", kind: "semester", href: "/semester" },
    { id: "retreat", date: "2026-08-20", endDate: "2026-08-22", title: "수련회", kind: "retreat", href: "/retreat" },
  ];

  it("단일 일정과 기간 일정을 선택 날짜에 맞게 반환한다", () => {
    expect(calendarItemsForDate(items, "2026-08-21").map((item) => item.id)).toEqual(["retreat"]);
    expect(calendarItemsForDate(items, "2026-08-29").map((item) => item.id)).toEqual(["session"]);
  });

  it("홈 영역과 같은 의미색을 사역 일정에 쓴다", () => {
    expect(CALENDAR_KIND_STYLE.main.chip).toContain("violet");
    expect(CALENDAR_KIND_STYLE.semester.chip).toContain("blue");
    expect(CALENDAR_KIND_STYLE.sunday.chip).toContain("amber");
    expect(CALENDAR_KIND_STYLE.retreat.chip).toContain("emerald");
    expect(CALENDAR_KIND_STYLE.field.chip).toContain("slate");
    expect(calendarKindForSourceSite("move-guide")).toBe("field");
    expect(calendarKindForSourceSite("retreat-admin")).toBe("retreat");
    expect(calendarKindForSourceSite("portal-main")).toBe("main");
    expect(calendarKindForSourceSite("semester-calendar")).toBe("semester");
  });

  it("직접 추가 일정은 모든 사역 영역을 명시적으로 선택해 sourceSite에 저장한다", () => {
    expect(SHARED_CALENDAR_KIND_OPTIONS.map((option) => option.value))
      .toEqual(["main", "semester", "sunday", "retreat", "field"]);
    expect(calendarSourceSiteForKind("main")).toBe("portal-main");
    expect(calendarSourceSiteForKind("sunday")).toBe("sunday-calendar");
  });
});
