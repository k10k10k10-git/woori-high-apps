#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports */

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const PROJECT_ID = "woori-high";
const retreatId = process.argv[2];

if (!retreatId) {
  console.error("Usage: node scripts/sync-retreat-teachers-from-attendance.js <retreatId>");
  process.exit(1);
}

const ROOT = path.resolve(__dirname, "..");
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const backupDir = path.join(ROOT, "backups", `retreat-teachers-sync-${retreatId}-${stamp}`);
fs.mkdirSync(backupDir, { recursive: true });

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

function updateDb(pathname, data, filename) {
  const tmpFile = path.join(backupDir, filename);
  fs.writeFileSync(tmpFile, JSON.stringify(data, null, 2));
  runFirebase(["database:update", pathname, tmpFile, "--project", PROJECT_ID, "--force"]);
}

function canonicalKey({ bu, classKey, name }) {
  return `${bu}::${classKey}::${name}`.trim();
}

function stableKey(prefix, value) {
  return `${prefix}-${String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9가-힣]+/g, "-")
    .replace(/^-+|-+$/g, "")}`;
}

const retreat = getDb(`/retreats/${retreatId}`);
if (!retreat || !retreat.year) throw new Error(`Retreat ${retreatId} not found or missing year.`);

const year = retreat.year;
const classes = getDb(`/classes/${year}`) || {};
const teacherStaff = getDb(`/teacherStaff/${year}`) || {};
const retreatTeachers = getDb(`/retreats/${retreatId}/teachers`) || {};

fs.writeFileSync(path.join(backupDir, "retreat.before.json"), JSON.stringify(retreat, null, 2));
fs.writeFileSync(path.join(backupDir, "classes.before.json"), JSON.stringify(classes, null, 2));
fs.writeFileSync(path.join(backupDir, "teacherStaff.before.json"), JSON.stringify(teacherStaff, null, 2));
fs.writeFileSync(path.join(backupDir, "retreatTeachers.before.json"), JSON.stringify(retreatTeachers, null, 2));

const importedByKey = new Map();

Object.entries(classes).forEach(([classKey, value]) => {
  if (!value || !value.teacher) return;
  const parts = classKey.split("-").map(Number);
  if (parts.length !== 3 || parts.some(Number.isNaN)) return;
  const [buNum, grade, cls] = parts;
  const teacher = {
    name: value.teacher,
    bu: buNum === 1 ? "1부" : "2부",
    classKey: `${grade}학년 ${cls}반`,
    source: "attendance-db",
    originType: "class-teacher",
  };
  importedByKey.set(canonicalKey(teacher), teacher);
});

Object.values(teacherStaff).forEach((value) => {
  if (!value || !value.name) return;
  const teacher = {
    name: value.name,
    bu: "스탭",
    classKey: value.title || "스탭",
    source: "attendance-db",
    originType: "official-staff",
  };
  importedByKey.set(canonicalKey(teacher), teacher);
});

const updates = {};
const summary = {
  retreatId,
  year,
  importedCandidateCount: importedByKey.size,
  taggedImportedCount: 0,
  preservedManualAssistantCount: 0,
  preservedManualRetreatCount: 0,
};

for (const [id, teacher] of Object.entries(retreatTeachers)) {
  const key = canonicalKey(teacher);
  const imported = importedByKey.get(key);

  if (imported) {
    updates[id] = {
      ...teacher,
      source: imported.source,
      originType: imported.originType,
    };
    importedByKey.delete(key);
    summary.taggedImportedCount += 1;
    continue;
  }

  if (teacher.bu === "스탭") {
    updates[id] = {
      ...teacher,
      source: teacher.source || "manual-assistant",
      originType: teacher.originType || "assistant-staff",
    };
    summary.preservedManualAssistantCount += 1;
    continue;
  }

  updates[id] = {
    ...teacher,
    source: teacher.source || "manual-retreat",
    originType: teacher.originType || "manual-teacher",
  };
  summary.preservedManualRetreatCount += 1;
}

for (const imported of importedByKey.values()) {
  const id = stableKey("import", canonicalKey(imported));
  updates[id] = {
    ...imported,
    status: "전참",
    note: "",
    arrivalInfo: "",
    transport: "",
  };
}

summary.addedImportedCount = importedByKey.size;

updateDb(`/retreats/${retreatId}/teachers`, updates, "retreatTeachers.patch.json");
fs.writeFileSync(path.join(backupDir, "summary.json"), JSON.stringify(summary, null, 2));
console.log(JSON.stringify({ backupDir, ...summary }, null, 2));
