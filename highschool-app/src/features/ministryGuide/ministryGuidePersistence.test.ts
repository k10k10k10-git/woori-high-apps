import { describe, expect, it } from "vitest";
import { MINISTRY_GUIDE_SECTIONS, MONTHLY_MINISTRIES, monthlyMinistriesForYear } from "./ministryGuideContent";
import {
  applyMinistryGuideOverrides,
  isMinistryGuideMilestone,
  ministryGuideSectionRecords,
  monthlyMinistryRecord,
  parseMinistryGuideOverrides,
} from "./ministryGuidePersistence";

describe("사역 가이드 편집 저장", () => {
  it("사역 가이드 레코드를 일반 준비 일정과 구분한다", () => {
    expect(isMinistryGuideMilestone({ sourceSite: "ministry-guide-month" })).toBe(true);
    expect(isMinistryGuideMilestone({ sourceSite: "move-guide" })).toBe(false);
  });

  it("월별 흐름과 가이드 조각을 다시 합쳐 기본값에 덮어쓴다", () => {
    const month = { month: 8, curriculum: "수정 커리큘럼", focus: ["수정 집중 사역"] };
    const section = { ...MINISTRY_GUIDE_SECTIONS[0], title: "수정된 운영 제목" };
    const records = [
      { id: "month", ...monthlyMinistryRecord(2026, month, 100).value },
      ...ministryGuideSectionRecords(section, 100).map((record) => ({ id: record.id, ...record.value })),
    ];
    const merged = applyMinistryGuideOverrides(MONTHLY_MINISTRIES, MINISTRY_GUIDE_SECTIONS, parseMinistryGuideOverrides(records));
    expect(merged.monthly.find((item) => item.month === 8)).toEqual(month);
    expect(merged.sections.find((item) => item.id === section.id)?.title).toBe("수정된 운영 제목");
  });

  it("연도가 다른 월별 흐름은 서로 덮어쓰지 않는다", () => {
    const year2027 = { month: 1, curriculum: "2027년 계획", focus: ["새해 준비"] };
    const records = [{ id: "month-2027", ...monthlyMinistryRecord(2027, year2027, 100).value }];
    const overrides = parseMinistryGuideOverrides(records);
    const merged2026 = applyMinistryGuideOverrides(MONTHLY_MINISTRIES, MINISTRY_GUIDE_SECTIONS, overrides, 2026);
    const merged2027 = applyMinistryGuideOverrides(monthlyMinistriesForYear(2027), MINISTRY_GUIDE_SECTIONS, overrides, 2027);

    expect(merged2026.monthly[0]).toEqual(MONTHLY_MINISTRIES[0]);
    expect(merged2027.monthly[0]).toEqual(year2027);
  });

  it("연도 정보가 없는 기존 월별 레코드는 2026년 편집값으로 유지한다", () => {
    const legacy = {
      id: "mg_month_01",
      title: "월별 사역 흐름 1월",
      targetDate: "2099-12-31",
      done: false,
      note: JSON.stringify({ month: 1, curriculum: "기존 편집값", focus: ["기존 일정"] }),
      sourceSite: "ministry-guide-month",
    };
    const overrides = parseMinistryGuideOverrides([legacy]);

    expect(overrides.monthly[2026]?.[1]?.curriculum).toBe("기존 편집값");
    expect(overrides.monthly[2027]).toBeUndefined();
  });
});
