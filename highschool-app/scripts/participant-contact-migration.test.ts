import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const tempDirs: string[] = [];
afterEach(() => tempDirs.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true })));

function runMigration(retreats: unknown, retreatsPrivate: unknown = null) {
  const dir = mkdtempSync(join(tmpdir(), "woori-participant-contact-test-"));
  tempDirs.push(dir);
  writeFileSync(join(dir, "retreats.json"), JSON.stringify(retreats));
  writeFileSync(join(dir, "retreatsPrivate.json"), JSON.stringify(retreatsPrivate));
  const updatesFile = join(dir, "updates.json");
  const reportFile = join(dir, "report.json");
  execFileSync(process.execPath, [resolve(process.cwd(), "scripts/participant-contact-migration.mjs"), "--input", dir, "--updates", updatesFile, "--report", reportFile]);
  return {
    updates: JSON.parse(readFileSync(updatesFile, "utf8")) as Record<string, unknown>,
    report: JSON.parse(readFileSync(reportFile, "utf8")) as Record<string, unknown>,
  };
}

describe("수련회 참가자 연락처 운영 DB 마이그레이션", () => {
  it("공개 연락처를 같은 참가자 키의 비공개 레코드로 옮기고 공개 필드를 삭제한다", () => {
    const { updates, report } = runMigration({ summer: { participants: {
      p_0: { name: "김학생", phone: " 010-1111 ", pPhone: "010-2222" },
      p_1: { name: "이학생" },
    } } });
    expect(updates).toEqual({
      "retreatsPrivate/summer/participantContacts/p_0": { phone: "010-1111", pPhone: "010-2222" },
      "retreats/summer/participants/p_0/phone": null,
      "retreats/summer/participants/p_0/pPhone": null,
    });
    expect(report).toMatchObject({ participants: 2, contactParticipants: 1, updatePaths: 3, conflicts: [] });
  });

  it("이미 있는 비공개 값은 덮지 않고 충돌을 보고한다", () => {
    const { updates, report } = runMigration(
      { summer: { participants: { p_0: { name: "김학생", phone: "010-public" } } } },
      { summer: { participantContacts: { p_0: { phone: "010-private" } } } },
    );
    expect(updates).toEqual({ "retreats/summer/participants/p_0/phone": null });
    expect(report.conflicts).toEqual(["summer/p_0/phone"]);
  });

  it("기존 공개·비공개 백업 경로는 업데이트 계획에 포함하지 않는다", () => {
    const { updates, report } = runMigration({ summer: {
      participants: { p_0: { name: "김학생", phone: "010-1" } },
      participantsBackups: { old: { p_0: { phone: "010-old" } } },
    } });
    expect(Object.keys(updates).every((path) => !path.includes("Backups"))).toBe(true);
    expect(report.untouched).toEqual(["retreats/*/participantsBackups", "retreatsPrivate/*/participantContactsBackups"]);
  });
});
