import { describe, it, expect } from "vitest";
import { parseClassKey } from "./classKey";

describe("parseClassKey", () => {
  it("정상 classKey를 세 숫자로 파싱한다", () => {
    expect(parseClassKey("1-2-3")).toEqual({ buNum: 1, grade: 2, classNum: 3 });
    expect(parseClassKey("2-1-10")).toEqual({ buNum: 2, grade: 1, classNum: 10 });
  });

  it("숫자가 아니거나 조각이 모자라면 null", () => {
    expect(parseClassKey("abc")).toBeNull();
    expect(parseClassKey("1-2")).toBeNull();
    expect(parseClassKey("")).toBeNull();
  });

  it("0은 falsy 가드로 걸러진다 (기존 !buNum 가드와 동일 동작)", () => {
    expect(parseClassKey("0-1-1")).toBeNull();
  });
});
