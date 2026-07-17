import { describe, expect, it } from "vitest";
import { assignBusUnits } from "@/lib/busAutoAssign";
import { buildGenderCohorts, buildStudentGenderMap, groupBusTeachersByGender, resolveTeacherGender, teacherNamesForBusSegment } from "@/lib/busGender";
import type { Group, Participant, Student, TeacherAttendance } from "@/lib/types";

const participants: Record<string, Participant> = {
  p1: { name: "남학생1", gender: "남", grade: 1, class: 1, bu: "1부", studentId: "S11_01" },
  p2: { name: "남학생2", gender: "남자", grade: 1, class: 1, bu: "1부", studentId: "1_S11_02" },
  p3: { name: "여학생1", gender: "여", grade: 1, class: 1, bu: "1부", studentId: "S11_03" },
  p4: { name: "여학생2", gender: "여자", grade: 1, class: 2, bu: "1부", studentId: "S12_01" },
  p5: { name: "수동학생", gender: "여", grade: 3, class: 2, bu: "2부", studentId: null },
};

const students: Record<string, Student> = {
  "2_S32_01": { id: "2_S32_01", name: "수동학생", num: 1, grade: 3, class: 2, buNum: 2 },
  "2_S31_01": { id: "2_S31_01", name: "시트없는학생", num: 1, grade: 3, class: 1, buNum: 2 },
};

const groups: Group[] = [
  { id: "g1", name: "1조", bu: "1부", teachers: [], leader: "남학생1", studentIds: ["1_S11_01", "1_S11_02", "1_S11_03"] },
  { id: "g2", name: "2조", bu: "1부", teachers: [], leader: "여학생2", studentIds: ["1_S12_01", "1_UNKNOWN"] },
];

describe("조별 성별 버스 묶음", () => {
  it("participants의 raw/unique studentId를 classes uniqueKey로 정규화한다", () => {
    const map = buildStudentGenderMap(participants, students);
    expect(map["1_S11_01"]).toBe("남");
    expect(map["1_S11_02"]).toBe("남");
    expect(map["1_S11_03"]).toBe("여");
    expect(map["2_S32_01"]).toBe("여");
    expect(map["2_S31_01"]).toBe("남");
  });

  it("한 조의 같은 성별을 하나의 묶음으로 유지하고 취소·해당 일차 미탑승자는 제외한다", () => {
    const result = buildGenderCohorts(
      groups,
      participants,
      students,
      { "1_S11_02": { type: "후발대" } },
      { "1_S12_01": "red" },
      1,
    );
    expect(result.cohorts).toEqual([
      { groupId: "g1", gender: "남", studentIds: ["1_S11_01"] },
      { groupId: "g1", gender: "여", studentIds: ["1_S11_03"] },
    ]);
    expect(result.missingStudentIds).toEqual(["1_UNKNOWN"]);
  });
});

describe("교사 성별 버스 묶음", () => {
  const teacher = (overrides: Partial<TeacherAttendance> & Pick<TeacherAttendance, "id" | "name" | "classKey">): TeacherAttendance => ({
    bu: "2부",
    status: "전참",
    ...overrides,
  });

  it("명시 성별만 사용하고 담당반 성별로 교사 성별을 추론하지 않는다", () => {
    expect(resolveTeacherGender(teacher({ id: "t1", name: "여교사", classKey: "1학년 3반", gender: "여" }))).toBe("여");
    expect(resolveTeacherGender(teacher({ id: "t2", name: "남학생반여교사", classKey: "담임", originKey: "class:2-1-3" }))).toBeNull();
    expect(resolveTeacherGender(teacher({ id: "t3", name: "여학생반남교사", classKey: "2학년 4반" }))).toBeNull();
  });

  it("같은 조 교사를 각자의 성별로 나누고 자차·불참 교사는 제외한다", () => {
    const group: Group = { id: "g", name: "14조", bu: "2부", teachers: ["김효정", "박남성", "자차교사", "미확인"], leader: "", studentIds: [] };
    const teachers: TeacherAttendance[] = [
      teacher({ id: "t1", name: "김효정", classKey: "1학년 3반", gender: "여" }),
      teacher({ id: "t2", name: "박남성", classKey: "1학년 4반", gender: "남" }),
      teacher({ id: "t3", name: "자차교사", classKey: "1학년 2반", gender: "여", transport: "자차" }),
    ];
    expect(groupBusTeachersByGender(group, teachers)).toEqual({
      남: ["박남성"],
      여: ["김효정"],
      unresolved: ["미확인"],
    });
  });

  it("새 teacherNames를 우선하고 구버전 includeTeachers도 계속 읽는다", () => {
    expect(teacherNamesForBusSegment({ groupId: "g", gender: "여", teacherNames: ["김효정", "없는교사"] }, ["김효정", "박남성"])).toEqual(["김효정"]);
    expect(teacherNamesForBusSegment({ groupId: "g", gender: "남", includeTeachers: true }, ["김효정", "박남성"])).toEqual(["김효정", "박남성"]);
  });
});

describe("성별 묶음 자동배정", () => {
  function seededRandom() {
    let seed = 17;
    return () => {
      seed = (seed * 48271) % 2147483647;
      return seed / 2147483647;
    };
  }

  const units = [
    { id: "g1:남", size: 8, gender: "남" as const },
    { id: "g2:남", size: 7, gender: "남" as const },
    { id: "g1:여", size: 6, gender: "여" as const },
    { id: "g2:여", size: 5, gender: "여" as const },
  ];

  it("남녀 분리 모드는 각 호차를 단일 성별 묶음으로만 구성하고 모든 묶음을 한 번씩 배정한다", () => {
    const result = assignBusUnits([16, 16], units, {
      separateGenders: true,
      attempts: 80,
      random: seededRandom(),
    });
    expect(result).not.toBeNull();
    const unitMap = new Map(units.map(unit => [unit.id, unit]));
    const assigned = result!.flatMap(bin => bin.unitIds);
    expect(assigned.sort()).toEqual(units.map(unit => unit.id).sort());
    result!.forEach(bin => {
      const genders = new Set(bin.unitIds.map(id => unitMap.get(id)?.gender));
      expect(genders.size).toBeLessThanOrEqual(1);
      expect(bin.unitIds.reduce((sum, id) => sum + (unitMap.get(id)?.size ?? 0), 0)).toBeLessThanOrEqual(16);
    });
  });

  it("혼합 모드는 성별 제약 없이 기존 조 단위 배정을 허용한다", () => {
    const result = assignBusUnits([13, 13], units, {
      separateGenders: false,
      attempts: 80,
      random: seededRandom(),
    });
    expect(result).not.toBeNull();
    expect(result!.flatMap(bin => bin.unitIds).sort()).toEqual(units.map(unit => unit.id).sort());
  });
});
