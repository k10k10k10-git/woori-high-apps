import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { mkdir } from "node:fs/promises";
import { canonical, checksum, jsonChecksum, migrationFailure, parseArguments, privateDirectory, privateFile, safeFailureCode, writeJson } from "../src/features/praise/migration/io.mjs";

export function sourceConfiguration(environment = process.env) {
  const value = environment.SUPABASE_URL; const key = environment.SUPABASE_SERVICE_ROLE_KEY;
  if (!value || !key) throw migrationFailure("supabase_credentials_missing");
  let url; try { url = new URL(value); } catch { throw migrationFailure("supabase_url_invalid"); }
  if (url.protocol !== "https:" || url.username || url.password || url.port || !["", "/"].includes(url.pathname) || url.search || url.hash) throw migrationFailure("supabase_url_invalid");
  let privileged = key.startsWith("sb_secret_");
  if (!privileged) { try { privileged = JSON.parse(Buffer.from(key.split(".")[1], "base64url").toString("utf8")).role === "service_role"; } catch { /* 원문은 오류에 넣지 않는다. */ } }
  if (!privileged) throw migrationFailure("supabase_service_role_required");
  return { origin: url.origin, key };
}
async function sourceRequest(config, path, options = {}) {
  let response;
  try { response = await fetch(`${config.origin}${path}`, { ...options, headers: { apikey: config.key, Authorization: `Bearer ${config.key}`, ...options.headers }, redirect: "error", signal: AbortSignal.timeout(30000) }); }
  catch { throw migrationFailure("source_network_failed"); }
  if (!response.ok) throw migrationFailure("source_read_failed");
  return response;
}

export async function exportTable(config, table, keys) {
  const rows = []; let total;
  while (total === undefined || rows.length < total) {
    const params = new URLSearchParams({ select: "*", order: keys.map((key) => `${key}.asc`).join(","), limit: "500", offset: String(rows.length) });
    const response = await sourceRequest(config, `/rest/v1/${table}?${params}`, { headers: { Prefer: "count=exact" } });
    const count = Number(response.headers.get("content-range")?.match(/\/(\d+)$/)?.[1]);
    if (!Number.isSafeInteger(count) || count < 0 || (total !== undefined && total !== count)) throw migrationFailure("source_changed_during_export");
    total = count;
    const page = await response.json();
    if (!Array.isArray(page) || (!page.length && rows.length < total) || rows.length + page.length > total) throw migrationFailure("source_pagination_invalid");
    rows.push(...page);
    if (!page.length) break;
  }
  const unique = new Set(rows.map((row) => canonical(keys.map((key) => row[key]))));
  if (unique.size !== rows.length) throw migrationFailure("source_duplicate_page_rows");
  return rows;
}
async function exportTables(config, tableKeys) {
  const tables = {};
  for (const [table, keys] of Object.entries(tableKeys)) tables[table] = await exportTable(config, table, keys);
  return tables;
}

