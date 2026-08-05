import { describe, expect, it } from "vitest";
import { resolveTeacherGender } from "./teacherGender";

describe("교사 성별 판정", () => {
  it("명시 성별을 사용한다", () => {
    expect(resolveTeacherGender({ gender: "여", originKey: "class:2-1-3", classKey: "1학년 3반" })).toBe("여");
  });

  it("담당반 성별로 교사 성별을 추론하지 않는다", () => {
    expect(resolveTeacherGender({ originKey: "class:1-2-5", classKey: "2학년 5반 담임" })).toBeNull();
    expect(resolveTeacherGender({ originKey: "class:2-3-6", classKey: "3학년 6반 담임" })).toBeNull();
    expect(resolveTeacherGender({ classKey: "부장" })).toBeNull();
  });
});
