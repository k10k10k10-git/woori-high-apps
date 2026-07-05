#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports */

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const PROJECT_ID = "woori-high";
const ROOT = path.resolve(__dirname, "..");
const DEFAULT_RETREAT_ID = "-OnzAiqQpn7McL0MWe7M";
const VALID_FIXES = new Set([
  "all",
  "public-teacher-idnumber",
  "teacher-origin-keys",
  "legacy-milestones",
]);

function parseArgs(argv) {
  const args = {
    retreatId: DEFAULT_RETREAT_ID,
    fixes: new Set(),
    execute: false,
    maxExamples: 20,
  };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--retreat-id") {
      args.retreatId = argv[++i];
      continue;
    }
    if (arg === "--fix") {
      const value = argv[++i];
      if (!value) throw new Error("--fix requires a value.");
      value.split(",").map((v) => v.trim()).filter(Boolean).forEach((fix) => {
        if (!VALID_FIXES.has(fix)) throw new Error(`Unknown fix: ${fix}`);
        args.fixes.add(fix);
      });
      continue;
    }
    if (arg === "--execute") {
      args.execute = true;
      continue;
    }
    if (arg === "--max-examples") {
      args.maxExamples = Number(argv[++i] || 20);
      continue;
    }
    if (arg === "-h" || arg === "--help") {
      printUsage();
      process.exit(0);
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  if (args.fixes.size === 0) args.fixes.add("all");
  if (args.fixes.has("all")) {
    args.fixes = new Set(["public-teacher-idnumber", "teacher-origin-keys", "legacy-milestones"]);
  }
  return args;
}