export async function listImportObjects(config) {
  const names = []; const folders = [""]; const seen = new Set();
  while (folders.length) {
    const prefix = folders.shift(); if (seen.has(prefix)) throw migrationFailure("storage_listing_cycle"); seen.add(prefix);
    let offset = 0;
    for (;;) {
      // Supabase Storage의 POST list는 메타데이터 조회 API이며 객체를 쓰지 않는다.
      const response = await sourceRequest(config, "/storage/v1/object/list/imports", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prefix, limit: 500, offset, sortBy: { column: "name", order: "asc" } }) });
      const rows = await response.json(); if (!Array.isArray(rows)) throw migrationFailure("storage_listing_invalid");
      for (const row of rows) {
        if (typeof row.name !== "string" || !row.name || row.name.includes("/") || [".", ".."].includes(row.name)) throw migrationFailure("storage_name_invalid");
        const name = prefix ? `${prefix}/${row.name}` : row.name;
        if (row.id === null) folders.push(name); else if (typeof row.id === "string") names.push(name); else throw migrationFailure("storage_listing_invalid");
      }
      offset += rows.length; if (rows.length < 500) break;
    }
  }
  if (new Set(names).size !== names.length) throw migrationFailure("storage_duplicate_object");
  return names.sort();
}
async function exportStorage(config, directory, tables) {
  const names = await listImportObjects(config); const files = []; const storageDirectory = join(directory, "storage");
  await mkdir(storageDirectory, { mode: 0o700 });
  for (const name of names) {
    const response = await sourceRequest(config, `/storage/v1/object/authenticated/imports/${name.split("/").map(encodeURIComponent).join("/")}`);
    const bytes = Buffer.from(await response.arrayBuffer()); const localFile = `${checksum(name)}.bin`;
    await privateFile(join(storageDirectory, localFile), bytes);
    files.push({ objectPath: name, localFile, bytes: bytes.length, checksum: checksum(bytes) });
  }
  const after = await listImportObjects(config);
  const namesStable = canonical(names) === canonical(after);
  let contentsStable = namesStable;
  if (namesStable) for (const object of files) {
    const response = await sourceRequest(config, `/storage/v1/object/authenticated/imports/${object.objectPath.split("/").map(encodeURIComponent).join("/")}`);
    if (checksum(Buffer.from(await response.arrayBuffer())) !== object.checksum) contentsStable = false;
  }
  const present = new Set(names); const referencedMissing = tables.import_batches.filter((row) => typeof row.object_path !== "string" || !present.has(row.object_path)).length;
  return { downloaded: true, complete: namesStable && contentsStable && referencedMissing === 0, repeatReadMatched: contentsStable, count: files.length, referencedMissing, objects: files };
}

export async function main(args = process.argv.slice(2)) {
  const options = parseArguments(args, ["out"], ["help", "source-frozen", "download-imports"]);
  if (options.help) { console.log("Node 22.18+ 필요. env SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY 사용. 옵션: --out <새 디렉터리> [--source-frozen] [--download-imports]. 원본 DB/계정/Storage 쓰기는 하지 않습니다."); return; }
  if (!options.out) throw migrationFailure("output_directory_required");
  const { SOURCE_TABLE_KEYS, validateSourceTables } = await import(new URL("../src/features/praise/migration/transform.ts", import.meta.url));
  const config = sourceConfiguration(); const directory = await privateDirectory(options.out); const startedAt = new Date().toISOString();
  const tables = await exportTables(config, SOURCE_TABLE_KEYS); validateSourceTables(tables);
  const storage = options["download-imports"] ? await exportStorage(config, directory, tables) : { downloaded: false, complete: false, count: 0, objects: [] };
  const repeated = await exportTables(config, SOURCE_TABLE_KEYS);
  const repeatReadMatched = jsonChecksum(tables) === jsonChecksum(repeated);
  const tablesChecksum = await writeJson(directory, "tables.json", tables);
  const manifest = { schemaVersion: 1, schemaContract: "woori-praise-v2-20260905", sourceOriginHash: checksum(config.origin), startedAt, completedAt: new Date().toISOString(), sourceFrozen: options["source-frozen"] === true,
    consistency: "paginated_repeat_read_not_database_transaction", tablesChecksum,
    tables: Object.fromEntries(Object.entries(tables).map(([table, rows]) => [table, { count: rows.length, checksum: jsonChecksum(rows) }])), storage };
  const manifestChecksum = await writeJson(directory, "manifest.json", manifest);
  await writeJson(directory, "verification-receipt.json", { schemaVersion: 1, checkedAt: new Date().toISOString(), manifestChecksum, tablesChecksum, repeatReadMatched, sourceFrozen: options["source-frozen"] === true, databaseTransactionSnapshot: false, completeSnapshotClaim: false, note: "동결은 실행자의 선언이며, 반복 조회 일치는 DB 트랜잭션 스냅샷이나 외부 입력 차단을 증명하지 않습니다." });
  console.log(JSON.stringify({ exportedTables: Object.keys(tables).length, totalRows: Object.values(tables).reduce((sum, rows) => sum + rows.length, 0), storageFiles: storage.count, repeatReadMatched, sourceFrozenDeclared: options["source-frozen"] === true, completeSnapshotClaim: false }));
  if (!repeatReadMatched) throw migrationFailure("source_changed_repeat_export_required");
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) main().catch((error) => { console.error(safeFailureCode(error)); process.exitCode = 1; });
