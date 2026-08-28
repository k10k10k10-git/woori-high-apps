import { describe, expect, it } from "vitest";
import {
  IGUARD_VIEW_GROUPS,
  RETREAT_TAB_GROUPS,
  SEMESTER_TABS,
  SEMESTER_TRAINING_TABS,
  SUNDAY_MINISTRY_DEFAULT_TEAM,
  SUNDAY_MINISTRY_TABS,
  SUNDAY_MINISTRY_TEAMS,
  UNIFIED_ROUTES,
  sundayTeamHref,
  sundayTeamOf,
} from "./featureCatalog";

describe("통합 앱 기능 카탈로그", () => {
  it("학기 중 사역과 주일 사역의 탭을 분리한다", () => {
    expect(SEMESTER_TRAINING_TABS).toEqual(["신청", "배치", "출석", "커리큘럼", "아카이브", "설정"]);
    expect(SUNDAY_MINISTRY_TABS).toEqual(["새친구", "등록 현황", "처리 대기", "출석부", "행정 변동 사항", "자리 배치", "예배 담당표", "예배 자료"]);
    expect(SEMESTER_TABS).toEqual(SEMESTER_TRAINING_TABS);
  });

  it("주일 사역 팀 순서를 행정·바나바·예배·찬양·미디어·기획디자인으로 고정한다", () => {
    expect(SUNDAY_MINISTRY_TEAMS.map((team) => team.key)).toEqual(["admin", "barnabas", "worship", "praise", "media", "design"]);
    expect(SUNDAY_MINISTRY_TEAMS.map((team) => team.label)).toEqual(["행정팀", "바나바팀", "예배팀", "찬양팀", "미디어팀", "기획디자인팀"]);
  });

  it("팀별 탭의 합집합이 주일 사역 전체 탭과 같다 — 개편으로 탭이 유실되지 않는다", () => {
    const assigned = SUNDAY_MINISTRY_TEAMS.flatMap((team) => team.tabs);
    expect(new Set(assigned).size).toBe(assigned.length); // 같은 탭이 두 팀에 중복 배치되지 않는다
    expect([...assigned].sort()).toEqual([...SUNDAY_MINISTRY_TABS].sort());
  });

  it("새친구·등록 현황·처리 대기는 바나바팀, 출석부·행정 변동 사항은 행정팀에 둔다", () => {
    expect(sundayTeamOf("barnabas")?.tabs).toEqual(["새친구", "등록 현황", "처리 대기"]);
    expect(sundayTeamOf("admin")?.tabs).toEqual(["출석부", "행정 변동 사항"]);
  });

  it("예배팀은 자리 배치·담당표·자료 세 화면을 맡는다", () => {
    expect(sundayTeamOf("worship")?.tabs).toEqual(["자리 배치", "예배 담당표", "예배 자료"]);
  });

  it("찬양·미디어·기획디자인팀은 기능 확정 전까지 빈 화면이다", () => {
    expect(sundayTeamOf("praise")?.tabs).toEqual([]);
    expect(sundayTeamOf("media")?.tabs).toEqual([]);
    expect(sundayTeamOf("design")?.tabs).toEqual([]);
    expect(SUNDAY_MINISTRY_TEAMS.filter((team) => team.status === "planned").map((team) => team.key)).toEqual(["praise", "media", "design"]);
    expect(SUNDAY_MINISTRY_TEAMS.filter((team) => team.status === "ready").map((team) => team.key)).toEqual(["admin", "barnabas", "worship"]);
  });

  it("팀 없는 기존 주소는 바나바팀으로 유지해 첫 화면이 새친구 그대로다", () => {
    expect(SUNDAY_MINISTRY_DEFAULT_TEAM).toBe("barnabas");
    expect(sundayTeamOf(SUNDAY_MINISTRY_DEFAULT_TEAM)?.tabs[0]).toBe("새친구");
  });

  it("알 수 없는 팀 키는 찾지 못한다", () => {
    expect(sundayTeamOf("unknown")).toBeUndefined();
    expect(sundayTeamOf(undefined)).toBeUndefined();
    expect(sundayTeamHref("worship")).toBe("/sunday-ministry/worship");
  });

  it("수련회 행정의 5개 그룹과 17개 탭 인덱스를 빠짐없이 유지한다", () => {
    expect(RETREAT_TAB_GROUPS).toHaveLength(5);
    const indices = RETREAT_TAB_GROUPS.flatMap(group => group.tabs.map(tab => tab.idx));
    expect(indices).toHaveLength(17);
    expect([...new Set(indices)].sort((a, b) => a - b)).toEqual(Array.from({ length: 17 }, (_, index) => index));
  });

  it("이가드의 실행·기획·정보 22개 화면을 유지한다", () => {
    expect(IGUARD_VIEW_GROUPS.map(group => group.views.length)).toEqual([6, 14, 2]);
    const keys = IGUARD_VIEW_GROUPS.flatMap(group => group.views.map(view => view.key));
    expect(new Set(keys).size).toBe(22);
  });

  it("통합 홈과 세 도메인의 진입 경로를 제공한다", () => {
    expect(UNIFIED_ROUTES).toContain("/ministry-guide");
    expect(UNIFIED_ROUTES).toContain("/suggestions");
    expect(UNIFIED_ROUTES).toContain("/semesters");
    expect(UNIFIED_ROUTES).toContain("/sunday-ministry");
    expect(UNIFIED_ROUTES).toContain("/semester-admin");
    expect(UNIFIED_ROUTES).toContain("/retreats");
    expect(UNIFIED_ROUTES).toContain("/programs");
    expect(UNIFIED_ROUTES).toContain("/retreat/[id]/programs");
    expect(UNIFIED_ROUTES).toContain("/field");
    expect(UNIFIED_ROUTES).toContain("/retreat/[id]/field");
  });
});
