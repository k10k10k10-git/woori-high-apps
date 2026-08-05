import { describe, it, expect } from "vitest";
import { resolveEffectiveColor } from "./rosterColor";

describe("resolveEffectiveColor", () => {
  it("regression: 부분참 지정이 있으면 입금완료(파랑)여도 주황으로 표시", () => {
    // 버그: 선복귀/후발대인데 신청자 취합엔 파랑(입금완료)으로만 나오던 문제
    expect(resolveEffectiveColor("blue", true)).toBe("orange");
  });

  it("수동 색이 없어도 부분참이면 주황", () => {
    expect(resolveEffectiveColor(undefined, true)).toBe("orange");
    expect(resolveEffectiveColor("green", true)).toBe("orange");
    expect(resolveEffectiveColor("purple", true)).toBe("orange");
  });

  it("신청취소(빨강)는 부분참 지정보다 우선", () => {
    expect(resolveEffectiveColor("red", true)).toBe("red");
  });

  it("부분참이 아니면 수동 색을 그대로 유지", () => {
    expect(resolveEffectiveColor("blue", false)).toBe("blue");
    expect(resolveEffectiveColor("orange", false)).toBe("orange");
    expect(resolveEffectiveColor(undefined, false)).toBeUndefined();
  });
});
