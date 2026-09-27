import { describe, expect, it } from "vitest";
import { LANDING_FEATURES, PROBLEMS, ROLE_STARTS, SOLUTION_STEPS, START_STEPS } from "./landingContent";

describe("공개 소개 페이지 콘텐츠", () => {
  it("통합 홈·학기·수련회 행정·현장 기능을 모두 소개한다", () => {
    expect(LANDING_FEATURES.map((item) => item.id)).toEqual(["home", "semester", "sunday", "admin", "field"]);
  });

  it("각 단계의 안내가 비어 있지 않다", () => {
    expect(PROBLEMS.length).toBeGreaterThanOrEqual(3);
    expect(SOLUTION_STEPS.length).toBeGreaterThanOrEqual(4);
    expect(ROLE_STARTS.map((item) => item.role)).toEqual(["교역자", "행정팀", "팀장", "교사·스탭"]);
    expect(START_STEPS.length).toBeGreaterThanOrEqual(4);
  });

  it("외부 판매 대상이나 가상의 운영 성과를 안내하지 않는다", () => {
    const publicCopy = JSON.stringify({ ROLE_STARTS, START_STEPS, LANDING_FEATURES });
    expect(publicCopy).not.toMatch(/다른 부서|구매|도입 문의|출석률 \d+%|참가 \d+명/);
    expect(publicCopy).toContain("담당 업무");
  });

  it("공개 예시에는 연락처나 실제 구성원 식별값을 넣지 않는다", () => {
    const publicCopy = JSON.stringify(LANDING_FEATURES);
    expect(publicCopy).not.toMatch(/01[016789]-?\d{3,4}-?\d{4}/);
    expect(publicCopy).not.toContain("gmail.com");
  });
});
