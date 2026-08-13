import { describe, expect, it } from "vitest";
import { MINISTRY_GUIDE_SECTIONS, MONTHLY_MINISTRIES } from "./ministryGuideContent";
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
      { id: "month", ...monthlyMinistryRecord(month, 100).value },
      ...ministryGuideSectionRecords(section, 100).map((record) => ({ id: record.id, ...record.value })),
    ];
    const merged = applyMinistryGuideOverrides(MONTHLY_MINISTRIES, MINISTRY_GUIDE_SECTIONS, parseMinistryGuideOverrides(records));
    expect(merged.monthly.find((item) => item.month === 8)).toEqual(month);
    expect(merged.sections.find((item) => item.id === section.id)?.title).toBe("수정된 운영 제목");
  });
});
