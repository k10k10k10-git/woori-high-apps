import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { checksum } from "./io.mjs";
import { OPERATIONAL_BACKUP_FORMAT, OPERATIONAL_BACKUP_SCOPE, parseOperationalBackupCsv, readOperationalBackup } from "./operationalBackup.mjs";
import { sourceFixture, fixtureTime } from "./fixtures";
import { SOURCE_TABLE_KEYS } from "./transform";

let directory: string;
beforeEach(async () => { directory = await mkdtemp(join(tmpdir(), "praise-snapshot-test-")); });
afterEach(async () => { await rm(directory, { recursive: true, force: true }); });

function payload(): Record<string, unknown> {
  return {
    format: OPERATIONAL_BACKUP_FORMAT, scope: OPERATIONAL_BACKUP_SCOPE,
    exported_at: fixtureTime, project_ref: "synthetic-project",
    tables: sourceFixture(), enums: [], columns: [], indexes: [], policies: [],
    functions: [{ definition: "PRIVATE_METADATA_SENTINEL\r\nSQL, \"문자열\"" }], constraints: [],
    account_links: [{ id: "source-account", email: "PRIVATE_ACCOUNT_SENTINEL", raw_user_meta_data: {} }],
  };
}
const csv = (value: unknown) => `backup\r\n"${JSON.stringify(value).replaceAll('"', '""')}"\r\n`;
async function read(value: unknown = payload()) {
  const path = join(directory, "source.csv");
  await writeFile(path, csv(value), { mode: 0o600 });
  return readOperationalBackup(path, Object.keys(SOURCE_TABLE_KEYS));
}

describe("단일 SQL 결과 백업 CSV", () => {
  it("BOM·CRLF·RFC 인용부호와 내부 줄바꿈을 보존해 단일 JSON을 추출한다", () => {
    const value = payload();
    expect(parseOperationalBackupCsv(Buffer.from(`\uFEFF${csv(value)}`))).toEqual(value);
    const multiline = `"backup"\n"${JSON.stringify(value, null, 2).replaceAll('"', '""')}"`;
    expect(parseOperationalBackupCsv(Buffer.from(multiline))).toEqual(value);
  });

  for (const [label, value] of [
    ["추가 열", 'backup,extra\n"{}",value\n'],
    ["추가 데이터 행", 'backup\n"{}"\n"{}"\n'],
    ["추가 빈 행", 'backup\n"{}"\n\n'],
    ["다른 헤더", 'data\n"{}"\n'],
    ["닫히지 않은 인용부호", 'backup\n"{}'],
    ["닫힌 필드 뒤 문자", 'backup\n"{}"x\n'],
    ["비인용 필드 내부 인용부호", 'backup\na"b\n'],
    ["단독 CR 구분자", 'backup\r"{}"'],
    ["NUL", 'backup\n"\0"'],
    ["잘못된 JSON", 'backup\n"not-json"\n'],
  ]) it(`${label}는 입력값을 노출하지 않고 거절한다`, () => {
    expect(() => parseOperationalBackupCsv(Buffer.from(value))).toThrow(/snapshot_(csv|json)_/);
  });

  it("잘못된 UTF-8을 대체문자로 바꾸지 않는다", () => {
    expect(() => parseOperationalBackupCsv(Buffer.from([0xff, 0xfe]))).toThrow("snapshot_csv_encoding_invalid");
  });

  it("필수 메타데이터와 테이블을 검증하되 동결·Storage 완료를 만들어내지 않는다", async () => {
    const original = payload();
    original.exported_at = "2026-09-06T07:15:04.112421+00:00";
    const result = await read(original);
    expect(result.verifiedFrozen).toBe(false); expect(result.storageVerified).toBe(false); expect(result.receipt).toBeNull();
    expect(result.manifest).toMatchObject({ sourceFrozen: false, sourceFormat: OPERATIONAL_BACKUP_FORMAT, completedAt: "2026-09-06T07:15:04.112Z" });
    expect(result.manifest.sourceFileChecksum).toBe(checksum(Buffer.from(csv(original))));
    expect(JSON.parse(result.metadataBytes.toString())).toMatchObject({ account_links: original.account_links, functions: original.functions });
    expect(JSON.parse(result.metadataBytes.toString())).not.toHaveProperty("tables");
    expect(result.tables).toEqual(original.tables);
  });

  for (const [field, value, code] of [
    ["format", "unknown", "snapshot_format_or_scope_invalid"],
    ["scope", "full database", "snapshot_format_or_scope_invalid"],
    ["project_ref", " ", "snapshot_project_ref_invalid"],
    ["exported_at", "2026-02-30T01:00:00Z", "snapshot_exported_at_invalid"],
    ["exported_at", "2026-09-06", "snapshot_exported_at_invalid"],
    ["account_links", {}, "snapshot_metadata_shape_invalid"],
    ["functions", "execute this", "snapshot_metadata_shape_invalid"],
  ] as const) it(`${field} 계약이 다르면 거절한다 (${code})`, async () => {
    await expect(read({ ...payload(), [field]: value })).rejects.toThrow(code);
  });

  it("누락된 공개 테이블이나 메타데이터를 빈 값으로 보충하지 않는다", async () => {
    const value = payload(); delete (value.tables as Record<string, unknown>).stage_candidates;
    await expect(read(value)).rejects.toThrow("snapshot_tables_incomplete");
    const missing = payload(); delete missing.columns;
    await expect(read(missing)).rejects.toThrow("snapshot_payload_shape_invalid");
  });

  it("형식에 없는 auth 비밀 필드를 허용하지 않는다", async () => {
    await expect(read({ ...payload(), auth_secrets: [] })).rejects.toThrow("snapshot_payload_shape_invalid");
  });

  it("입력은 소유자 전용 사본만 읽고 원본 권한을 바꾸지 않는다", async () => {
    const path = join(directory, "source.csv");
    await writeFile(path, csv(payload()), { mode: 0o600 }); await chmod(path, 0o644);
    await expect(readOperationalBackup(path, Object.keys(SOURCE_TABLE_KEYS))).rejects.toThrow("input_file_not_owner_only");
  });
});
