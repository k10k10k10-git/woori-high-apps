import { describe, expect, it } from "vitest";
import { buildMealPartialPeople } from "./mealCountPeople";
import type { Participant, PartialAttendance, Student } from "./types";

function student(over: Partial<Student> = {}): Student {
  return {
    id: "2_S32_01",
    name: "김민하",
    num: 1,
    grade: 3,
    class: 2,
    buNum: 2,
    birth: "",
    phone: "",
    pPhone: "",
    addr: "",
    photo: "",
    school: "",
    ...over,
  };
}

function partial(id = "2_S32_01"): PartialAttendance {
  return { id, type: "후발대", note: "24-25일", updatedAt: 1 };
}

describe("식수 계산 학생 부분참 명단", () => {
  it("participants에 없는 수동 학생을 classes 원장에서 보완한다", () => {
    expect(buildMealPartialPeople(
      {},
      { "2_S32_01": student() },
      [partial()],
    )).toEqual([{
      id: "2_S32_01",
      name: "김민하",
      bu: "2부",
      grade: 3,
      classNum: 2,
      note: "24-25일",
      type: "후발대",
      matched: true,
    }]);
  });

  it("학생 원장과 참가자 모두에 없는 키만 미매칭으로 유지한다", () => {
    const people = buildMealPartialPeople({}, {}, [partial("2_missing")]);
    expect(people[0]).toMatchObject({
      id: "2_missing",
      name: "(명단 미매칭: 2_missing)",
      matched: false,
    });
  });

  it("참가자에만 있는 기존 부분참도 계속 표시한다", () => {
    const participant: Participant = {
      name: "홍길동",
      gender: "남",
      grade: 1,
      class: 1,
      bu: "1부",
      studentId: "raw1",
      registeredAt: "2026-01-01",
    };
    const people = buildMealPartialPeople({ p1: participant }, {}, [partial("1_raw1")]);
    expect(people[0]).toMatchObject({ name: "홍길동", bu: "1부", grade: 1, classNum: 1, matched: true });
  });
});
