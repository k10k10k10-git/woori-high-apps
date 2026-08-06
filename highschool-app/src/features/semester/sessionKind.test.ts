import { describe, expect, it } from "vitest";
import { needsCustomLabel, sessionDisplayLabel, sessionKindOf, sessionValueFor } from "./sessionKind";

describe("sessionValueFor", () => {
  it("개강·종강은 정규 회차이고 라벨만 붙는다 (출석 집계에 포함)", () => {
    expect(sessionValueFor("개강")).toEqual({ type: "정규", label: "개강" });
    expect(sessionValueFor("종강")).toEqual({ type: "정규", label: "종강" });
  });

  it("휴강만 출석 집계에서 빠지는 타입이다", () => {
    expect(sessionValueFor("휴강")).toEqual({ type: "휴강", label: null });
  });

  it("직접 입력은 라벨로 저장하고, 비면 정규로 떨어진다", () => {
    expect(sessionValueFor("직접", " 수련회 준비 ")).toEqual({ type: "정규", label: "수련회 준비" });
    expect(sessionValueFor("직접", "   ")).toEqual({ type: "정규", label: null });
  });

  it("정규는 라벨을 지운다", () => {
    expect(sessionValueFor("정규")).toEqual({ type: "정규", label: null });
  });
});

describe("sessionKindOf", () => {
  it("저장값을 선택지로 되돌린다", () => {
    expect(sessionKindOf({ type: "정규", label: "개강" })).toEqual({ kind: "개강", customLabel: "" });
    expect(sessionKindOf({ type: "정규", label: "종강" })).toEqual({ kind: "종강", customLabel: "" });
    expect(sessionKindOf({ type: "휴강" })).toEqual({ kind: "휴강", customLabel: "" });
    expect(sessionKindOf({ type: "정규" })).toEqual({ kind: "정규", customLabel: "" });
  });

  it("임의 라벨은 직접 입력으로 복원한다", () => {
    expect(sessionKindOf({ type: "정규", label: "수련회 준비" }))
      .toEqual({ kind: "직접", customLabel: "수련회 준비" });
  });

  it("레거시 행사 타입도 흡수한다", () => {
    expect(sessionKindOf({ type: "행사" })).toEqual({ kind: "직접", customLabel: "" });
    expect(sessionKindOf({ type: "행사", label: "체육대회" })).toEqual({ kind: "직접", customLabel: "체육대회" });
  });
});

describe("sessionDisplayLabel", () => {
  it("한 단어로 보여준다", () => {
    expect(sessionDisplayLabel({ type: "정규" })).toBe("정규");
    expect(sessionDisplayLabel({ type: "휴강" })).toBe("휴강");
    expect(sessionDisplayLabel({ type: "정규", label: "개강" })).toBe("개강");
    expect(sessionDisplayLabel({ type: "행사" })).toBe("행사");
  });
});

describe("needsCustomLabel", () => {
  it("직접 입력인데 텍스트가 비면 저장을 막는다", () => {
    expect(needsCustomLabel("직접", "")).toBe(true);
    expect(needsCustomLabel("직접", "특별 모임")).toBe(false);
    expect(needsCustomLabel("정규", "")).toBe(false);
  });
});
