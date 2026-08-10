import { describe, expect, it } from "vitest";
import {
  buildAnnouncementTemplate,
  getMonthlyMinistry,
  MINISTRY_GUIDE_SECTIONS,
  MONTHLY_MINISTRIES,
  RETREAT_FEEDFORWARD_QUESTIONS,
} from "./ministryGuideContent";

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

  it("피드포워드 네 문항과 공지 5단 구조를 유지한다", () => {
    expect(RETREAT_FEEDFORWARD_QUESTIONS).toHaveLength(4);
    const notice = buildAnnouncementTemplate({
      background: "수련회 신청을 안내드립니다.",
      audience: "고등부 학생",
      schedule: "7월 24일",
      method: "통합사이트 신청",
      deadline: "7월 10일",
      closing: "기도로 함께 준비해주세요.",
    });
    expect(notice).toContain("📢 대상: 고등부 학생");
    expect(notice).toContain("**7월 10일까지 부탁드립니다!**");
  });
});
