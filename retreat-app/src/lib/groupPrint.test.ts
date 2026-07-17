import { describe, expect, it } from "vitest";
import { resolveIguardGroupStaffNames, resolvePrintGender, studentPrintRowClass, teacherPrintStatus, teacherPrintStatusLabel } from "./groupPrint";
import type { TeacherAttendance } from "./types";

const teacher = (name: string, bu: string, status: TeacherAttendance["status"]): TeacherAttendance => ({
  id: `${bu}_${name}`,
  name,
  bu,
  classKey: "1학년 1반",
  status,
});

describe("조편성 인쇄 상태·색상", () => {
  it("이가드 조스탭 ID를 이름으로 바꾸고 고아 ID·행정 스탭 중복을 제외한다", () => {
    const teachers = [
      teacher("김조스탭", "스탭", "전참"),
      teacher("중복스탭", "스탭", "부분참"),
      { ...teacher("같은이름", "스탭", "전참"), id: "스탭_같은이름_2" },
      teacher("같은이름", "스탭", "전참"),
    ];
    const staffMap = {
      g1: [teachers[0].id, "없는_ID", teachers[1].id, teachers[2].id, teachers[3].id],
    };

    expect(resolveIguardGroupStaffNames("g1", staffMap, teachers, ["중복스탭"])).toEqual([
      "김조스탭",
      "같은이름",
    ]);
  });

  it("동명이인 교사는 현재 조의 부서 상태를 우선 표시한다", () => {
    const teachers = [teacher("김교사", "1부", "부분참"), teacher("김교사", "2부", "전참")];
    expect(teacherPrintStatus(teachers, "김교사", "1부")).toBe("부분참");
    expect(teacherPrintStatus(teachers, "김교사", "2부")).toBe("전참");
  });

  it("부분참과 불참은 줄임표로 사라지지 않을 별도 배지 라벨로 반환하고 전참은 생략한다", () => {
    expect(teacherPrintStatusLabel("부분참")).toBe("부분참");
    expect(teacherPrintStatusLabel("불참")).toBe("불참");
    expect(teacherPrintStatusLabel("전참")).toBe("");
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
