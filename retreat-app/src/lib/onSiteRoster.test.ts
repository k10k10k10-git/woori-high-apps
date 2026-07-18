import { describe, expect, it } from "vitest";
import type { Participant, PartialAttendance, TeacherAttendance } from "./types";
import { buildOnSiteRoster } from "./onSiteRoster";

const participants: Record<string, Participant> = {
  paid: { name: "입금학생", gender: "남", grade: 1, class: 1, bu: "1부", studentId: "s1", registeredAt: "" },
  partial: { name: "부분학생", gender: "여", grade: 1, class: 1, bu: "1부", studentId: "1_s2", registeredAt: "" },
  cancelled: { name: "취소학생", gender: "여", grade: 1, class: 2, bu: "1부", studentId: "s3", registeredAt: "" },
};

const teachers: TeacherAttendance[] = [
  { id: "t1", name: "부분교사", bu: "1부", classKey: "1학년 1반", status: "부분참", arrivalInfo: "토요일 후발 도착" },
  { id: "t2", name: "불참교사", bu: "1부", classKey: "1학년 2반", status: "불참" },
  { id: "staff", name: "제외스탭", bu: "스탭", classKey: "보조스탭", status: "전참" },
];

const classStudents = [
  { rawId: "s1", buNum: 1, grade: 1, classNum: 1, name: "입금학생" },
  { rawId: "s2", buNum: 1, grade: 1, classNum: 1, name: "부분학생" },
  { rawId: "s3", buNum: 1, grade: 1, classNum: 2, name: "취소학생" },
];

describe("buildOnSiteRoster", () => {
  it("입금 색상과 무관하게 전체 신청 학생을 포함하고 상태를 표시한다", () => {
    const partialAttendances: PartialAttendance[] = [
      { id: "1_s2", type: "선복귀" },
    ];
    const roster = buildOnSiteRoster({
      participants,
      teachers: [],
      partialAttendances,
      cellColors: { "1_s1": "blue", "1_s2": "orange", "1_s3": "red" },
      classStudents,
      buNum: 1,
    });

    expect(roster.map(person => person.name)).toEqual(["부분학생", "입금학생", "취소학생"]);
    expect(roster.find(person => person.name === "부분학생")?.status?.label).toBe("부분참(선복귀)");
    expect(roster.find(person => person.name === "취소학생")?.status?.label).toBe("신청취소");
  });

  it("선택 부서 교사는 전부 포함하고 스탭은 제외한다", () => {
    const roster = buildOnSiteRoster({
      participants: {},
      teachers,
      partialAttendances: [],
      cellColors: {},
      classStudents: [],
      buNum: 1,
    });

    expect(roster.map(person => person.name)).toEqual(["부분교사", "불참교사"]);
    expect(roster[0].status?.label).toBe("부분참(후발대)");
    expect(roster[1].status?.label).toBe("불참");
    expect(roster.every(person => person.onSiteKey.startsWith("teacher:"))).toBe(true);
  });
});
