import { describe, it, expect } from "vitest";
import { resolvePaymentColorKey } from "./paymentColorKey";

describe("resolvePaymentColorKey", () => {
  it("regression: prefers p.studentId over a colliding nameToColorKey entry", () => {
    // 동명이인 시나리오: 학급 명단에 "정예은"이 두 명 있어 nameToColorKey가 다른 학생 키를 가리킴
    const nameToColorKey = new Map([["1_정예은", "1_wrongStudentId"]]);
    const key = resolvePaymentColorKey("정예은", "1_correctStudentId", 1, nameToColorKey);
    expect(key).toBe("1_correctStudentId");
  });

  it("falls back to nameToColorKey when studentId is missing", () => {
    const nameToColorKey = new Map([["1_정예은", "1_correctStudentId"]]);
    const key = resolvePaymentColorKey("정예은", null, 1, nameToColorKey);
    expect(key).toBe("1_correctStudentId");
  });

  it("falls back through normalized/stripped name variants", () => {
    const nameToColorKey = new Map([["1_정예은", "1_correctStudentId"]]);
    const key = resolvePaymentColorKey("217정예은A", undefined, 1, nameToColorKey);
    expect(key).toBe("1_correctStudentId");
  });

  it("returns null when nothing matches", () => {
    const key = resolvePaymentColorKey("홍길동", null, 1, new Map());
    expect(key).toBeNull();
  });
});
