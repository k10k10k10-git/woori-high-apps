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
  for (const name of ["classes", "teacherStaff", "teacherSpecial", "teacherExtra", "teacherAdditional"]) {
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
  it("다른 연도의 학생은 이름·생년월일·본인 연락처가 모두 같을 때만 같은 personId를 부여한다", () => {
    const { updates } = runMigration({
      classes: {
        2024: { "1-2-6": { students: { old: { name: "김예원", birth: "2010-01-02", phone: "010-1111-2222", pphone: "010-9999-0000" } } } },
        2025: {
          "1-3-6": { students: { promoted: { name: "김예원", birth: "2010.01.02", phone: "01011112222", pphone: "010-9999-0000" } } },
          "2-3-4": { students: { sibling: { name: "김예원", birth: "2010-01-02", pphone: "010-9999-0000" } } },
        },
      },
    });

    expect(updates["classes/2024/1-2-6/students/old/personId"])
      .toBe(updates["classes/2025/1-3-6/students/promoted/personId"]);
    expect(updates["classes/2025/2-3-4/students/sibling/personId"])
      .not.toBe(updates["classes/2024/1-2-6/students/old/personId"]);
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
});
