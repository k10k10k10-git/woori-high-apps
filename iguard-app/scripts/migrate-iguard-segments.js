#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports */

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const PROJECT_ID = "woori-high";
const ROOT = path.resolve(__dirname, "..");
const DEFAULT_SEGMENT_LABEL = "전체";
const EXECUTE_CONFIRMATION = "EXECUTE_SEGMENT_MIGRATION";
const PUSH_CHARS = "-0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ_abcdefghijklmnopqrstuvwxyz";

function parseArgs(argv) {
  const args = { retreatIds: [], all: false, execute: false, confirmation: "" };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--retreat-id") {
      const value = argv[++i];
      if (!value) throw new Error("--retreat-id requires a value.");
      args.retreatIds.push(value);
      continue;
    }
    if (arg === "--all") {
      args.all = true;
      continue;
    }
    if (arg === "--execute") {
      args.execute = true;
      continue;
    }
    if (arg === "--confirm") {
      args.confirmation = argv[++i] || "";
      continue;
    }
    if (arg === "-h" || arg === "--help") {
      printUsage();
      process.exit(0);
    }
    throw new Error(`Unknown argument: ${arg}`);
  }
  if (!args.all && args.retreatIds.length === 0) {
    throw new Error("Choose --all or at least one --retreat-id.");
  }
  if (args.all && args.retreatIds.length > 0) {
    throw new Error("Use either --all or --retreat-id, not both.");
  }
  if (args.execute && args.confirmation !== EXECUTE_CONFIRMATION) {
    throw new Error(`Execution requires --confirm ${EXECUTE_CONFIRMATION}.`);
  }
  return args;
}

function printUsage() {
  console.log(`Usage:
  node scripts/migrate-iguard-segments.js --all
  node scripts/migrate-iguard-segments.js --retreat-id <id> [--retreat-id <id> ...]
  node scripts/migrate-iguard-segments.js --retreat-id <id> --execute --confirm ${EXECUTE_CONFIRMATION}

Safety:
  The default mode is a read-only dry run. It writes report files only under ignored backups/.
  Execute mode first saves schedule/segments/movements snapshots and a path-level restore patch.
  Execute mode refuses to run when any conversion issue or count mismatch exists.
`);
}

function stamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function runFirebase(args) {
  return execFileSync("firebase", args, {
    encoding: "utf8",
    maxBuffer: 120 * 1024 * 1024,
  });
}

function parseFirebaseJson(output) {
  const clean = output
    .split("\n")
    .filter((line) => !line.includes("[DEP0169]") && !line.startsWith("(node:"))
    .join("\n")
    .trim();
  if (!clean || clean === "null") return null;
  return JSON.parse(clean);
}

function getDb(pathname) {
  return parseFirebaseJson(runFirebase(["database:get", pathname, "--project", PROJECT_ID]));
}

function updateDb(payloadPath) {
  runFirebase(["database:update", "/", payloadPath, "--project", PROJECT_ID, "--force"]);
}

function writeJson(filename, value) {
  fs.writeFileSync(filename, `${JSON.stringify(value, null, 2)}\n`);
}

function createPushIdGenerator(random = Math.random) {
  let lastPushTime = 0;
  let lastRandChars = [];
  return function generatePushId(now = Date.now()) {
    const duplicateTime = now === lastPushTime;
    lastPushTime = now;
    const timeChars = new Array(8);
    let value = now;
    for (let i = 7; i >= 0; i -= 1) {
      timeChars[i] = PUSH_CHARS.charAt(value % 64);
      value = Math.floor(value / 64);
    }
    if (value !== 0) throw new Error("Push ID timestamp conversion failed.");
    let id = timeChars.join("");
    if (!duplicateTime) {
      lastRandChars = Array.from({ length: 12 }, () => Math.floor(random() * 64));
    } else {
      let index = 11;
      while (index >= 0 && lastRandChars[index] === 63) {
        lastRandChars[index] = 0;
        index -= 1;
      }
      if (index < 0) throw new Error("Push ID random suffix overflow.");
      lastRandChars[index] += 1;
    }
    id += lastRandChars.map((char) => PUSH_CHARS.charAt(char)).join("");
    return id;
  };
}

function isDefaultSegment(segment) {
  return segment
    && segment.order === 0
    && String(segment.label || "").trim() === DEFAULT_SEGMENT_LABEL;
}

function movementKey(segmentId, movement) {
  return `${segmentId}__${movement.postId}__${movement.staffId}`;
}

