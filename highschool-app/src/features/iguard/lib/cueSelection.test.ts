import { describe, expect, it } from "vitest";
import { resolveSelectedBlockId, resolveSelectedDay } from "./cueSelection";

// 루트 CLAUDE.md 실수 13(★ 실제 사고): 30초 시계 tick이 사용자 선택을 덮어
// "확인하려던 블록이 1일차 기도회로 되돌아가던" 버그. 아래 T1·T3이 그 재발을 막는다.

describe("resolveSelectedDay", () => {
  const days = [1, 2, 3];

  it("T1: 사용자가 고른 일자는 오늘 일자보다 우선한다 (시계 tick이 덮지 않는다)", () => {
    expect(resolveSelectedDay(days, 3, 1)).toBe(3);
  });

  it("고른 일자가 없으면 오늘 일자로 자동 스냅한다", () => {
    expect(resolveSelectedDay(days, null, 2)).toBe(2);
  });

  it("오늘이 수련회 기간이 아니면 첫 일자를 쓴다", () => {
    expect(resolveSelectedDay(days, null, null)).toBe(1);
  });

  it("고른 일자가 일정에서 사라지면 자동값으로 되돌아간다", () => {
    expect(resolveSelectedDay(days, 9, 2)).toBe(2);
  });

  it("일정이 비어 있으면 1일차로 폴백한다", () => {
    expect(resolveSelectedDay([], null, null)).toBe(1);
  });
});

describe("resolveSelectedBlockId", () => {
  const ids = ["b1", "b2", "b3"];

  it("T3: 같은 일자에서 사용자가 고른 블록은 '지금' 블록보다 우선한다", () => {
    expect(resolveSelectedBlockId(ids, { day: 2, id: "b3" }, 2, "b1")).toBe("b3");
  });

  it("일자를 옮기면 자동 선택이 다시 살아난다", () => {
    expect(resolveSelectedBlockId(ids, { day: 1, id: "b3" }, 2, "b1")).toBe("b1");
  });

  it("고른 블록이 데이터 갱신으로 사라지면 자동값으로 되돌아간다 (빈 화면 방지)", () => {
    expect(resolveSelectedBlockId(ids, { day: 2, id: "삭제됨" }, 2, "b1")).toBe("b1");
  });

  it("자동 블록도 없으면 빈 문자열", () => {
    expect(resolveSelectedBlockId([], null, 1, undefined)).toBe("");
  });
});
