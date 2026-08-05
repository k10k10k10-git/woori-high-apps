import { describe, expect, it } from "vitest";
import type { TeacherAttendance } from "./types";
import { sortTeachersForTable, TEACHER_SORT_KEYS } from "./teacherTableSort";

function teacher(overrides: Partial<TeacherAttendance>): TeacherAttendance {
  return {
    id: "teacher",
    name: "홍길동",
    bu: "1부",
    classKey: "1학년 1반",
    status: "전참",
    ...overrides,
  };
}

describe("교사 참석 표 헤더 정렬", () => {
  it.each(TEACHER_SORT_KEYS)("%s 항목이 오름차순·내림차순으로 반전된다", key => {
    const first = teacher({
      id: "first", name: "가교사", source: "attendance-db", bu: "1부", gender: "남",
      classKey: "1학년 1반", status: "전참", arrivalInfo: "가 일정", note: "가 비고",
    });
    const second = teacher({
      id: "second", name: "나교사", source: "manual-assistant", bu: "2부", gender: "여",
      classKey: "2학년 2반", status: "불참", arrivalInfo: "나 일정", note: "나 비고",
    });

    const ascending = sortTeachersForTable([second, first], key, "asc").map(item => item.id);
    const descending = sortTeachersForTable([second, first], key, "desc").map(item => item.id);

    expect(descending).toEqual([...ascending].reverse());
  });

  it("빈 값은 정렬 방향과 관계없이 마지막에 둔다", () => {
    const filled = teacher({ id: "filled", name: "있음", gender: "남" });
    const empty = teacher({ id: "empty", name: "없음", gender: undefined });

    expect(sortTeachersForTable([empty, filled], "gender", "asc").map(item => item.id)).toEqual(["filled", "empty"]);
    expect(sortTeachersForTable([empty, filled], "gender", "desc").map(item => item.id)).toEqual(["filled", "empty"]);
  });
});