function buildRetreatMigration(retreatId, retreat, generatePushId = createPushIdGenerator()) {
  const iguard = retreat?.iguard || {};
  const schedule = iguard.schedule || {};
  const segments = iguard.segments || {};
  const movements = iguard.movements || {};
  const payload = {};
  const restore = {};
  const issues = [];
  const defaultByBlock = new Map();
  const generatedSegments = [];
  const reusedSegments = [];

  for (const [segmentId, segment] of Object.entries(segments)) {
    if (!isDefaultSegment(segment)) continue;
    if (defaultByBlock.has(segment.blockId)) {
      issues.push({
        type: "duplicate-default-segment",
        blockId: segment.blockId,
        segmentIds: [defaultByBlock.get(segment.blockId), segmentId],
      });
      continue;
    }
    defaultByBlock.set(segment.blockId, segmentId);
    reusedSegments.push(segmentId);
  }

  for (const blockId of Object.keys(schedule)) {
    if (defaultByBlock.has(blockId)) continue;
    const segmentId = generatePushId();
    const segment = {
      blockId,
      order: 0,
      label: DEFAULT_SEGMENT_LABEL,
      source: "manual",
    };
    defaultByBlock.set(blockId, segmentId);
    generatedSegments.push(segmentId);
    const segmentPath = `retreats/${retreatId}/iguard/segments/${segmentId}`;
    payload[segmentPath] = segment;
    restore[segmentPath] = null;
  }

  let convertedCount = 0;
  let structuredCount = 0;
  const plannedNewKeys = new Set();
  for (const [oldKey, movement] of Object.entries(movements)) {
    if (movement?.segmentId) {
      structuredCount += 1;
      const segment = segments[movement.segmentId];
      if (!segment) {
        issues.push({
          type: "structured-movement-without-segment",
          movementKey: oldKey,
          segmentId: movement.segmentId,
        });
      } else if (
        typeof segment === "object"
        && segment.blockId
        && movement.blockId
        && segment.blockId !== movement.blockId
      ) {
        issues.push({
          type: "structured-movement-block-mismatch",
          movementKey: oldKey,
          movementBlockId: movement.blockId,
          segmentBlockId: segment.blockId,
        });
      }
      if (!movement?.postId || !movement?.staffId) {
        issues.push({
          type: "invalid-structured-movement",
          movementKey: oldKey,
          hasPostId: !!movement?.postId,
          hasStaffId: !!movement?.staffId,
        });
      }
      continue;
    }
    const defaultSegmentId = defaultByBlock.get(movement?.blockId);
    if (!defaultSegmentId) {
      issues.push({ type: "movement-without-schedule-block", movementKey: oldKey, blockId: movement?.blockId || null });
      continue;
    }
    if (!movement?.postId || !movement?.staffId) {
      issues.push({
        type: "invalid-legacy-movement",
        movementKey: oldKey,
        hasPostId: !!movement?.postId,
        hasStaffId: !!movement?.staffId,
      });
      continue;
    }
    const newKey = movementKey(defaultSegmentId, movement);
    if ((newKey !== oldKey && Object.prototype.hasOwnProperty.call(movements, newKey)) || plannedNewKeys.has(newKey)) {
      issues.push({ type: "movement-key-collision", movementKey: oldKey, newKey });
      continue;
    }
    plannedNewKeys.add(newKey);
    const oldPath = `retreats/${retreatId}/iguard/movements/${oldKey}`;
    const newPath = `retreats/${retreatId}/iguard/movements/${newKey}`;
    payload[oldPath] = null;
    payload[newPath] = {
      ...movement,
      segmentId: defaultSegmentId,
      blockId: movement.blockId,
      postId: movement.postId,
      staffId: movement.staffId,
    };
    restore[oldPath] = movement;
    restore[newPath] = null;
    convertedCount += 1;
  }

  const beforeMovementCount = Object.keys(movements).length;
  const unresolvedLegacyCount = beforeMovementCount - structuredCount - convertedCount;
  const afterMovementCount = structuredCount + convertedCount + unresolvedLegacyCount;
  const countMatches = afterMovementCount === beforeMovementCount;
  if (!countMatches) {
    issues.push({ type: "movement-count-mismatch", beforeMovementCount, afterMovementCount });
  }

  const report = {
    retreatId,
    retreatName: retreat?.name || null,
    scheduleBlockCount: Object.keys(schedule).length,
    existingSegmentCount: Object.keys(segments).length,
    generatedDefaultSegmentCount: generatedSegments.length,
    reusedDefaultSegmentCount: reusedSegments.length,
    beforeMovementCount,
    structuredMovementCount: structuredCount,
    convertedMovementCount: convertedCount,
    unresolvedLegacyCount,
    afterMovementCount,
    countMatches,
    fullyConverted: unresolvedLegacyCount === 0 && issues.length === 0,
    issueCount: issues.length,
    issues,
  };

  return { report, payload, restore, snapshots: { schedule, segments, movements } };
}

