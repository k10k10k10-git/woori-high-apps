import { describe, expect, it } from "vitest";
import { resolvePrintGender, studentPrintRowClass, teacherPrintStatus, teacherPrintStatusSuffix } from "./groupPrint";
import type { TeacherAttendance } from "./types";

const teacher = (name: string, bu: string, status: TeacherAttendance["status"]): TeacherAttendance => ({
  id: `${bu}_${name}`,
  name,
  bu,
  classKey: "1학년 1반",
  status,
});

describe("조편성 인쇄 상태·색상", () => {
  it("동명이인 교사는 현재 조의 부서 상태를 우선 표시한다", () => {
    const teachers = [teacher("김교사", "1부", "부분참"), teacher("김교사", "2부", "전참")];
    expect(teacherPrintStatus(teachers, "김교사", "1부")).toBe("부분참");
    expect(teacherPrintStatus(teachers, "김교사", "2부")).toBe("전참");
  });

  it("부분참과 불참만 이름 옆 텍스트로 표시하고 전참은 생략한다", () => {
    expect(teacherPrintStatusSuffix("부분참")).toBe(" (부분참)");
    expect(teacherPrintStatusSuffix("불참")).toBe(" (불참)");
    expect(teacherPrintStatusSuffix("전참")).toBe("");
  });

  it("참가자 성별을 우선하고 없으면 홀수반 남·짝수반 여 규칙으로 보강한다", () => {
    expect(resolvePrintGender("여", 3)).toBe("여");
    expect(resolvePrintGender(undefined, 3)).toBe("남");
    expect(resolvePrintGender(undefined, 4)).toBe("여");
  });

  it("일반 학생은 남 파랑·여 분홍이고 취소 학생은 빨강을 유지한다", () => {
    expect(studentPrintRowClass("남", 1)).toBe("r-male");
    expect(studentPrintRowClass("여", 2, "orange")).toBe("r-female");
    expect(studentPrintRowClass("남", 1, "red")).toBe("r-red");
  });
});
