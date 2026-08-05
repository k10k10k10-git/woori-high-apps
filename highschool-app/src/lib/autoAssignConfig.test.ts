import { describe, expect, it } from "vitest";
import { DEFAULT_AUTO_ASSIGN_RULES, normalizeAutoAssignConfig } from "./autoAssignConfig";

describe("normalizeAutoAssignConfig", () => {
  it("저장값이 없으면 현재 기본 규칙과 빈 조장 20칸을 만든다", () => {
    const config = normalizeAutoAssignConfig(null);
    expect(config.groupCount1bu).toBe(10);
    expect(config.groupCount2bu).toBe(10);
    expect(config.rules).toEqual(DEFAULT_AUTO_ASSIGN_RULES);
    expect(config.leaderEntries1).toHaveLength(20);
    expect(config.leaderEntries2).toHaveLength(20);
  });

  it("조장 위치·파송 여부와 모든 고려 관계를 보존한다", () => {
    const config = normalizeAutoAssignConfig({
      groupCount1bu: 12,
      groupCount2bu: 10,
      rules: { ...DEFAULT_AUTO_ASSIGN_RULES, maxGroupSize: 12, minTwoClasses: true },
      leaderEntries1: [
        { name: "", grade: "", cls: "", studentId: "", mode: "withClass" },
        { name: "파송조장", grade: "2", cls: "3", studentId: "1_abc", mode: "sent" },
      ],
      studentConflicts: [{ a: "학생A", b: "학생B" }],
      teacherConflicts: [{ a: "교사A", b: "교사B" }],
      teacherStudentConflicts: [{ a: "교사C", b: "학생C" }],
      classConflicts: [{ a: "1부_1_1", b: "1부_1_2" }],
      classAffinities: [{ a: "2부_2_1", b: "2부_2_2" }],
    });

    expect(config.leaderEntries1[1]).toMatchObject({ name: "파송조장", studentId: "1_abc", mode: "sent" });
    expect(config.rules.maxGroupSize).toBe(12);
    expect(config.rules.minTwoClasses).toBe(true);
    expect(config.studentConflicts).toEqual([{ a: "학생A", b: "학생B" }]);
    expect(config.teacherConflicts).toEqual([{ a: "교사A", b: "교사B" }]);
    expect(config.teacherStudentConflicts).toEqual([{ a: "교사C", b: "학생C" }]);
    expect(config.classConflicts).toEqual([{ a: "1부_1_1", b: "1부_1_2" }]);
    expect(config.classAffinities).toEqual([{ a: "2부_2_1", b: "2부_2_2" }]);
  });

  it("구버전 조장에는 본인반 동반 기본값을 적용하고 잘못된 쌍은 제거한다", () => {
    const config = normalizeAutoAssignConfig({
      leaderEntries1: [{ name: "기존조장", grade: "1", cls: "1" }],
      studentConflicts: [{ a: "", b: "학생" }, { a: "같음", b: "같음" }, { a: "정상A", b: "정상B" }],
      rules: { maxGroupSize: 999, mixGender: false },
    });

    expect(config.leaderEntries1[0]).toMatchObject({ name: "기존조장", studentId: "", mode: "withClass" });
    expect(config.studentConflicts).toEqual([{ a: "정상A", b: "정상B" }]);
    expect(config.rules.maxGroupSize).toBe(30);
    expect(config.rules.mixGender).toBe(false);
    expect(config.rules.assignTeachers).toBe(true);
    expect(config.rules.keepSameClass).toBe(true);
    expect(config.rules.inferGenderByClass).toBe(true);
    expect(config.rules.excludeNonClassTeachers).toBe(true);
    expect(config.rules.ensureNonEmptyGroups).toBe(true);
    expect(config.rules.ensureEvenGroupCount).toBe(true);
    expect(config.rules.optimizeResults).toBe(true);
  });

  it("새 배정 구조 규칙의 명시적 false를 보존한다", () => {
    const config = normalizeAutoAssignConfig({
      rules: {
        keepSameClass: false,
        inferGenderByClass: false,
        excludeNonClassTeachers: false,
        ensureNonEmptyGroups: false,
        ensureEvenGroupCount: false,
        optimizeResults: false,
      },
    });

    expect(config.rules).toMatchObject({
      keepSameClass: false,
      inferGenderByClass: false,
      excludeNonClassTeachers: false,
      ensureNonEmptyGroups: false,
      ensureEvenGroupCount: false,
      optimizeResults: false,
    });
  });
});