function selectRetreats(args, retreats) {
  if (args.all) {
    return Object.entries(retreats)
      .filter(([, retreat]) => Object.keys(retreat?.iguard?.movements || {}).length > 0)
      .map(([retreatId]) => retreatId);
  }
  return [...new Set(args.retreatIds)];
}

function main() {
  const args = parseArgs(process.argv);
  const runId = `movement-segments-${args.execute ? "execute" : "dry-run"}-${stamp()}`;
  const runDir = path.join(ROOT, "backups", runId);
  fs.mkdirSync(runDir, { recursive: true });

  const retreats = getDb("/retreats") || {};
  const retreatIds = selectRetreats(args, retreats);
  const generatePushId = createPushIdGenerator();
  const payload = {};
  const restore = {};
  const reports = [];

  for (const retreatId of retreatIds) {
    const retreat = retreats[retreatId];
    if (!retreat) {
      reports.push({ retreatId, issueCount: 1, issues: [{ type: "retreat-not-found" }] });
      continue;
    }
    const result = buildRetreatMigration(retreatId, retreat, generatePushId);
    reports.push(result.report);
    Object.assign(payload, result.payload);
    Object.assign(restore, result.restore);

    if (args.execute) {
      const retreatDir = path.join(runDir, retreatId);
      fs.mkdirSync(retreatDir, { recursive: true });
      writeJson(path.join(retreatDir, "schedule.before.json"), result.snapshots.schedule);
      writeJson(path.join(retreatDir, "segments.before.json"), result.snapshots.segments);
      writeJson(path.join(retreatDir, "movements.before.json"), result.snapshots.movements);
    }
  }

  const issueCount = reports.reduce((sum, report) => sum + (report.issueCount || 0), 0);
  const summary = {
    projectId: PROJECT_ID,
    mode: args.execute ? "execute" : "dry-run",
    generatedAt: new Date().toISOString(),
    runDir,
    targetRetreatCount: retreatIds.length,
    totalScheduleBlockCount: reports.reduce((sum, report) => sum + (report.scheduleBlockCount || 0), 0),
    totalBeforeMovementCount: reports.reduce((sum, report) => sum + (report.beforeMovementCount || 0), 0),
    totalConvertedMovementCount: reports.reduce((sum, report) => sum + (report.convertedMovementCount || 0), 0),
    totalAfterMovementCount: reports.reduce((sum, report) => sum + (report.afterMovementCount || 0), 0),
    totalGeneratedDefaultSegmentCount: reports.reduce((sum, report) => sum + (report.generatedDefaultSegmentCount || 0), 0),
    totalIssueCount: issueCount,
    payloadPathCount: Object.keys(payload).length,
    reports,
  };

  writeJson(path.join(runDir, "report.json"), summary);
  writeJson(path.join(runDir, "payload.patch.json"), payload);
  writeJson(path.join(runDir, "restore.patch.json"), restore);
  fs.writeFileSync(
    path.join(runDir, "RESTORE.txt"),
    `firebase database:update / "${path.join(runDir, "restore.patch.json")}" --project ${PROJECT_ID} --force\n`,
  );

  if (args.execute) {
    if (issueCount > 0) {
      throw new Error(`Refusing execution: ${issueCount} migration issue(s). See ${path.join(runDir, "report.json")}`);
    }
    if (Object.keys(payload).length === 0) {
      console.log(JSON.stringify(summary, null, 2));
      console.log("No payload changes. Nothing to execute.");
      return;
    }
    updateDb(path.join(runDir, "payload.patch.json"));
  }

  console.log(JSON.stringify(summary, null, 2));
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

module.exports = {
  DEFAULT_SEGMENT_LABEL,
  EXECUTE_CONFIRMATION,
  buildRetreatMigration,
  createPushIdGenerator,
  isDefaultSegment,
  movementKey,
  parseArgs,
  selectRetreats,
};
