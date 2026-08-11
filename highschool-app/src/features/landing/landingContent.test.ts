import { describe, expect, it } from "vitest";
import { LANDING_FEATURES, PASONA_SECTION_IDS, PROBLEMS, SOLUTION_STEPS, START_STEPS, TARGETS } from "./landingContent";

describe("공개 소개 페이지 콘텐츠", () => {
  it("PASONA 순서를 빠짐없이 유지한다", () => {
    expect(PASONA_SECTION_IDS).toEqual(["problem", "affinity", "solution", "offer", "narrow", "action"]);
  });

  it("통합 홈·학기·수련회 행정·현장 기능을 모두 소개한다", () => {
    expect(LANDING_FEATURES.map((item) => item.id)).toEqual(["home", "semester", "sunday", "admin", "field"]);
  });

  it("각 단계의 안내가 비어 있지 않다", () => {
    expect(PROBLEMS.length).toBeGreaterThanOrEqual(3);
    expect(SOLUTION_STEPS.length).toBeGreaterThanOrEqual(4);
    expect(TARGETS.length).toBeGreaterThanOrEqual(4);
    expect(START_STEPS.length).toBeGreaterThanOrEqual(4);
  });

  it("공개 예시에는 연락처나 실제 구성원 식별값을 넣지 않는다", () => {
    const publicCopy = JSON.stringify(LANDING_FEATURES);
    expect(publicCopy).not.toMatch(/01[016789]-?\d{3,4}-?\d{4}/);
    expect(publicCopy).not.toContain("gmail.com");
  });
});
