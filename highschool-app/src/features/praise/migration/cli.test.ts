import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { chmod, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { applyNewWorkspace, main as importMain } from "../../../../scripts/praise-import.mjs";
import { exportTable, listImportObjects, sourceConfiguration } from "../../../../scripts/praise-export-supabase.mjs";
import { checksum, jsonChecksum, privateDirectory, readVerifiedExport, writeJson } from "./io.mjs";
import { SOURCE_TABLE_KEYS, transformSupabaseSnapshot } from "./transform";
import { fixtureOptions, fixtureTime, sourceFixture, sourceId } from "./fixtures";

let directory: string;
beforeEach(async () => { directory = await mkdtemp(join(tmpdir(), "praise-migration-test-")); vi.stubEnv("FIREBASE_ADMIN_SERVICE_ACCOUNT_JSON", ""); });
afterEach(async () => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks(); await rm(directory, { recursive: true, force: true }); });

async function exported(frozen = false) {
  const path = await privateDirectory(join(directory, "source")); const tables = sourceFixture();
  const tablesChecksum = await writeJson(path, "tables.json", tables);
  const manifest = { schemaVersion: 1, schemaContract: "woori-praise-v2-20260905", completedAt: fixtureTime, sourceFrozen: frozen, tablesChecksum, tables: Object.fromEntries(Object.entries(tables).map(([table, rows]) => [table, { count: rows.length, checksum: jsonChecksum(rows) }])), storage: { downloaded: false, complete: false } };
  const manifestChecksum = await writeJson(path, "manifest.json", manifest);
  if (frozen) await writeJson(path, "verification-receipt.json", { sourceFrozen: true, repeatReadMatched: true, manifestChecksum, tablesChecksum });
  return path;
}

describe("외부 원본 내보내기 경계", () => {
  it("서비스 역할 자격을 환경으로만 받고 익명 키·비 HTTPS 주소를 거절한다", () => {
    expect(() => sourceConfiguration({ NODE_ENV: "test" })).toThrow("supabase_credentials_missing");
    expect(() => sourceConfiguration({ NODE_ENV: "test", SUPABASE_URL: "https://source.example", SUPABASE_SERVICE_ROLE_KEY: "anon" })).toThrow("supabase_service_role_required");
    expect(() => sourceConfiguration({ NODE_ENV: "test", SUPABASE_URL: "http://source.example", SUPABASE_SERVICE_ROLE_KEY: "sb_secret_test" })).toThrow("supabase_url_invalid");
    expect(sourceConfiguration({ NODE_ENV: "test", SUPABASE_URL: "https://source.example", SUPABASE_SERVICE_ROLE_KEY: "sb_secret_test" }).origin).toBe("https://source.example");
  });
  it("PK 순서·실제 응답 행 수로 pagination하며 비밀키를 URL에 넣지 않는다", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify([{ id: "one" }, { id: "two" }]), { headers: { "content-range": "0-1/3" } })).mockResolvedValueOnce(new Response(JSON.stringify([{ id: "three" }]), { headers: { "content-range": "2-2/3" } }));
    vi.stubGlobal("fetch", fetcher);
    expect(await exportTable({ origin: "https://source.example", key: "test-only" }, "students", ["id"])).toHaveLength(3);
    expect(fetcher.mock.calls[1][0]).toContain("offset=2");
    expect(fetcher.mock.calls.every(([url, init]) => !url.includes("test-only") && init.method === undefined && init.redirect === "error")).toBe(true);
  });
  it("도중 행 수가 변하거나 페이지가 중복되면 완전한 내보내기로 처리하지 않는다", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(new Response('[{"id":"one"}]', { headers: { "content-range": "0-0/2" } })).mockResolvedValueOnce(new Response('[{"id":"two"}]', { headers: { "content-range": "1-1/3" } })); vi.stubGlobal("fetch", fetcher);
    await expect(exportTable({ origin: "https://source.example", key: "test" }, "students", ["id"])).rejects.toThrow("source_changed_during_export");
    fetcher.mockResolvedValue(new Response('[{"id":"same"},{"id":"same"}]', { headers: { "content-range": "0-1/2" } }));
    await expect(exportTable({ origin: "https://source.example", key: "test" }, "students", ["id"])).rejects.toThrow("source_duplicate_page_rows");
  });
  it("Storage는 list 조회 POST만 사용해 폴더 안 원본 파일까지 찾는다", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(new Response('[{"name":"folder","id":null}]')).mockResolvedValueOnce(new Response('[{"name":"file.csv","id":"object-id"}]')); vi.stubGlobal("fetch", fetcher);
    expect(await listImportObjects({ origin: "https://source.example", key: "test" })).toEqual(["folder/file.csv"]);
    expect(fetcher.mock.calls.every(([url, init]) => url.endsWith("/object/list/imports") && init.method === "POST")).toBe(true);
  });
});

