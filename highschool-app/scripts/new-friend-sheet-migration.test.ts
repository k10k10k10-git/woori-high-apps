import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import * as XLSX from "xlsx";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  const { rm } = await import("node:fs/promises");
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

function fixture() {
  const directory = mkdtempSync(resolve(tmpdir(), "new-friend-migration-"));
  temporaryDirectories.push(directory);
  const headers = [
    "날짜", "이름", "부서", "성별", "학교", "학년", "주소", "생년월일", "연락처(본인)",
    "연락처(주양육자)", "담당자", "등록가부", "1주차", "2주차", "인도자", "신급", "반배정",
    "교회 내 지인", "메모 by 새친구팀", "교역자심방", "특이사항 및 심방내용", "가족사항", "부", "모", "형제", "", "",
  ];
  const rows = [
    ["1.4", "등반학생", "1부", "남", "샘플고", 1, "주소", "10.02.25", "010-1111-2222", "010-3333-4444", "담당", "X", "1.4", "1.11", "친구", "기억 안 남", 119, "지인", "메모", null, "심방", null, "부 정보", null, null, null, null],
    ["8.16", "기존학생", "2부", "여", "기존고", 2, "새 주소", "09.01.02", "010-5555-6666", "010-7777-8888", "담당", "△", "8.16", null, "부모", "아직 안 함", null, null, "시트 메모", null, null, null, null, null, null, null, null],
    ["7.19", "희소학생", null, null, null, null, null, null, null, null, null, null, "7.19", "수련회", null, null, null, null, null, null, null, null, null, null, null, null, null],
    ["7.26", "공개정보학생", "1부", "남", null, 2, null, null, null, null, null, null, "7.26", null, null, null, null, null, null, null, null, null, null, null, null, null, null],
  ];
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([headers, ...rows]), "2026 새친구 시트");
  const xlsx = resolve(directory, "source.xlsx");
  XLSX.writeFile(workbook, xlsx);

  writeFileSync(resolve(directory, "classes-2026.json"), JSON.stringify({
    "1-1-9": { students: { s1: { name: "등반학생", birth: "2010.02.25", phone: "01011112222", pphone: "01033334444", personId: "person-1" } } },
    "1-1-4": { students: { s2: { name: "희소학생" } } },
  }));
  writeFileSync(resolve(directory, "newFriends-2026-sunday.json"), JSON.stringify({
    existing: { name: "기존학생", part: "2부", grade: 2, decision: "등록", week1Date: "2026-08-16", week2Date: "2026-08-30", registeredDate: "2026-08-16", createdAt: "2026-08-30T00:00:00.000Z" },
  }));
  writeFileSync(resolve(directory, "newFriendsPrivate-2026-sunday.json"), JSON.stringify({
    existing: { birth: "2009-01-02", phone: "010-5555-6666", parentPhone: "010-7777-8888", teamMemo: "기존 메모" },
  }));
  writeFileSync(resolve(directory, "newFriends-2026-1.json"), "null");
  writeFileSync(resolve(directory, "newFriendsPrivate-2026-1.json"), "null");
  return { directory, xlsx };
}

function materializeMigration(directory: string, updates: Record<string, unknown>) {
  const publicFile = resolve(directory, "newFriends-2026-sunday.json");
  const privateFile = resolve(directory, "newFriendsPrivate-2026-sunday.json");
  const publicValue = JSON.parse(readFileSync(publicFile, "utf8")) ?? {};
  const privateValue = JSON.parse(readFileSync(privateFile, "utf8")) ?? {};
  const assign = (root: Record<string, unknown>, parts: string[], value: unknown) => {
    let cursor = root;
    for (const part of parts.slice(0, -1)) {
      cursor[part] = cursor[part] && typeof cursor[part] === "object" ? cursor[part] : {};
      cursor = cursor[part] as Record<string, unknown>;
    }
    cursor[parts.at(-1)!] = value;
  };
  for (const [path, value] of Object.entries(updates)) {
    if (path.startsWith("semesters/2026-sunday/newFriends/")) assign(publicValue, path.split("/").slice(3), value);
    if (path.startsWith("semestersPrivate/2026-sunday/newFriendsPrivate/")) assign(privateValue, path.split("/").slice(3), value);
  }
  writeFileSync(publicFile, JSON.stringify(publicValue));
  writeFileSync(privateFile, JSON.stringify(privateValue));
}

