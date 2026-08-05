import { describe, expect, it } from "vitest";
import type { Group, Student } from "./types";
import { resolveGroupRoleStudent, resolveGroupRoleStudentId } from "./groupRoleStudent";

const student = (id: string, name: string, buNum: number, grade: number, cls: number): Student => ({
  id, name, buNum, grade, class: cls, num: 1,
  birth: "", phone: "", pPhone: "", addr: "", photo: "", school: "",
});

const group = (bu: string, studentIds: string[]): Pick<Group, "bu" | "studentIds"> => ({ bu, studentIds });

describe("조 역할 학생 매칭", () => {
  const students = {
    "1_same": student("1_same", "이준영", 1, 2, 9),
    "2_same": student("2_same", "이준영", 2, 2, 3),
  };

  it("동명이인이 다른 부서에 있으면 현재 조에 배정된 학생 ID를 우선한다", () => {
    expect(resolveGroupRoleStudentId(students, group("2부", ["2_same"]), "이준영")).toBe("2_same");
    expect(resolveGroupRoleStudent(students, group("2부", ["2_same"]), "이준영")?.class).toBe(3);
  });

  it("역할 학생이 studentIds에 없어도 현재 부서의 유일한 동명이인을 선택한다", () => {
    expect(resolveGroupRoleStudentId(students, group("2부", []), "이준영")).toBe("2_same");
  });

  it("같은 부서에도 동명이인이 여럿이면 임의의 반을 표시하지 않는다", () => {
    const ambiguous = { ...students, "2_same_b": student("2_same_b", "이준영", 2, 3, 1) };
    expect(resolveGroupRoleStudentId(ambiguous, group("2부", []), "이준영")).toBeUndefined();
  });
});