function printUsage() {
  console.log(`Usage:
  node scripts/normalize-retreat-db.js --retreat-id <id> --fix <fix[,fix...]> [--execute]

Fixes:
  public-teacher-idnumber   Remove empty public teachers/*/idNumber fields
  teacher-origin-keys       Backfill safe originKey values for imported teachers
  legacy-milestones         Mark duplicate retreats/{id}/milestones for cleanup
  all                       Run all dry-run checks

Defaults:
  --retreat-id ${DEFAULT_RETREAT_ID}
  --fix all

Safety:
  Without --execute this script writes no DB data.
  With --execute it first exports a full root backup under backups/.
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

function writeJson(filename, value) {
  fs.writeFileSync(filename, `${JSON.stringify(value, null, 2)}\n`);
}

function normalizeText(value) {
  return String(value || "").replace(/\s+/g, "").toLowerCase();
}

function exactTeacherKey(teacher) {
  return `${teacher.bu || ""}::${normalizeText(teacher.classKey)}::${normalizeText(teacher.name)}`;
}

function nameTeacherKey(teacher) {
  return `${teacher.bu || ""}::${normalizeText(teacher.name)}`;
}

function parseGradeClass(classKey) {
  const match = String(classKey || "").match(/(\d+)\s*학년\s*(\d+)\s*반/);
  if (!match) return null;
  return { grade: Number(match[1]), cls: Number(match[2]) };
}

function classTeacherKey(teacher) {
  const parsed = parseGradeClass(teacher.classKey);
  if (!parsed) return "";
  return `${teacher.bu || ""}::${parsed.grade}::${parsed.cls}::${normalizeText(teacher.name)}`;
}

function pushPayload(payload, pathName, before, after, reason, summary, examples) {
  if (before === after) return;
  payload[pathName] = after;
  summary.changeCount += 1;
  if (examples.length < summary.maxExamples) {
    examples.push({ path: pathName, before, after, reason });
  }
}

function buildImportCandidates({ classes, teacherExtra, teacherSpecial, teacherStaff }) {
  const candidates = [];

  Object.entries(classes || {}).forEach(([classKey, classData]) => {
    const [part, grade, cls] = classKey.split("-").map(Number);
    if (!part || !grade || !cls) return;
    const extraKey = classKey.replaceAll("-", "_");
    const extra = teacherExtra?.[String(part)]?.[extraKey];
    const name = String(extra?.name || classData?.teacher || "").trim();
    if (!name) return;
    candidates.push({
      name,
      bu: part === 1 ? "1부" : "2부",
      classKey: String(extra?.title || `${grade}학년 ${cls}반`).trim(),
      originKey: `class:${classKey}`,
      matchType: "exact-class-match",
    });
  });

  Object.entries(teacherSpecial || {}).forEach(([part, list]) => {
    if (!Array.isArray(list)) return;
    list.forEach((teacher, index) => {
      const name = String(teacher?.name || "").trim();
      if (!name) return;
      candidates.push({
        name,
        bu: part === "1" ? "1부" : "2부",
        classKey: String(teacher?.title || "비반담임").trim(),
        originKey: `special:${part}:${index}`,
        matchType: "exact-special-match",
      });
    });
  });

  Object.entries(teacherStaff || {}).forEach(([staffKey, teacher]) => {
    const name = String(teacher?.name || "").trim();
    if (!name) return;
    candidates.push({
      name,
      bu: "스탭",
      classKey: String(teacher?.title || "스탭").trim(),
      originKey: `staff:${staffKey}`,
      matchType: "exact-staff-match",
    });
  });

  return candidates;
}

function indexCandidates(candidates) {
  const exact = new Map();
  const byClass = new Map();
  const byName = new Map();
  for (const candidate of candidates) {
    const exactKey = exactTeacherKey(candidate);
    const classKey = classTeacherKey(candidate);
    const nameKey = nameTeacherKey(candidate);
    if (!exact.has(exactKey)) exact.set(exactKey, []);
    if (classKey && !byClass.has(classKey)) byClass.set(classKey, []);
    if (!byName.has(nameKey)) byName.set(nameKey, []);
    exact.get(exactKey).push(candidate);
    if (classKey) byClass.get(classKey).push(candidate);
    byName.get(nameKey).push(candidate);
  }
  return { exact, byClass, byName };
}

function findCandidateForTeacher(teacher, indexes) {
  const exact = indexes.exact.get(exactTeacherKey(teacher)) || [];
  if (exact.length === 1) return { candidate: exact[0], status: exact[0].matchType };
  if (exact.length > 1) return { candidate: null, status: "ambiguous-exact-match", candidates: exact };

  const classCandidates = indexes.byClass.get(classTeacherKey(teacher)) || [];
  if (classCandidates.length === 1) return { candidate: classCandidates[0], status: "exact-class-match" };
  if (classCandidates.length > 1) return { candidate: null, status: "ambiguous-class-match", candidates: classCandidates };

  const byName = indexes.byName.get(nameTeacherKey(teacher)) || [];
  if (byName.length > 0) return { candidate: null, status: "ambiguous-name-match", candidates: byName };
  return { candidate: null, status: "no-match", candidates: [] };
}

function shouldConsiderTeacher(teacher) {
  return (
    teacher?.source === "attendance-db" ||
    teacher?.originType === "class-teacher" ||
    teacher?.originType === "official-staff" ||
    teacher?.originType === "manual-teacher"
  );
}

function buildPublicTeacherIdNumberCleanup({ retreatId, teachers, payload, maxExamples }) {
  const summary = {
    fix: "public-teacher-idnumber",
    retreatId,
    changeCount: 0,
    skippedNonEmpty: 0,
    maxExamples,
  };
  const examples = [];
  const skipped = [];

  Object.entries(teachers || {}).forEach(([teacherId, teacher]) => {
    if (!teacher || typeof teacher !== "object" || !Object.prototype.hasOwnProperty.call(teacher, "idNumber")) return;
    const value = teacher.idNumber;
    if (String(value || "").trim()) {
      summary.skippedNonEmpty += 1;
      if (skipped.length < maxExamples) {
        skipped.push({
          path: `retreats/${retreatId}/teachers/${teacherId}/idNumber`,
          reason: "non-empty public idNumber requires manual review",
          valueLength: String(value).length,
        });
      }
      return;
    }
    pushPayload(
      payload,
      `retreats/${retreatId}/teachers/${teacherId}/idNumber`,
      value,
      null,
      "empty public idNumber field; private teacherIdNumbers is the canonical sensitive store",
      summary,
      examples,
    );
  });

  return { summary, examples, skipped };
}

function buildTeacherOriginKeyBackfill({ retreatId, year, teachers, classes, teacherExtra, teacherSpecial, teacherStaff, payload, maxExamples }) {
  const summary = {
    fix: "teacher-origin-keys",
    retreatId,
    year,
    totalTeachers: Object.keys(teachers || {}).length,
    considered: 0,
    alreadyHasOriginKey: 0,
    changeCount: 0,
    exactClassMatch: 0,
    exactSpecialMatch: 0,
    exactStaffMatch: 0,
    ambiguousExactMatch: 0,
    ambiguousClassMatch: 0,
    ambiguousNameMatch: 0,
    noMatch: 0,
    maxExamples,
  };
  const examples = [];
  const skipped = [];
  const candidates = buildImportCandidates({ classes, teacherExtra, teacherSpecial, teacherStaff });
  const indexes = indexCandidates(candidates);

  Object.entries(teachers || {}).forEach(([teacherId, teacher]) => {
    if (!teacher || typeof teacher !== "object") return;
    if (teacher.originKey) {
      summary.alreadyHasOriginKey += 1;
      return;
    }
    if (!shouldConsiderTeacher(teacher)) return;
    summary.considered += 1;

    const match = findCandidateForTeacher(teacher, indexes);
    if (!match.candidate) {
      if (match.status === "ambiguous-exact-match") summary.ambiguousExactMatch += 1;
      else if (match.status === "ambiguous-class-match") summary.ambiguousClassMatch += 1;
      else if (match.status === "ambiguous-name-match") summary.ambiguousNameMatch += 1;
      else summary.noMatch += 1;
      if (skipped.length < maxExamples) {
        skipped.push({
          teacherId,
          name: teacher.name,
          bu: teacher.bu,
          classKey: teacher.classKey,
          reason: match.status,
          candidateCount: match.candidates.length,
          candidateOriginKeys: match.candidates.slice(0, 5).map((candidate) => candidate.originKey),
        });
      }
      return;
    }

    if (match.status === "exact-class-match") summary.exactClassMatch += 1;
    if (match.status === "exact-special-match") summary.exactSpecialMatch += 1;
    if (match.status === "exact-staff-match") summary.exactStaffMatch += 1;

    const reason = `${match.status}: ${teacher.bu}/${teacher.classKey}/${teacher.name}`;
    pushPayload(
      payload,
      `retreats/${retreatId}/teachers/${teacherId}/originKey`,
      undefined,
      match.candidate.originKey,
      reason,
      summary,
      examples,
    );
  });

  return { summary, examples, skipped };
}

function milestoneKey(milestone) {
  return `${milestone?.targetDate || ""}|${milestone?.title || ""}`;
}

function buildLegacyMilestoneCleanup({ retreatIds, retreats, prepMilestones, payload, maxExamples }) {
  const summary = {
    fix: "legacy-milestones",
    retreatIds,
    changeCount: 0,
    duplicateLocalMilestones: 0,
    localOnlyMilestones: 0,
    maxExamples,
  };
  const examples = [];
  const skipped = [];
  const globalKeys = new Set(Object.values(prepMilestones || {}).map(milestoneKey));

  for (const retreatId of retreatIds) {
    const localMilestones = retreats?.[retreatId]?.milestones || {};
    Object.entries(localMilestones).forEach(([milestoneId, milestone]) => {
      const key = milestoneKey(milestone);
      if (globalKeys.has(key)) {
        summary.duplicateLocalMilestones += 1;
        pushPayload(
          payload,
          `retreats/${retreatId}/milestones/${milestoneId}`,
          "{milestone}",
          null,
          `duplicate of prepMilestones by targetDate+title (${key})`,
          summary,
          examples,
        );
        return;
      }
      summary.localOnlyMilestones += 1;
      if (skipped.length < maxExamples) {
        skipped.push({
          retreatId,
          milestoneId,
          title: milestone?.title,
          targetDate: milestone?.targetDate,
          reason: "local-only milestone; skipped until user decides whether to copy it to prepMilestones",
        });
      }
    });
  }

  return { summary, examples, skipped };
}

function redactPayloadForConsole(payload) {
  return Object.fromEntries(
    Object.entries(payload).slice(0, 25).map(([key, value]) => [key, value === null ? null : value]),
  );
}

function main() {
  const args = parseArgs(process.argv);
  const runId = `normalize-retreat-db-${stamp()}`;
  const runDir = path.join(ROOT, "backups", runId);
  fs.mkdirSync(runDir, { recursive: true });

  const payload = {};
  const report = {
    projectId: PROJECT_ID,
    mode: args.execute ? "execute" : "dry-run",
    runDir,
    retreatId: args.retreatId,
    fixes: Array.from(args.fixes),
    generatedAt: new Date().toISOString(),
    summaries: [],
    examples: {},
    skipped: {},
  };

  const retreat = getDb(`/retreats/${args.retreatId}`);
  if (!retreat) throw new Error(`Retreat not found: ${args.retreatId}`);
  const year = retreat.year;
  if (!year) throw new Error(`Retreat has no year: ${args.retreatId}`);

  const retreats = args.fixes.has("legacy-milestones")
    ? getDb("/retreats") || {}
    : { [args.retreatId]: retreat };
  const teachers = getDb(`/retreats/${args.retreatId}/teachers`) || {};
  const classes = args.fixes.has("teacher-origin-keys") ? getDb(`/classes/${year}`) || {} : {};
  const teacherExtra = args.fixes.has("teacher-origin-keys") ? getDb(`/teacherExtra/${year}`) || {} : {};
  const teacherSpecial = args.fixes.has("teacher-origin-keys") ? getDb(`/teacherSpecial/${year}`) || {} : {};
  const teacherStaff = args.fixes.has("teacher-origin-keys") ? getDb(`/teacherStaff/${year}`) || {} : {};
  const prepMilestones = args.fixes.has("legacy-milestones") ? getDb("/prepMilestones") || {} : {};

  writeJson(path.join(runDir, "before-summary.json"), {
    retreatId: args.retreatId,
    year,
    teacherCount: Object.keys(teachers).length,
    classCount: Object.keys(classes).length,
    teacherExtraParts: Object.keys(teacherExtra).length,
    teacherSpecialParts: Object.keys(teacherSpecial).length,
    teacherStaffCount: Object.keys(teacherStaff).length,
    retreatCountForMilestones: Object.keys(retreats).length,
    prepMilestonesCount: Object.keys(prepMilestones).length,
  });

  if (args.fixes.has("public-teacher-idnumber")) {
    const result = buildPublicTeacherIdNumberCleanup({
      retreatId: args.retreatId,
      teachers,
      payload,
      maxExamples: args.maxExamples,
    });
    report.summaries.push(result.summary);
    report.examples[result.summary.fix] = result.examples;
    report.skipped[result.summary.fix] = result.skipped;
  }

  if (args.fixes.has("teacher-origin-keys")) {
    const result = buildTeacherOriginKeyBackfill({
      retreatId: args.retreatId,
      year,
      teachers,
      classes,
      teacherExtra,
      teacherSpecial,
      teacherStaff,
      payload,
      maxExamples: args.maxExamples,
    });
    report.summaries.push(result.summary);
    report.examples[result.summary.fix] = result.examples;
    report.skipped[result.summary.fix] = result.skipped;
  }

  if (args.fixes.has("legacy-milestones")) {
    const retreatIds = Object.keys(retreats);
    const result = buildLegacyMilestoneCleanup({
      retreatIds,
      retreats,
      prepMilestones,
      payload,
      maxExamples: args.maxExamples,
    });
    report.summaries.push(result.summary);
    report.examples[result.summary.fix] = result.examples;
    report.skipped[result.summary.fix] = result.skipped;
  }

  report.payloadPathCount = Object.keys(payload).length;
  report.payloadPreview = redactPayloadForConsole(payload);
  writeJson(path.join(runDir, "payload.json"), payload);
  writeJson(path.join(runDir, "report.json"), report);

  if (args.execute) {
    if (Object.keys(payload).length === 0) {
      console.log(JSON.stringify(report, null, 2));
      console.log("No payload changes. Nothing to execute.");
      return;
    }
    const rootBackup = path.join(runDir, "root-before-execute.json");
    runFirebase(["database:get", "/", "--project", PROJECT_ID, "--export", "--output", rootBackup]);
    const payloadPath = path.join(runDir, "payload.json");
    runFirebase(["database:update", "/", payloadPath, "--project", PROJECT_ID, "--force"]);
    report.executedAt = new Date().toISOString();
    report.rootBackup = rootBackup;
    writeJson(path.join(runDir, "report.executed.json"), report);
  }

  console.log(JSON.stringify(report, null, 2));
  if (!args.execute) {
    console.log("\nDRY RUN ONLY: no DB writes were performed.");
    console.log(`Review files in: ${runDir}`);
  }
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
