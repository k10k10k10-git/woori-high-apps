import { describe, expect, it } from "vitest";
import {
  DEFAULT_SESSION_KIND,
  needsCustomLabel,
  SESSION_KINDS,
  SESSION_KIND_LABEL,
  sessionDisplayLabel,
  sessionKindOf,
  sessionValueFor,
} from "./sessionKind";

describe("회차 유형 선택지", () => {
  it("정규를 노출하지 않고 직접 입력을 기본값으로 쓴다", () => {
    expect(SESSION_KINDS).toEqual(["개강", "종강", "휴강", "직접"]);
    expect(DEFAULT_SESSION_KIND).toBe("직접");
    expect(SESSION_KIND_LABEL).toMatchObject({
      개강: "훈련&사역팀 개강",
      종강: "훈련&사역팀 종강",
      휴강: "훈련&사역팀 휴강",
      직접: "직접 입력",
    });
  });
});

describe("sessionValueFor", () => {
  it("개강·종강은 정규 회차이고 표준 라벨이 붙는다 (출석 집계에 포함)", () => {
    expect(sessionValueFor("개강")).toEqual({ type: "정규", label: "훈련&사역팀 개강" });
    expect(sessionValueFor("종강")).toEqual({ type: "정규", label: "훈련&사역팀 종강" });
  });

  it("휴강만 출석 집계에서 빠지는 타입이다", () => {
    expect(sessionValueFor("휴강")).toEqual({ type: "휴강", label: "훈련&사역팀 휴강" });
  });

  it("직접 입력은 라벨로 저장하고, 비면 정규로 떨어진다", () => {
    expect(sessionValueFor("직접", " 수련회 준비 ")).toEqual({ type: "정규", label: "수련회 준비" });
    expect(sessionValueFor("직접", "   ")).toEqual({ type: "정규", label: null });
  });

});

describe("sessionKindOf", () => {
  it("저장값을 선택지로 되돌린다", () => {
    expect(sessionKindOf({ type: "정규", label: "훈련&사역팀 개강" })).toEqual({ kind: "개강", customLabel: "" });
    expect(sessionKindOf({ type: "정규", label: "훈련&사역팀 종강" })).toEqual({ kind: "종강", customLabel: "" });
    expect(sessionKindOf({ type: "휴강" })).toEqual({ kind: "휴강", customLabel: "" });
    expect(sessionKindOf({ type: "정규" })).toEqual({ kind: "직접", customLabel: "" });
  });

  it("레거시 짧은 라벨도 표준 선택지로 되돌린다", () => {
    expect(sessionKindOf({ type: "정규", label: "개강" })).toEqual({ kind: "개강", customLabel: "" });
    expect(sessionKindOf({ type: "정규", label: "종강" })).toEqual({ kind: "종강", customLabel: "" });
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
  it("개강·종강·휴강은 레거시 저장값도 표준 문구로 보여준다", () => {
    expect(sessionDisplayLabel({ type: "정규" })).toBe("훈련&사역팀 모임");
    expect(sessionDisplayLabel({ type: "휴강" })).toBe("훈련&사역팀 휴강");
    expect(sessionDisplayLabel({ type: "정규", label: "개강" })).toBe("훈련&사역팀 개강");
    expect(sessionDisplayLabel({ type: "정규", label: "훈련&사역팀 종강" })).toBe("훈련&사역팀 종강");
    expect(sessionDisplayLabel({ type: "행사" })).toBe("행사");
  });
});

describe("needsCustomLabel", () => {
  it("직접 입력인데 텍스트가 비면 저장을 막는다", () => {
    expect(needsCustomLabel("직접", "")).toBe(true);
    expect(needsCustomLabel("직접", "특별 모임")).toBe(false);
    expect(needsCustomLabel("휴강", "")).toBe(false);
  });
});
