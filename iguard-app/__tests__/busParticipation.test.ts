import { describe, expect, it } from "vitest";
import {
  isDayVisitOnly,
  isCancelledStudent,
  isOwnCarTransport,
  isStudentBusPassengerOnDay,
  isTeacherBusPassenger,
  resolveTeacherAttendance,
} from "@/lib/busParticipation";
import type { TeacherAttendance } from "@/lib/types";

const teacher = (overrides: Partial<TeacherAttendance> & Pick<TeacherAttendance, "id" | "name">): TeacherAttendance => ({
  bu: "1부",
  classKey: "1학년 1반",
  status: "전참",
  ...overrides,
});

describe("학생 단체 버스 탑승 판정", () => {
  it("red 취소 셀은 uniqueKey와 raw studentId 양쪽에서 찾는다", () => {
    expect(isCancelledStudent("2_S32_01", { "2_S32_01": "red" })).toBe(true);
    expect(isCancelledStudent("2_S32_01", { S32_01: "red" })).toBe(true);
    expect(isCancelledStudent("2_S32_01", { "2_S32_01": "orange" })).toBe(false);
  });

  it("기존 선복귀·후발대 일차 규칙을 유지한다", () => {
    expect(isStudentBusPassengerOnDay(undefined, 1)).toBe(true);
    expect(isStudentBusPassengerOnDay({ type: "후발대" }, 1)).toBe(false);
    expect(isStudentBusPassengerOnDay({ type: "후발대" }, 3)).toBe(true);
    expect(isStudentBusPassengerOnDay({ type: "선복귀" }, 1)).toBe(true);
    expect(isStudentBusPassengerOnDay({ type: "선복귀" }, 3)).toBe(false);
  });

  it("당일참여·당일참석 학생은 1·3일차 모두 제외한다", () => {
    expect(isDayVisitOnly("24일(금) 당일참여")).toBe(true);
    expect(isDayVisitOnly("25일 당일 참석")).toBe(true);
    expect(isStudentBusPassengerOnDay({ type: "선복귀", note: "24일(금) 당일참여" }, 1)).toBe(false);
    expect(isStudentBusPassengerOnDay({ type: "후발대", note: "25일 당일참석" }, 3)).toBe(false);
  });
});

describe("교사 단체 버스 탑승 판정", () => {
  it("자차·자가용·개인차량 표기를 별도 이동으로 본다", () => {
    expect(isOwnCarTransport("자차 / 정자동")).toBe(true);
    expect(isOwnCarTransport("자 차")).toBe(true);
    expect(isOwnCarTransport("자가용")).toBe(true);
    expect(isOwnCarTransport("개인 차량")).toBe(true);
    expect(isOwnCarTransport("카풀 필요")).toBe(false);
  });

  it("같은 이름은 현재 조의 부서를 우선해 찾는다", () => {
    const teachers = [
      teacher({ id: "t1", name: "김교사", bu: "1부", transport: "자차" }),
      teacher({ id: "t2", name: "김교사", bu: "2부" }),
    ];
    expect(resolveTeacherAttendance(teachers, "김 교사", "1부")?.id).toBe("t1");
    expect(resolveTeacherAttendance(teachers, "김교사", "2부")?.id).toBe("t2");
  });

  it("불참과 자차 교사는 제외하고, 미매칭 교사는 기존 명단을 보존한다", () => {
    const teachers = [
      teacher({ id: "car", name: "자차교사", transport: "자차 / 용인" }),
      teacher({ id: "absent", name: "불참교사", status: "불참" }),
      teacher({ id: "bus", name: "버스교사", status: "부분참", transport: "카풀 필요" }),
    ];
    expect(isTeacherBusPassenger(teachers, "자차교사", "1부")).toBe(false);
    expect(isTeacherBusPassenger(teachers, "불참교사", "1부")).toBe(false);
    expect(isTeacherBusPassenger(teachers, "버스교사", "1부")).toBe(true);
    expect(isTeacherBusPassenger(teachers, "명단없는교사", "1부")).toBe(true);
  });
});

describe("당일참석 버스 제외 (2026-07-18)", () => {
  it("당일참석 타입은 일차·day와 무관하게 단체 버스에서 제외된다", () => {
    expect(isStudentBusPassengerOnDay({ type: "당일참석", day: 1 }, 1)).toBe(false);
    expect(isStudentBusPassengerOnDay({ type: "당일참석", day: 3 }, 3)).toBe(false);
  });
});
