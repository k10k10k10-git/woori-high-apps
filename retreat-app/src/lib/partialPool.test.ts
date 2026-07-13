import { describe, it, expect } from "vitest";
import { buildPartialPool } from "./partialPool";
import type { Participant, Student, PartialAttendance } from "./types";

function makeStudent(o: Partial<Student> & { id: string; name: string }): Student {
  return {
    num: 1, grade: 1, class: 1, buNum: 1,
    birth: "", phone: "", pPhone: "", addr: "", photo: "", school: "",
    ...o,
  };
}
function makeParticipant(o: Partial<Participant> = {}): Participant {
  return { name: "홍길동", gender: "남", grade: 1, class: 1, bu: "1부", registeredAt: "2024-01-01", ...o };
}
function rec(id: string, type: PartialAttendance["type"]): PartialAttendance {
  return { id, type, updatedAt: 1 };
}

describe("buildPartialPool", () => {
  // 핵심 회귀(2026-07-13): 구두 신청 등 시트에 없어 participants에 없는 학생이라도,
  // 반 명단(classes/) 셀을 주황으로 칠하면 부분참석 탭 pool에 떠야 한다.
  it("includes a manually orange-colored roster student with no participant record", () => {
    const students = { rid9: makeStudent({ id: "rid9", name: "김민하", grade: 3, class: 2, buNum: 2 }) };
    const cellColors = { "2_rid9": "orange" };
    const pool = buildPartialPool({}, students, cellColors, []);
    expect(pool.map(r => r.name)).toEqual(["김민하"]);
    expect(pool[0].studentKey).toBe("2_rid9");
    expect(pool[0].bu).toBe("2부");
    expect(pool[0].grade).toBe(3);
    expect(pool[0].classNum).toBe(2);
  });

  it("includes participants colored orange and joins their phone", () => {
    const students = { s1: makeStudent({ id: "s1", name: "이서준", grade: 1, class: 4, buNum: 1 }) };
    const participants = { p_0: makeParticipant({ name: "이서준", grade: 1, class: 4, bu: "1부", studentId: "s1", phone: "010-1" }) };
    const cellColors = { "1_s1": "orange" };
    const pool = buildPartialPool(participants, students, cellColors, []);
    expect(pool).toHaveLength(1);
    expect(pool[0].phone).toBe("010-1");
  });

  it("includes anyone with an existing partial record even without an orange cell", () => {
    const students = { s2: makeStudent({ id: "s2", name: "박도윤", grade: 2, class: 1, buNum: 1 }) };
    const pool = buildPartialPool({}, students, {}, [rec("1_s2", "후발대")]);
    expect(pool.map(r => r.name)).toEqual(["박도윤"]);
    expect(pool[0].partial?.type).toBe("후발대");
  });

  it("excludes a key that is colored red", () => {
    const students = { s3: makeStudent({ id: "s3", name: "최유진", buNum: 1 }) };
    const pool = buildPartialPool({}, students, { "1_s3": "red" }, [rec("1_s3", "선복귀")]);
    expect(pool).toHaveLength(0);
  });

  it("sorts 선복귀 → 후발대 → 미지정, then by bu/grade/class/name", () => {
    const students = {
      a: makeStudent({ id: "a", name: "가", grade: 1, class: 1, buNum: 1 }),
      b: makeStudent({ id: "b", name: "나", grade: 1, class: 1, buNum: 1 }),
      c: makeStudent({ id: "c", name: "다", grade: 1, class: 1, buNum: 1 }),
    };
    const cellColors = { "1_a": "orange", "1_b": "orange", "1_c": "orange" };
    const records = [rec("1_b", "후발대"), rec("1_c", "선복귀")];
    const pool = buildPartialPool({}, students, cellColors, records);
    // c(선복귀) → b(후발대) → a(미지정)
    expect(pool.map(r => r.studentId)).toEqual(["c", "b", "a"]);
  });
});