describe("소유자 전용 산출물 및 dry-run", () => {
  it("파일 SHA·테이블 SHA·건수를 대조하고 동결 없는 snapshot은 미확인으로 남긴다", async () => {
    const path = await exported(); const result = await readVerifiedExport(path, Object.keys(SOURCE_TABLE_KEYS));
    expect(result.verifiedFrozen).toBe(false); expect(result.storageVerified).toBe(false);
    await writeFile(join(path, "tables.json"), "{}", { mode: 0o600 });
    await expect(readVerifiedExport(path, Object.keys(SOURCE_TABLE_KEYS))).rejects.toThrow("export_checksum_mismatch");
  });
  it("다른 사용자가 읽을 수 있는 원본 파일을 거절한다", async () => {
    const path = await exported(); await chmod(join(path, "tables.json"), 0o644);
    await expect(readVerifiedExport(path, Object.keys(SOURCE_TABLE_KEYS))).rejects.toThrow("input_file_not_owner_only");
  });
  it("Firebase 자격정보 없이 변환·원본 보존·대조보고서를 완성하며 네트워크를 사용하지 않는다", async () => {
    const input = await exported(); const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher); vi.spyOn(console, "log").mockImplementation(() => {});
    const output = join(directory, "converted"); const result = await importMain(["--input", input, "--term", sourceId(1), "--workspace", "target-test", "--out", output, "--late-as-present"]);
    expect(result?.mode).toBe("dry-run"); expect(fetcher).not.toHaveBeenCalled();
    expect((await stat(output)).mode & 0o777).toBe(0o700); expect((await stat(join(output, "converted-state.json"))).mode & 0o777).toBe(0o600);
    const state = JSON.parse(await readFile(join(output, "converted-state.json"), "utf8"));
    expect(state.meta.mode).toBe("shadow"); expect(state.meta.importBlockers).toEqual(expect.arrayContaining(["source_snapshot_unverified", "source_storage_incomplete", "historical_group_unresolved"]));
    expect(checksum(await readFile(join(output, "source-tables.json")))).toBe(checksum(await readFile(join(input, "tables.json"))));
  });
  it("--apply만으로 쓰지 않고 먼저 dry-run 산출물을 남긴다", async () => {
    const input = await exported(); vi.spyOn(console, "log").mockImplementation(() => {}); const output = join(directory, "converted");
    await expect(importMain(["--input", input, "--term", sourceId(1), "--workspace", "target", "--out", output, "--late-as-present", "--apply"])).rejects.toThrow("apply_backup_and_freeze_required");
    expect(JSON.parse(await readFile(join(output, "converted-state.json"), "utf8")).meta.mode).toBe("shadow");
  });
  it("동결·백업 플래그가 있어도 검증된 동결 영수증 없이는 적용하지 않는다", async () => {
    const input = await exported();
    await expect(importMain(["--input", input, "--term", sourceId(1), "--workspace", "target", "--out", join(directory, "converted"), "--late-as-present", "--apply", "--source-frozen", "--backup-dir", join(directory, "backup")])).rejects.toThrow("verified_frozen_export_required");
  });
  it("검증 영수증이 있어도 명시 Admin 환경설정 없이는 SDK 연결을 하지 않는다", async () => {
    const input = await exported(true);
    await expect(importMain(["--input", input, "--term", sourceId(1), "--workspace", "target", "--out", join(directory, "converted"), "--late-as-present", "--apply", "--source-frozen", "--backup-dir", join(directory, "backup")])).rejects.toThrow("firebase_admin_configuration_required");
  });
  it("설치나 Firebase 자격정보 없이 실제 Node 프로세스에서도 dry-run을 실행할 수 있다", async () => {
    const input = await exported(); const output = join(directory, "node-output");
    const result = await promisify(execFile)(process.execPath, [join(process.cwd(), "scripts/praise-import.mjs"), "--input", input, "--term", sourceId(1), "--workspace", "node-test", "--out", output, "--late-as-present"], { env: { PATH: process.env.PATH, NODE_ENV: "test" } });
    expect(JSON.parse(result.stdout).mode).toBe("dry-run");
    expect(JSON.parse(await readFile(join(output, "converted-state.json"), "utf8")).meta.id).toBe("node-test");
  });
});

describe("신규 workspace 원자 적용", () => {
  it("null 백업을 먼저 기록하고 한 번만 생성하며 재실행은 no-op이다", async () => {
    const state = transformSupabaseSnapshot(sourceFixture(), fixtureOptions).state;
    let current: unknown = null; const transaction = vi.fn(async (updater: (row: unknown) => unknown) => { expect(JSON.parse(await readFile(join(directory, "first", "target-before.json"), "utf8"))).toBeNull(); current = updater(current); return { committed: true, snapshot: { val: () => current } }; });
    const reference = { get: async () => ({ val: () => current }), transaction }; const database = { ref: vi.fn<(path: string) => typeof reference>().mockReturnValue(reference) };
    const first = await privateDirectory(join(directory, "first"));
    expect(await applyNewWorkspace(database, state, first)).toEqual({ applied: true, alreadyApplied: false, verified: true });
    const second = await privateDirectory(join(directory, "second"));
    expect(await applyNewWorkspace(database, state, second)).toEqual({ applied: false, alreadyApplied: true, verified: true }); expect(transaction).toHaveBeenCalledTimes(1);
    expect(database.ref.mock.calls.every(([path]) => path === "praiseOps/migration-test")).toBe(true);
  });
  it("기존 workspace 또는 생성 중 다른 쓰기가 들어온 경우 덮어쓰지 않는다", async () => {
    const state = transformSupabaseSnapshot(sourceFixture(), fixtureOptions).state; const existing = { private: "test-only" };
    const transaction = vi.fn(); const path = await privateDirectory(join(directory, "existing"));
    await expect(applyNewWorkspace({ ref: () => ({ get: async () => ({ val: () => existing }), transaction }) }, state, path)).rejects.toThrow("target_workspace_already_exists"); expect(transaction).not.toHaveBeenCalled();
    const race = await privateDirectory(join(directory, "race")); const racedTransaction = vi.fn(async (updater: (value: unknown) => unknown) => { expect(updater(existing)).toBeUndefined(); return { committed: false, snapshot: { val: () => existing } }; });
    await expect(applyNewWorkspace({ ref: () => ({ get: async () => ({ val: () => null }), transaction: racedTransaction }) }, state, race)).rejects.toThrow("target_workspace_created_concurrently");
  });
});
