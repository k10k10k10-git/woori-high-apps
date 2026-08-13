import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const tempDirs: string[] = [];

afterEach(() => {
  tempDirs.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true }));
});

function runMigration(roots: Record<string, unknown>) {
  const dir = mkdtempSync(join(tmpdir(), "woori-person-id-test-"));
  tempDirs.push(dir);
  for (const name of ["classes", "teacherStaff", "teacherSpecial", "teacherExtra", "teacherAdditional", "semesters"]) {
    writeFileSync(join(dir, `${name}.json`), JSON.stringify(roots[name] ?? null));
  }
  const updates = join(dir, "updates.json");
  const report = join(dir, "report.json");
  execFileSync(process.execPath, [resolve(process.cwd(), "scripts/person-id-migration.mjs"), "--input", dir, "--updates", updates, "--report", report]);
  return {
    updates: JSON.parse(readFileSync(updates, "utf8")) as Record<string, string>,
    report: JSON.parse(readFileSync(report, "utf8")) as Record<string, unknown>,
  };
}

describe("personId 운영 DB 마이그레이션", () => {
  it("다른 연도 학생은 연락처가 달라도 이름·생년월일·부서·정상 진급이 유일하면 같은 personId를 부여한다", () => {
    const { updates } = runMigration({
      classes: {
        2024: { "1-1-6": { students: { old: { name: "김예원", birth: "2010-01-02", phone: "010-1111-2222", pphone: "010-9999-0000" } } } },
        2025: {
          "1-2-6": { students: { promoted: { name: "김예원", birth: "2010.01.02", phone: "01099998888", pphone: "010-1234-5678" } } },
        },
        2026: { "1-3-6": { students: { current: { name: "김예원", birth: "2010-01-02" } } } },
      },
    });

    expect(updates["classes/2024/1-1-6/students/old/personId"])
      .toBe(updates["classes/2025/1-2-6/students/promoted/personId"]);
    expect(updates["classes/2026/1-3-6/students/current/personId"])
      .toBe(updates["classes/2024/1-1-6/students/old/personId"]);
  });

  it("부서가 다르거나 정상 진급이 아니면 생년월일이 같아도 분리한다", () => {
    const { updates } = runMigration({
      classes: {
        2024: { "1-1-1": { students: { first: { name: "진급확인", birth: "2010-01-02" } } } },
        2025: { "2-2-1": { students: { otherDepartment: { name: "진급확인", birth: "2010-01-02" } } } },
        2026: { "1-2-1": { students: { wrongGrade: { name: "진급확인", birth: "2010-01-02" } } } },
      },
    });

    expect(new Set([
      updates["classes/2024/1-1-1/students/first/personId"],
      updates["classes/2025/2-2-1/students/otherDepartment/personId"],
      updates["classes/2026/1-2-1/students/wrongGrade/personId"],
    ]).size).toBe(3);
  });

  it("기존 personId가 갈라진 정상 진급 그룹은 가장 많이 쓰인 ID로 합친다", () => {
    const { updates, report } = runMigration({
      classes: {
        2024: { "1-1-5": { students: { first: { name: "이민서", birth: "2010-01-02", personId: "person_student_old" } } } },
        2025: { "1-2-5": { students: { second: { name: "이민서", birth: "2010-01-02", personId: "person_student_current" } } } },
        2026: { "1-3-5": { students: { third: { name: "이민서", birth: "2010-01-02", personId: "person_student_current" } } } },
      },
    });

    expect(updates["classes/2024/1-1-5/students/first/personId"]).toBe("person_student_current");
    expect(updates["classes/2025/1-2-5/students/second/personId"]).toBeUndefined();
    expect(report).toMatchObject({ mergedExistingStudentGroups: 1, retiredStudentPersonIds: 1 });
  });

  it("같은 연도에 ID가 다른 학생은 강한 필드가 같아도 분리한다", () => {
    const { updates, report } = runMigration({
      classes: {
        2026: {
          "1-1-1": { students: { first: { name: "이동명", birth: "2011-03-04", phone: "010-5555-0000" } } },
          "1-1-2": { students: { second: { name: "이동명", birth: "2011-03-04", phone: "010-5555-0000" } } },
        },
      },
    });

    expect(updates["classes/2026/1-1-1/students/first/personId"])
      .not.toBe(updates["classes/2026/1-1-2/students/second/personId"]);
    expect(report).toMatchObject({ ambiguousStudentGroups: 1, ambiguousStudentRecords: 2 });
  });

  it("유형이 다른 교사와 스탭은 이름·생년·연락처가 같아도 분리한다", () => {
    const { updates } = runMigration({
      teacherStaff: { 2026: { staff1: { name: "박동일", birth: "1990-01-02", phone: "010-7777-8888" } } },
      teacherExtra: { 2026: { 1: { "1_1_1": { name: "박동일", birth: "1990-01-02", phone: "010-7777-8888" } } } },
    });

    expect(updates["teacherStaff/2026/staff1/personId"])
      .not.toBe(updates["teacherExtra/2026/1/1_1_1/personId"]);
  });

  it("기존 학기 학생·스탭 신청을 같은 연도 공식 원장의 personId에 연결한다", () => {
    const { updates, report } = runMigration({
      classes: { 2026: { "1-1-2": { students: { S12_01: { name: "김학생" } } } } },
      teacherStaff: { 2026: { staff_1: { name: "김스탭" } } },
      semesters: {
        "2026-1": { applications: {
          student: { name: "김학생", bu: "1부", studentId: "S12_01" },
          staff: { name: "김스탭", bu: "스탭", studentId: "staff_1" },
          unknown: { name: "미확인", bu: "스탭", studentId: "staff_missing" },
        } },
      },
    });

    expect(updates["semesters/2026-1/applications/student/personId"])
      .toBe(updates["classes/2026/1-1-2/students/S12_01/personId"]);
    expect(updates["semesters/2026-1/applications/staff/personId"])
      .toBe(updates["teacherStaff/2026/staff_1/personId"]);
    expect(updates["semesters/2026-1/applications/unknown/personId"]).toBeUndefined();
    expect(report).toMatchObject({ semesterApplications: { total: 3, linked: 2, unmatched: 1 } });
  });
});
