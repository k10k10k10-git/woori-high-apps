import { describe, expect, it } from "vitest";
import { buildCancellationRosterStudents, resolveCancellationStudentKey } from "./cancellationRoster";

const classes = {
  "1-2-3": { students: { a: { name: "김 학생" }, b: { name: "동명이인" } } },
  "2-2-3": { students: { c: { name: "동명이인" } } },
};

describe("취소명단 공개 마커 연결", () => {
  const roster = buildCancellationRosterStudents(classes);

  it("출석부 키를 부 접두형으로 만든다", () => {
    expect(roster.map(student => student.key)).toEqual(["1_a", "1_b", "2_c"]);
  });

  it("부·학년·반·공백 제거 이름이 정확히 같은 학생만 연결한다", () => {
    expect(resolveCancellationStudentKey({ bu: "1부", grade: 2, class: 3, name: "김학생" }, roster)).toBe("1_a");
    expect(resolveCancellationStudentKey({ bu: "2부", grade: 2, class: 3, name: "동명이인" }, roster)).toBe("2_c");
  });

  it("저장된 studentKey를 우선하고 미매칭은 임의 연결하지 않는다", () => {
    expect(resolveCancellationStudentKey({ studentKey: "2_manual", bu: "2부", grade: 0, class: 0, name: "수동" }, roster)).toBe("2_manual");
    expect(resolveCancellationStudentKey({ bu: "1부", grade: 1, class: 1, name: "없는학생" }, roster)).toBeNull();
  });

  it("수정 폼이 다른 출석부 학생으로 바뀌면 과거 studentKey를 고집하지 않는다", () => {
    expect(resolveCancellationStudentKey({ studentKey: "1_a", bu: "2부", grade: 2, class: 3, name: "동명이인" }, roster)).toBe("2_c");
  });
});