describe("2026 새친구 시트 이관", () => {
  it("기존 원장은 보존하며 강한 출석부 일치만 등반 완료로 연결한다", () => {
    const { directory, xlsx } = fixture();
    const updatesFile = resolve(directory, "updates.json");
    const reportFile = resolve(directory, "report.json");
    execFileSync(process.execPath, [
      resolve(process.cwd(), "scripts/new-friend-sheet-migration.mjs"),
      "--xlsx", xlsx,
      "--input", directory,
      "--updates", updatesFile,
      "--report", reportFile,
      "--now", "2026-08-30T10:00:00.000Z",
    ]);

    const updates = JSON.parse(readFileSync(updatesFile, "utf8"));
    const report = JSON.parse(readFileSync(reportFile, "utf8"));
    const createdPublic = Object.entries(updates).find(([path]) => path.startsWith("semesters/2026-sunday/newFriends/sheet26_002_"))?.[1] as Record<string, unknown>;
    const sparsePublic = Object.entries(updates).find(([path]) => path.startsWith("semesters/2026-sunday/newFriends/sheet26_004_"))?.[1] as Record<string, unknown>;

    expect(createdPublic).toMatchObject({
      decision: "등록",
      assignedClassKey: "1-1-9",
      rosterSync: { studentId: "s1", personId: "person-1", classKey: "1-1-9" },
    });
    expect(updates["semesters/2026-sunday/newFriends/existing/decision"]).toBeUndefined();
    expect(updates["semesters/2026-sunday/newFriends/existing/week2Date"]).toBeUndefined();
    expect(updates["semestersPrivate/2026-sunday/newFriendsPrivate/existing/teamMemo"]).toContain("기존 메모");
    expect(updates["semestersPrivate/2026-sunday/newFriendsPrivate/existing/teamMemo"]).toContain("시트 메모");
    expect(sparsePublic).toMatchObject({ part: "1부", grade: 1, decision: "미정" });
    expect(sparsePublic.rosterSync).toBeUndefined();
    expect(Object.keys(updates).some((path) => path.startsWith("classes/"))).toBe(false);
    expect(report).toMatchObject({ sourceRows: 4, created: 3, updatedExisting: 1, rosterLinked: 1, rosterInferredOnly: 1 });
  });

  it("민감정보가 없는 행에는 Firebase가 보존하지 않는 빈 비공개 객체를 쓰지 않는다", () => {
    const { directory, xlsx } = fixture();
    const updatesFile = resolve(directory, "updates.json");
    const reportFile = resolve(directory, "report.json");
    execFileSync(process.execPath, [
      resolve(process.cwd(), "scripts/new-friend-sheet-migration.mjs"),
      "--xlsx", xlsx,
      "--input", directory,
      "--updates", updatesFile,
      "--report", reportFile,
      "--now", "2026-08-30T10:00:00.000Z",
    ]);

    const updates = JSON.parse(readFileSync(updatesFile, "utf8"));
    const sparsePrivatePath = Object.keys(updates).find((path) => path.startsWith("semestersPrivate/2026-sunday/newFriendsPrivate/sheet26_004_"));
    const emptyPrivatePath = Object.keys(updates).find((path) => path.startsWith("semestersPrivate/2026-sunday/newFriendsPrivate/sheet26_005_"));
    expect(sparsePrivatePath).toBeDefined();
    expect(emptyPrivatePath).toBeUndefined();
  });

  it("같은 시트와 반영된 스냅샷으로 재실행하면 추가 쓰기가 없다", () => {
    const { directory, xlsx } = fixture();
    const firstUpdates = resolve(directory, "first-updates.json");
    const firstReport = resolve(directory, "first-report.json");
    const run = (updates: string, report: string) => execFileSync(process.execPath, [
      resolve(process.cwd(), "scripts/new-friend-sheet-migration.mjs"),
      "--xlsx", xlsx,
      "--input", directory,
      "--updates", updates,
      "--report", report,
      "--now", "2026-08-30T10:00:00.000Z",
    ]);

    run(firstUpdates, firstReport);
    materializeMigration(directory, JSON.parse(readFileSync(firstUpdates, "utf8")));
    const secondUpdates = resolve(directory, "second-updates.json");
    run(secondUpdates, resolve(directory, "second-report.json"));
    expect(JSON.parse(readFileSync(secondUpdates, "utf8"))).toEqual({});
  });
});
