import { describe, expect, it } from "vitest";
import { excludeAbsentInsuranceTeachers, excludeCancelledInsuranceStudents } from "./insuranceRoster";

describe("여행자 보험 명단 참석 필터", () => {
  it("신청 취소 학생은 제외하되 동명인의 다른 학년·반 학생은 유지한다", () => {
    const entries = [
      { name: "301김민지", bu: "1부", grade: 3, cls: 2, idNumber: "000000-0000000" },
      { name: "김민지", bu: "1부", grade: 1, cls: 6, idNumber: "111111-1111111" },
      { name: "이현우", bu: "2부", grade: 2, cls: 4, idNumber: "222222-2222222" },
    ];
    const cancellations = [
      { name: "김민지", bu: "1부" as const, grade: 3, class: 2 },
    ];

    expect(excludeCancelledInsuranceStudents(entries, cancellations).map(entry => entry.idNumber)).toEqual([
      "111111-1111111",
      "222222-2222222",
    ]);
  });

  it("불참 교사만 제외하고 전참·부분참 교사는 유지한다", () => {
    const teachers = [
      { id: "full", status: "전참" as const },
      { id: "partial", status: "부분참" as const },
      { id: "absent", status: "불참" as const },
    ];

    expect(excludeAbsentInsuranceTeachers(teachers).map(teacher => teacher.id)).toEqual(["full", "partial"]);
  });
});
