import { describe, it, expect } from "vitest";
import { checkAdminCompat } from "@/lib/compat";
import type { Student, Group } from "@/lib/types";

function makeStudent(overrides: Partial<Student>): Student {
  return { id: "1_s1", name: "테스트", buNum: 1, grade: 1, class: 1, ...overrides } as Student;
}

function makeGroup(overrides: Partial<Group> & { id: string; bu: string; name: string }): Group {
  return { studentIds: [], teachers: [], leader: "", staff: "", ...overrides } as Group;
}

describe("checkAdminCompat", () => {
  it("returns no warnings for valid data", () => {
    const students = { "1_s1": makeStudent({ id: "1_s1" }) };
    const groups = [makeGroup({ id: "g1", bu: "1부", name: "1조", studentIds: ["1_s1"] })];
    expect(checkAdminCompat(students, groups)).toEqual([]);
  });

  it("warns when student parsing has NaN fields", () => {
    const students = { bad: makeStudent({ id: "bad", grade: NaN, class: NaN, buNum: NaN }) };
    const warnings = checkAdminCompat(students, []);
    expect(warnings.some(w => w.text.includes("파싱 이상"))).toBe(true);
  });

  it("warns when >30% of group studentIds are orphans", () => {
    const students = { "1_s1": makeStudent({ id: "1_s1" }) };
    const groups = [makeGroup({
      id: "g1", bu: "1부", name: "1조",
      studentIds: ["1_s1", "missing1", "missing2", "missing3", "missing4"],
    })];
    const warnings = checkAdminCompat(students, groups);
    expect(warnings.some(w => w.text.includes("매칭 안 됨"))).toBe(true);
  });

  it("does not warn when orphan ratio is under 30%", () => {
    const students = {
      "1_s1": makeStudent({ id: "1_s1" }),
      "1_s2": makeStudent({ id: "1_s2" }),
      "1_s3": makeStudent({ id: "1_s3" }),
    };
    const groups = [makeGroup({
      id: "g1", bu: "1부", name: "1조",
      studentIds: ["1_s1", "1_s2", "1_s3", "missing1"],
    })];
    const warnings = checkAdminCompat(students, groups);
    expect(warnings.some(w => w.text.includes("매칭 안 됨"))).toBe(false);
  });

  it("warns on unexpected bu values", () => {
    const groups = [makeGroup({ id: "g1", bu: "중등부", name: "1조" })];
    const warnings = checkAdminCompat({}, groups);
    expect(warnings.some(w => w.text.includes("부"))).toBe(true);
  });
});
