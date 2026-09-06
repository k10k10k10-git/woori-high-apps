import { createHash } from "node:crypto";
import { lstat, mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";

export function migrationFailure(code) { const error = new Error(`이관 도구 실패: ${code}`); error.code = code; return error; }
export function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  const result = JSON.stringify(value); if (result === undefined) throw migrationFailure("unsupported_json"); return result;
}
export const checksum = (value) => createHash("sha256").update(value).digest("hex");
export const jsonChecksum = (value) => checksum(canonical(value));
export async function privateDirectory(path) {
  const directory = resolve(path);
  try { await mkdir(directory, { mode: 0o700 }); }
  catch { throw migrationFailure("output_directory_must_be_new"); }
  return directory;
}
export async function privateFile(path, data) {
  await writeFile(path, data, { mode: 0o600, flag: "wx" });
}
export async function writeJson(directory, filename, value) {
  const content = `${JSON.stringify(value, null, 2)}\n`; await privateFile(join(directory, filename), content); return checksum(content);
}
export async function readPrivateFile(path) {
  const info = await lstat(path);
  if (!info.isFile() || (info.mode & 0o077) !== 0 || (typeof process.getuid === "function" && info.uid !== process.getuid())) throw migrationFailure("input_file_not_owner_only");
  return readFile(path);
}
export function parseArguments(args, valued, flags) {
  const result = {};
  for (let index = 0; index < args.length; index++) {
    const argument = args[index];
    if (!argument.startsWith("--") || Object.hasOwn(result, argument.slice(2))) throw migrationFailure("invalid_arguments");
    const key = argument.slice(2);
    if (flags.includes(key)) result[key] = true;
    else if (valued.includes(key) && args[index + 1] && !args[index + 1].startsWith("--")) result[key] = args[++index];
    else throw migrationFailure("invalid_arguments");
  }
  return result;
}
export function safeFailureCode(error) {
  return typeof error?.code === "string" && /^[a-z0-9_]{1,100}$/.test(error.code) ? error.code : "operation_failed_check_private_inputs";
}

export async function readVerifiedExport(directory, requiredTables) {
  const manifestBytes = await readPrivateFile(join(directory, "manifest.json"));
  const tablesBytes = await readPrivateFile(join(directory, "tables.json"));
  let manifest, tables;
  try { manifest = JSON.parse(manifestBytes.toString("utf8")); tables = JSON.parse(tablesBytes.toString("utf8")); }
  catch { throw migrationFailure("invalid_export_json"); }
  if (manifest.schemaVersion !== 1 || manifest.schemaContract !== "woori-praise-v2-20260905" || manifest.tablesChecksum !== checksum(tablesBytes)) throw migrationFailure("export_checksum_mismatch");
  for (const table of requiredTables) {
    const rows = tables[table]; const detail = manifest.tables?.[table];
    if (!Array.isArray(rows) || !detail || detail.count !== rows.length || detail.checksum !== jsonChecksum(rows)) throw migrationFailure("table_checksum_mismatch");
  }
  let receipt = null;
  try { receipt = JSON.parse((await readPrivateFile(join(directory, "verification-receipt.json"))).toString("utf8")); }
  catch (error) { if (error?.code !== "ENOENT") throw migrationFailure("verification_receipt_invalid"); }
  const verifiedFrozen = manifest.sourceFrozen === true && receipt?.sourceFrozen === true && receipt?.repeatReadMatched === true && receipt?.manifestChecksum === checksum(manifestBytes) && receipt?.tablesChecksum === checksum(tablesBytes);
  let storageVerified = manifest.storage?.downloaded === true && manifest.storage?.complete === true;
  if (storageVerified) {
    if (!Array.isArray(manifest.storage.objects)) throw migrationFailure("storage_manifest_invalid");
    const paths = new Set();
    for (const object of manifest.storage.objects) {
      if (typeof object.objectPath !== "string" || object.localFile !== `${checksum(object.objectPath)}.bin` || !/^[a-f0-9]{64}\.bin$/.test(object.localFile) || !/^[a-f0-9]{64}$/.test(object.checksum) || paths.has(object.objectPath)) throw migrationFailure("storage_manifest_invalid");
      paths.add(object.objectPath);
      const bytes = await readPrivateFile(join(directory, "storage", object.localFile));
      if (bytes.length !== object.bytes || checksum(bytes) !== object.checksum) throw migrationFailure("storage_checksum_mismatch");
    }
    storageVerified = manifest.storage.objects.length === manifest.storage.count && tables.import_batches.every((row) => paths.has(row.object_path));
  }
  return { manifest, tables, receipt, verifiedFrozen, storageVerified, manifestBytes, tablesBytes };
}
