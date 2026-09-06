import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/firebase", () => ({
  auth: {},
  db: {},
  storage: {},
  googleProvider: {},
}));

import { initialSemesterTab, semesterTabFromHref, semesterTabHref } from "./SemesterClient";

describe("학기 화면 초기 탭", () => {
  it.each(["신청", "배치", "출석", "커리큘럼", "아카이브", "설정"])(
    "모바일에서도 명시한 유효 탭 %s을 우선한다",
    (tab) => {
      expect(initialSemesterTab(tab, true)).toBe(tab);
    },
  );

  it("기존 수료 링크를 모바일에서도 출석 탭으로 연결한다", () => {
    expect(initialSemesterTab("수료", true)).toBe("출석");
  });

  it("탭 쿼리가 없을 때만 모바일 기본값을 출석으로 정한다", () => {
    expect(initialSemesterTab(undefined, true)).toBe("출석");
    expect(initialSemesterTab(undefined, false)).toBe("신청");
    expect(initialSemesterTab("알수없음", true)).toBe("신청");
  });

  it("탭을 고르면 기존 쿼리와 해시를 보존한 주소를 만든다", () => {
    const href = semesterTabHref("배치", "https://example.test/semester/2026-2?from=mypage&tab=%EC%B6%9C%EC%84%9D#member");
    expect(href).toBe(`/semester/2026-2?from=mypage&tab=${encodeURIComponent("배치")}#member`);
  });

  it("뒤로가기 주소의 명시 탭과 모바일 기본 탭을 같은 규칙으로 복원한다", () => {
    expect(semesterTabFromHref("/semester/2026-2?tab=%EC%BB%A4%EB%A6%AC%ED%81%98%EB%9F%BC", true)).toBe("커리큘럼");
    expect(semesterTabFromHref("/semester/2026-2", true)).toBe("출석");
    expect(semesterTabFromHref("/semester/2026-2", false)).toBe("신청");
  });
});
