import { describe, expect, it } from "vitest";
import { getMonthlyMinistry, MINISTRY_GUIDE_SECTIONS, MONTHLY_MINISTRIES } from "./ministryGuideContent";

describe("사역 가이드 콘텐츠", () => {
  it("12개월 사역 흐름을 빠짐없이 제공한다", () => {
    expect(MONTHLY_MINISTRIES.map((item) => item.month)).toEqual(
      Array.from({ length: 12 }, (_, index) => index + 1),
    );
    expect(getMonthlyMinistry(8).focus).toContain("선교·수련회 사후 관리");
  });

  it("운영 가이드를 다섯 범주로 구분한다", () => {
    expect(new Set(MINISTRY_GUIDE_SECTIONS.map((section) => section.category))).toEqual(
      new Set(["예배·목양", "훈련·리더십", "수련회", "행정·소통", "특별사역"]),
    );
    expect(MINISTRY_GUIDE_SECTIONS.every((section) => section.checklist.length > 0)).toBe(true);
  });
});
