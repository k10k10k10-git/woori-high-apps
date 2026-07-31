import { describe, expect, it } from "vitest";
import {
  findLateRegistrantIds,
  findDayAttendanceIds,
  findUnassignedStudentIds,
  findUnassignedTeachers,
  findRoomStudentCandidateIds,
  toRoomAutoStudents,
  toRoomAutoAdults,
  toRoomClassOptions,
  type RoomBoardStudents,
} from "./roomsBoard";
import type { Room, TeacherAttendance, PartialAttendance } from "./types";

/**
 * 특성화 테스트 — RoomsTab에서 추출하기 전의 동작을 그대로 고정한다.
 * 여기서 실패하면 방배정 화면의 동작이 바뀐 것이고, 이가드 숙소 안내까지 영향이 간다.
 */

function student(id: string, over: Partial<RoomBoardStudents[string]> = {}): RoomBoardStudents[string] {
  return {
    id, name: `학생${id}`, num: 1, grade: 1, class: 1, buNum: 1,
    birth: "", phone: "", pPhone: "", addr: "", photo: "", school: "",
    ...over,
  };
}

const STUDENTS: RoomBoardStudents = {
  "1_a": student("1_a", { name: "김가", class: 1, gender: "남" }),
  "1_b": student("1_b", { name: "이나", class: 2, gender: "여" }),
  "1_c": student("1_c", { name: "박다", class: 3 }),          // 성별 없음 → 홀수반=남
  "1_d": student("1_d", { name: "최라", class: 4 }),          // 성별 없음 → 짝수반=여
  "2_e": student("2_e", { name: "정마", class: 1, buNum: 2 }),
};

const room = (id: string, studentIds: string[], teachers: string[] = []): Room =>
  ({ id, roomNumber: id, capacity: 4, type: "남", studentIds, teachers });

const teacher = (name: string, status: TeacherAttendance["status"], over: Partial<TeacherAttendance> = {}): TeacherAttendance =>
  ({ id: name, name, bu: "1부", classKey: "1-1-1", status, ...over });

describe("findLateRegistrantIds", () => {
  it("색칠됐지만 미신청이고 반 명단에 있는 학생만 후기 신청자로 본다", () => {
    const result = findLateRegistrantIds(
      { "1_a": "blue", "1_b": "orange", "1_c": "red", "없는키": "blue" },
      ["1_b"],           // 1_b는 이미 신청자
      STUDENTS,
    );
    expect(result).toEqual(["1_a"]);
  });

  it("후기 신청자 색 집합 밖의 색은 제외한다", () => {
    expect(findLateRegistrantIds({ "1_a": "red" }, [], STUDENTS)).toEqual([]);
  });
});

describe("findDayAttendanceIds", () => {
  it("당일참석만 모은다", () => {
    const partial: PartialAttendance[] = [
      { id: "1_a", type: "당일참석", day: 2 },
      { id: "1_b", type: "선복귀" },
      { id: "1_c", type: "후발대" },
    ];
    expect([...findDayAttendanceIds(partial)]).toEqual(["1_a"]);
  });
});

describe("findUnassignedStudentIds", () => {
  const base = {
    unassigned: ["1_a", "1_b"],
    lateRegistrantIds: ["1_c", "1_d"],
    rooms: [room("r1", ["1_c"])],   // 1_c는 이미 방 있음
    cellColors: {} as Record<string, string>,
    dayAttendanceIds: new Set<string>(),
  };

  it("기존 미배정 + 방 없는 후기 신청자를 합친다", () => {
    expect(findUnassignedStudentIds(base)).toEqual(["1_a", "1_b", "1_d"]);
  });

  it("신청취소(red)는 제외한다 — 취소자 제거 후 리로드 시 재등장 방지", () => {
    expect(findUnassignedStudentIds({ ...base, cellColors: { "1_b": "red" } }))
      .toEqual(["1_a", "1_d"]);
  });

  it("당일참석은 숙박 대상이 아니라 제외한다", () => {
    expect(findUnassignedStudentIds({ ...base, dayAttendanceIds: new Set(["1_d"]) }))
      .toEqual(["1_a", "1_b"]);
  });
});

describe("findUnassignedTeachers", () => {
  it("불참 교사와 이미 방이 있는 교사를 제외한다", () => {
    const teachers = [teacher("김교사", "전참"), teacher("이교사", "불참"), teacher("박교사", "부분참")];
    const result = findUnassignedTeachers([room("r1", [], ["김교사"])], teachers);
    expect(result.map(t => t.name)).toEqual(["박교사"]);
  });
});

describe("findRoomStudentCandidateIds", () => {
  it("다른 방에 배정된 학생도 후보에 남긴다 (이동 목적)", () => {
    const result = findRoomStudentCandidateIds({
      participantIds: ["1_a", "1_b"],
      lateRegistrantIds: ["1_c"],
      cellColors: {},
      dayAttendanceIds: new Set(),
    });
    expect(result).toEqual(["1_a", "1_b", "1_c"]);
  });

  it("중복을 제거하고 취소·당일참석을 뺀다", () => {
    const result = findRoomStudentCandidateIds({
      participantIds: ["1_a", "1_a", "1_b"],
      lateRegistrantIds: ["1_a", "1_c"],
      cellColors: { "1_b": "red" },
      dayAttendanceIds: new Set(["1_c"]),
    });
    expect(result).toEqual(["1_a"]);
  });
});

describe("toRoomAutoStudents", () => {
  it("성별이 없으면 홀수반=남·짝수반=여로 보강한다", () => {
    const result = toRoomAutoStudents(["1_c", "1_d"], STUDENTS);
    expect(result.map(s => [s.name, s.gender])).toEqual([["박다", "남"], ["최라", "여"]]);
  });

  it("명시된 성별을 반 홀짝보다 우선한다", () => {
    // 1_b는 2반(짝수)이지만 성별이 "여"로 명시 — 규칙 결과와 우연히 같은지 확인이 아니라
    // 1_a(1반 홀수, 성별 "남")와 함께 명시값이 그대로 쓰이는지 본다.
    const result = toRoomAutoStudents(["1_a", "1_b"], STUDENTS);
    expect(result.map(s => s.gender)).toEqual(["남", "여"]);
  });

  it("반 명단에 없는 id는 건너뛴다", () => {
    expect(toRoomAutoStudents(["없는키"], STUDENTS)).toEqual([]);
  });

  it("bu가 없으면 buNum으로 보강한다", () => {
    expect(toRoomAutoStudents(["2_e"], STUDENTS)[0].bu).toBe("2부");
  });
});

describe("toRoomAutoAdults", () => {
  it("불참 교사를 제외한다", () => {
    const result = toRoomAutoAdults([teacher("김교사", "전참"), teacher("이교사", "불참")]);
    expect(result).toHaveLength(1);
  });
});

describe("toRoomClassOptions", () => {
  it("반 요약에 라벨을 붙이고 숫자 순서로 정렬한다", () => {
    const students = toRoomAutoStudents(["1_a", "1_b", "1_c", "1_d"], STUDENTS);
    const options = toRoomClassOptions(students, []);
    expect(options.map(o => o.label)).toEqual([
      "1부 1학년 1반", "1부 1학년 2반", "1부 1학년 3반", "1부 1학년 4반",
    ]);
  });

  it("classKey는 roomAutoAssign의 '1부-학년-반' 형식을 유지한다", () => {
    const options = toRoomClassOptions(toRoomAutoStudents(["1_a"], STUDENTS), []);
    expect(options[0].classKey).toBe("1부-1-1");
  });
});
