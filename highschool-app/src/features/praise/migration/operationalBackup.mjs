import { checksum, jsonChecksum, migrationFailure, readPrivateFile } from "./io.mjs";

export const OPERATIONAL_BACKUP_FORMAT = "woori-operational-backup-v1";
export const OPERATIONAL_BACKUP_SCOPE = "public tables, account links, public schema metadata; excludes auth secrets/sessions and storage binaries";
const METADATA_ARRAYS = ["enums", "columns", "indexes", "policies", "functions", "constraints", "account_links"];
const BACKUP_FIELDS = new Set(["format", "scope", "exported_at", "project_ref", "tables", ...METADATA_ARRAYS]);

/** 한 개 backup 열과 한 개 데이터 행만 허용한다. SQL·스키마 메타데이터는 실행하지 않는다. */
export function parseOperationalBackupCsv(bytes) {
  if (bytes.length === 0 || bytes.length > 128 * 1024 * 1024) throw migrationFailure("snapshot_csv_size_invalid");
  let input;
  try { input = new TextDecoder("utf-8", { fatal: true }).decode(bytes); }
  catch { throw migrationFailure("snapshot_csv_encoding_invalid"); }
  const rows = [];
  let row = [], field = "", mode = "start", rowStarted = false;
  const endField = () => { row.push(field); field = ""; mode = "start"; };
  const endRow = () => { endField(); rows.push(row); row = []; rowStarted = false; if (rows.length > 2) throw migrationFailure("snapshot_csv_shape_invalid"); };
  for (let index = 0; index < input.length; index++) {
    const char = input[index];
    if (char === "\0") throw migrationFailure("snapshot_csv_syntax_invalid");
    if (mode === "quoted") {
      if (char === '"') {
        if (input[index + 1] === '"') { field += '"'; index++; }
        else mode = "closed";
      } else field += char;
      continue;
    }
    if (char === ",") { endField(); rowStarted = true; continue; }
    if (char === "\n" || char === "\r") {
      if (char === "\r") { if (input[index + 1] !== "\n") throw migrationFailure("snapshot_csv_syntax_invalid"); index++; }
      endRow(); continue;
    }
    if (mode === "closed") throw migrationFailure("snapshot_csv_syntax_invalid");
    if (char === '"') {
      if (mode !== "start") throw migrationFailure("snapshot_csv_syntax_invalid");
      mode = "quoted";
    } else { field += char; mode = "unquoted"; }
    rowStarted = true;
  }
  if (mode === "quoted") throw migrationFailure("snapshot_csv_syntax_invalid");
  if (rowStarted || row.length > 0 || mode !== "start") endRow();
  if (rows.length !== 2 || rows.some((entry) => entry.length !== 1) || rows[0][0] !== "backup") throw migrationFailure("snapshot_csv_shape_invalid");
  let backup;
  try { backup = JSON.parse(rows[1][0]); }
  catch { throw migrationFailure("snapshot_json_invalid"); }
  return backup;
}

function exportedAt(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,9})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.test(value)) throw migrationFailure("snapshot_exported_at_invalid");
  const date = Date.parse(`${value.slice(0, 10)}T00:00:00Z`), instant = Date.parse(value);
  if (!Number.isFinite(date) || new Date(date).toISOString().slice(0, 10) !== value.slice(0, 10) || !Number.isFinite(instant)) throw migrationFailure("snapshot_exported_at_invalid");
  return new Date(instant).toISOString();
}
function record(value) { return value !== null && typeof value === "object" && !Array.isArray(value); }

/** 파일·구조 검증과 원본 동결 증명을 구분한다. 계정 연결은 보호된 보관본에만 남긴다. */
export async function readOperationalBackup(path, requiredTables) {
  const snapshotBytes = await readPrivateFile(path);
  const backup = parseOperationalBackupCsv(snapshotBytes);
  if (!record(backup) || Object.keys(backup).length !== BACKUP_FIELDS.size || Object.keys(backup).some((key) => !BACKUP_FIELDS.has(key))) throw migrationFailure("snapshot_payload_shape_invalid");
  if (backup.format !== OPERATIONAL_BACKUP_FORMAT || backup.scope !== OPERATIONAL_BACKUP_SCOPE) throw migrationFailure("snapshot_format_or_scope_invalid");
  if (typeof backup.project_ref !== "string" || !backup.project_ref.trim() || backup.project_ref.length > 200 || /[\u0000-\u001f\u007f]/.test(backup.project_ref)) throw migrationFailure("snapshot_project_ref_invalid");
  const completedAt = exportedAt(backup.exported_at);
  if (METADATA_ARRAYS.some((field) => !Array.isArray(backup[field]))) throw migrationFailure("snapshot_metadata_shape_invalid");
  if (!record(backup.tables) || Object.keys(backup.tables).length !== requiredTables.length || requiredTables.some((table) => !Object.hasOwn(backup.tables, table) || !Array.isArray(backup.tables[table]))) throw migrationFailure("snapshot_tables_incomplete");
  const tables = backup.tables;
  const tablesBytes = Buffer.from(`${JSON.stringify(tables, null, 2)}\n`);
  const manifest = {
    schemaVersion: 1, schemaContract: "woori-praise-v2-20260905", completedAt,
    sourceFormat: OPERATIONAL_BACKUP_FORMAT, sourceFileChecksum: checksum(snapshotBytes),
    sourceFrozen: false, tablesChecksum: checksum(tablesBytes),
    tables: Object.fromEntries(requiredTables.map((table) => [table, { count: tables[table].length, checksum: jsonChecksum(tables[table]) }])),
    storage: { downloaded: false, complete: false },
  };
  const metadata = Object.fromEntries(Object.entries(backup).filter(([key]) => key !== "tables"));
  return {
    manifest, tables, receipt: null, verifiedFrozen: false, storageVerified: false,
    manifestBytes: Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`), tablesBytes,
    snapshotBytes, metadataBytes: Buffer.from(`${JSON.stringify(metadata, null, 2)}\n`),
  };
}
