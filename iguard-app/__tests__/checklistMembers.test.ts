import { describe, expect, it } from "vitest";
import { roleNamesForChecklist, studentPartialLabel, teacherChecklistMeta } from "@/lib/checklistMembers";
import type { Group, TeacherAttendance } from "@/lib/types";

const group: Group = {
  id: "group-1",
  name: "1조",
  bu: "1부",
  teachers: ["자차교사", "버스교사", "부분참교사", "불참교사", "수동교사"],
  leader: "학생조장",
  studentIds: [],
};

const teachers: TeacherAttendance[] = [
  { id: "car", name: "자차교사", bu: "1부", classKey: "1-1", status: "전참", transport: "자차 출발" },
  { id: "bus", name: "버스교사", bu: "1부", classKey: "1-2", status: "전참", transport: "단체버스" },
  { id: "partial", name: "부분참교사", bu: "1부", classKey: "1-3", status: "부분참", transport: "단체버스" },
  { id: "absent", name: "불참교사", bu: "1부", classKey: "1-4", status: "불참", transport: "단체버스" },
];

describe("인원체크 교사 명단", () => {
  it("조별 인원체크에는 자차·부분참·수동 교사를 포함하고 불참 교사는 제외한다", () => {
    expect(roleNamesForChecklist(group, teachers, "group"))
      .toEqual(["자차교사", "버스교사", "부분참교사", "수동교사"]);
  });

  it("호차별 인원체크에서는 자차·불참 교사를 제외한다", () => {
    expect(roleNamesForChecklist(group, teachers, "bus"))
      .toEqual(["버스교사", "부분참교사", "수동교사"]);
  });

  it("부분참 교사는 명단 상태를 표시한다", () => {
    expect(teacherChecklistMeta(teachers, "부분참교사", "1부")).toBe("교사 · 부분참");
    expect(teacherChecklistMeta(teachers, "버스교사", "1부")).toBe("교사");
  });

  it("학생 부분참 유형을 모두 표시한다", () => {
    expect(studentPartialLabel({ type: "선복귀" })).toBe("선복귀");
    expect(studentPartialLabel({ type: "후발대" })).toBe("후발대");
    expect(studentPartialLabel({ type: "당일참석", day: 2 })).toBe("당일참석(2일차)");
  });
});
