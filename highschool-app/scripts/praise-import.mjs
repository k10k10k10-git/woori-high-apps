import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { canonical, checksum, migrationFailure, parseArguments, privateDirectory, privateFile, readPrivateFile, readVerifiedExport, safeFailureCode, writeJson } from "../src/features/praise/migration/io.mjs";

/** RTDB의 빈 노드 삭제 및 배열/숫자 키 표현 차이를 반영한 저장값 대조. */
export function rtdbCanonical(value) {
  if (value === null || value === undefined) return undefined;
  if (typeof value !== "object") return value;
  const entries = Object.entries(value).map(([key, item]) => [key, rtdbCanonical(item)]).filter(([, item]) => item !== undefined);
  return entries.length ? Object.fromEntries(entries) : undefined;
}
function sameState(a, b) { return canonical(rtdbCanonical(a) ?? null) === canonical(rtdbCanonical(b) ?? null); }

export async function applyNewWorkspace(database, state, backupDirectory) {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(state.meta.id) || ["__proto__", "constructor", "prototype"].includes(state.meta.id) || state.meta.mode !== "shadow") throw migrationFailure("invalid_target_workspace");
  const reference = database.ref(`praiseOps/${state.meta.id}`);
  const before = (await reference.get()).val();
  await writeJson(backupDirectory, "target-before.json", before);
  await writeJson(backupDirectory, "target-intent.json", { path: `praiseOps/${state.meta.id}`, stateChecksum: checksum(canonical(state)), createdAt: new Date().toISOString() });
  if (before !== null) {
    if (sameState(before, state)) return { applied: false, alreadyApplied: true, verified: true };
    throw migrationFailure("target_workspace_already_exists");
  }
  // 최초 캐시가 null이어도 서버와 충돌하면 재평가한다. 기존 workspace에는 절대 값을 반환하지 않는다.
  const transaction = await reference.transaction((current) => current === null ? state : undefined, undefined, false);
  if (!transaction.committed) {
    if (sameState(transaction.snapshot.val(), state)) return { applied: false, alreadyApplied: true, verified: true };
    throw migrationFailure("target_workspace_created_concurrently");
  }
  const after = (await reference.get()).val();
  const verified = sameState(after, state);
  await writeJson(backupDirectory, "target-after.json", after);
  return { applied: true, alreadyApplied: false, verified };
}

function adminConfiguration(environment = process.env) {
  try {
    if (environment.FIREBASE_DATABASE_EMULATOR_HOST || environment.FIREBASE_AUTH_EMULATOR_HOST) throw new Error();
    const projectId = environment.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
    const value = environment.NEXT_PUBLIC_FIREBASE_DATABASE_URL;
    const source = JSON.parse(environment.FIREBASE_ADMIN_SERVICE_ACCOUNT_JSON ?? "");
    if (!projectId || !value || source.type !== "service_account" || source.project_id !== projectId || typeof source.client_email !== "string" || !source.client_email.endsWith(`@${projectId}.iam.gserviceaccount.com`) || typeof source.private_key !== "string" || !source.private_key.startsWith("-----BEGIN PRIVATE KEY-----")) throw new Error();
    const url = new URL(value); const prefix = `${projectId}-default-rtdb`;
    const allowed = url.hostname === `${projectId}.firebaseio.com` || url.hostname === `${prefix}.firebaseio.com` || (url.hostname.startsWith(`${prefix}.`) && /^[a-z0-9-]+\.firebasedatabase\.app$/.test(url.hostname.slice(prefix.length + 1)));
    if (url.protocol !== "https:" || url.username || url.password || url.port || url.search || url.hash || !["", "/"].includes(url.pathname) || !allowed) throw new Error();
    return { projectId, databaseURL: url.origin, serviceAccount: { projectId, clientEmail: source.client_email, privateKey: source.private_key } };
  } catch { throw migrationFailure("firebase_admin_configuration_required"); }
}

