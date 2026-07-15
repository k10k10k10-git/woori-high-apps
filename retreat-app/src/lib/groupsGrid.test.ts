import { describe, it, expect } from "vitest";
import { buildGroupsGridColumns } from "./groupsGrid";
import type { Group, Student, TeacherAttendance } from "./types";

function makeStudent(o: Partial<Student> & { id: string; name: string }): Student {
  return {
    num: 1, grade: 1, class: 1, buNum: 1,
    birth: "", phone: "", pPhone: "", addr: "", photo: "", school: "",
    ...o,
  };
}
function makeGroup(o: Partial<Group> & { id: string; name: string }): Group {
  return { bu: "1부", teachers: [], leader: "", studentIds: [], ...o };
}
function makeTeacher(o: Partial<TeacherAttendance> & { id: string; name: string }): TeacherAttendance {
  return { bu: "1부", status: "전참", ...o } as TeacherAttendance;
}

const students: Record<string, Student> = {
  "1_l": makeStudent({ id: "1_l", name: "허채린", grade: 3, class: 6, buNum: 1 }),
  "1_a": makeStudent({ id: "1_a", name: "온누리", grade: 3, class: 6, buNum: 1 }),
  "1_b": makeStudent({ id: "1_b", name: "장지욱", grade: 3, class: 11, buNum: 1 }),
  "1_c": makeStudent({ id: "1_c", name: "김연수", grade: 3, class: 11, buNum: 1 }),
};

describe("buildGroupsGridColumns", () => {
  const group = makeGroup({
    id: "g1", name: "1조", teachers: ["홍성희"], leader: "허채린",
    studentIds: ["1_l", "1_a", "1_b", "1_c"],
  });

  it("열 순서: 조명 헤더 → 교사 → 조장 → 학생 (조장은 학생 목록에서 제외)", () => {
    const [col] = buildGroupsGridColumns([group], [group], students, {}, [makeTeacher({ id: "t1", name: "홍성희" })], new Map());
    // 학생 정렬은 반 오름차순·이름순: 온누리(3-6, 짝수반=여 폴백) → 김연수·장지욱(3-11, 홀수반=남 폴백)
    expect(col.map(c => c.kind)).toEqual(["header", "teacher", "leader", "female", "male", "male"]);
    expect(col[2].text).toBe("허채린 3-6"); // 조장에 반 표기
  });

  it("성별: 신청폼 성별 우선, 없으면 반 홀짝(홀=남, 짝=여) 폴백", () => {
    const gender = new Map([["1_a", "여"]]); // 폼에서 여 — 홀수반이지만 폼 값이 이긴다
    const [col] = buildGroupsGridColumns([group], [group], students, {}, [], gender);
    const 온누리 = col.find(c => c.text.startsWith("온누리"))!;
    expect(온누리.kind).toBe("female");
    const 장지욱 = col.find(c => c.text.startsWith("장지욱"))!;
    expect(장지욱.kind).toBe("male"); // 11반 = 홀수 폴백
  });

  it("학생 취소/부분참(셀색상)과 교사 불참/부분참(상태)이 status로 실린다", () => {
    const cellColors = { "1_a": "red", "1_b": "orange" };
    const teachers = [makeTeacher({ id: "t1", name: "홍성희", status: "불참" })];
    const [col] = buildGroupsGridColumns([group], [group], students, cellColors, teachers, new Map());
    expect(col.find(c => c.kind === "teacher")?.status).toBe("불참");
    expect(col.find(c => c.text.startsWith("온누리"))?.status).toBe("취소");
    expect(col.find(c => c.text.startsWith("장지욱"))?.status).toBe("부분참");
  });

  it("GBS가 있으면 헤더에 붙는다", () => {
    const g = makeGroup({ id: "g2", name: "2조", gbs: "5012호" });
    const [col] = buildGroupsGridColumns([g], [g], students, {}, [], new Map());
    expect(col[0].text).toContain("(5012호)");
  });
});
