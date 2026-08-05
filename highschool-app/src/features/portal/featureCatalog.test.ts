import { describe, expect, it } from "vitest";
import {
  IGUARD_VIEW_GROUPS,
  RETREAT_TAB_GROUPS,
  SEMESTER_TABS,
  UNIFIED_ROUTES,
} from "./featureCatalog";

describe("통합 앱 기능 카탈로그", () => {
  it("학기 사역의 7개 화면을 유지한다", () => {
    expect(SEMESTER_TABS).toEqual(["접수", "배치", "출석", "수료", "커리큘럼", "아카이브", "설정"]);
  });

  it("수련회 행정의 5개 그룹과 17개 탭 인덱스를 빠짐없이 유지한다", () => {
    expect(RETREAT_TAB_GROUPS).toHaveLength(5);
    const indices = RETREAT_TAB_GROUPS.flatMap(group => group.tabs.map(tab => tab.idx));
    expect(indices).toHaveLength(17);
    expect([...new Set(indices)].sort((a, b) => a - b)).toEqual(Array.from({ length: 17 }, (_, index) => index));
  });

  it("이가드의 실행·기획·정보 21개 화면을 유지한다", () => {
    expect(IGUARD_VIEW_GROUPS.map(group => group.views.length)).toEqual([5, 14, 2]);
    const keys = IGUARD_VIEW_GROUPS.flatMap(group => group.views.map(view => view.key));
    expect(new Set(keys).size).toBe(21);
  });

  it("통합 홈과 세 도메인의 진입 경로를 제공한다", () => {
    expect(UNIFIED_ROUTES).toContain("/semesters");
    expect(UNIFIED_ROUTES).toContain("/retreats");
    expect(UNIFIED_ROUTES).toContain("/field");
    expect(UNIFIED_ROUTES).toContain("/retreat/[id]/field");
  });
});