export async function main(args = process.argv.slice(2)) {
  const options = parseArguments(args, ["input", "term", "workspace", "out", "map", "backup-dir"], ["help", "late-as-present", "apply", "source-frozen", "apply-access-map"]);
  if (options.help) { console.log("Node 22.18+ 필요. 기본 dry-run: --input <export 디렉터리> --term <원본 UUID> --workspace <신규 ID> --out <새 디렉터리> [--map <0600 JSON>] [--late-as-present]. 운영 적용은 --apply --backup-dir <새 디렉터리> --source-frozen 및 Admin 환경변수가 모두 필요. 계정 매핑이 있으면 --apply-access-map 추가."); return; }
  if (!options.input || !options.term || !options.workspace || !options.out) throw migrationFailure("required_arguments_missing");
  const { SOURCE_TABLE_KEYS, transformSupabaseSnapshot } = await import(new URL("../src/features/praise/migration/transform.ts", import.meta.url));
  const exported = await readVerifiedExport(resolve(options.input), Object.keys(SOURCE_TABLE_KEYS));
  const mapping = options.map ? JSON.parse((await readPrivateFile(resolve(options.map))).toString("utf8")) : undefined;
  const converted = transformSupabaseSnapshot(exported.tables, { termId: options.term, workspaceId: options.workspace, sourceAsOf: exported.manifest.completedAt, checksum: exported.manifest.tablesChecksum, lateAsPresent: options["late-as-present"] === true, map: mapping });
  const blockers = [...(converted.state.meta.importBlockers ?? [])];
  if (!exported.verifiedFrozen) blockers.push("source_snapshot_unverified");
  if (!exported.storageVerified) blockers.push("source_storage_incomplete");
  if (blockers.length) converted.state.meta.importBlockers = [...new Set(blockers)];
  const directory = await privateDirectory(options.out);
  // 변환 산출물도 개인정보다. 원본을 덮어쓰지 않고 소유자 전용 사본을 함께 보존한다.
  await privateFile(join(directory, "source-tables.json"), exported.tablesBytes);
  await privateFile(join(directory, "source-manifest.json"), exported.manifestBytes);
  if (exported.receipt) await writeJson(directory, "source-verification-receipt.json", exported.receipt);
  const stateChecksum = await writeJson(directory, "converted-state.json", converted.state);
  await writeJson(directory, "comparison-report.json", { ...converted.report, importBlockers: blockers, snapshotVerifiedFrozen: exported.verifiedFrozen, storageVerified: exported.storageVerified, stateChecksum, sourceTablesChecksum: exported.manifest.tablesChecksum });
  const summary = { mode: "dry-run", sourceRows: Object.values(converted.report.sourceCounts).reduce((sum, count) => sum + count, 0), targetCounts: converted.report.targetCounts, lateConverted: converted.report.lateConverted, liveBlocked: blockers.length > 0 };
  if (!options.apply) { console.log(JSON.stringify(summary)); return summary; }
  if (!options["backup-dir"] || options["source-frozen"] !== true) throw migrationFailure("apply_backup_and_freeze_required");
  if (!exported.verifiedFrozen) throw migrationFailure("verified_frozen_export_required");
  if (Object.keys(converted.state.access).length > 0 && options["apply-access-map"] !== true) throw migrationFailure("explicit_access_map_apply_required");
  const config = adminConfiguration(); const backupDirectory = await privateDirectory(options["backup-dir"]);
  await privateFile(join(backupDirectory, "source-manifest.json"), exported.manifestBytes);
  await writeJson(backupDirectory, "intended-state.json", converted.state);
  const { cert, initializeApp, deleteApp } = await import("firebase-admin/app");
  const { getDatabase } = await import("firebase-admin/database");
  const app = initializeApp({ projectId: config.projectId, databaseURL: config.databaseURL, credential: cert(config.serviceAccount) }, "praise-migration-cli");
  try {
    const result = await applyNewWorkspace(getDatabase(app), converted.state, backupDirectory);
    await writeJson(directory, "apply-receipt.json", { ...result, stateChecksum, sourceTablesChecksum: exported.manifest.tablesChecksum, completedAt: new Date().toISOString(), targetMode: "shadow" });
    if (!result.verified) throw migrationFailure("saved_target_differs_do_not_retry_blindly");
    const applied = { ...summary, mode: "apply", ...result }; console.log(JSON.stringify(applied)); return applied;
  } finally { await deleteApp(app); }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) main().catch((error) => { console.error(safeFailureCode(error)); process.exitCode = 1; });
