#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports */

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const PROJECT_ID = "woori-high";
const retreatId = process.argv[2];

if (!retreatId) {
  console.error("Usage: node scripts/migrate-iguard-movement-staff-ids.js <retreatId>");
  process.exit(1);
}

const ROOT = path.resolve(__dirname, "..");
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const backupDir = path.join(ROOT, "backups", `movement-staff-migration-${retreatId}-${stamp}`);
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

function normalizeStaffName(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/sf/gi, "")
    .replace(/스탭/g, "")
    .replace(/[\s_~\-·()[\]{}.,!?:/\\|'"“”‘’]+/g, "");
}

const teachers = getDb(`/retreats/${retreatId}/teachers`) || {};
const legacyStaff = getDb(`/retreats/${retreatId}/iguard/staff`) || {};
const movements = getDb(`/retreats/${retreatId}/iguard/movements`) || {};

fs.writeFileSync(path.join(backupDir, "teachers.before.json"), JSON.stringify(teachers, null, 2));
fs.writeFileSync(path.join(backupDir, "legacy-staff.before.json"), JSON.stringify(legacyStaff, null, 2));
fs.writeFileSync(path.join(backupDir, "movements.before.json"), JSON.stringify(movements, null, 2));

const activeTeachers = Object.entries(teachers)
  .filter(([, value]) => value && value.bu === "스탭" && value.status !== "불참" && value.name)
  .map(([id, value]) => ({ id, name: value.name }));

const teacherIdSet = new Set(activeTeachers.map((teacher) => teacher.id));
const normalizedTeacherNameMap = new Map(
  activeTeachers.map((teacher) => [normalizeStaffName(teacher.name), teacher.id])
);
const legacyStaffNameMap = new Map(
  Object.entries(legacyStaff).map(([id, value]) => [id, value && value.name ? value.name : id])
);

const updates = {};
const migrated = [];
const unresolved = [];

for (const [key, movement] of Object.entries(movements)) {
  const oldStaffId = movement.staffId;
  if (teacherIdSet.has(oldStaffId)) continue;

  let newTeacherId = null;
  if (String(oldStaffId).startsWith("admin-teacher-")) {
    const suffixId = String(oldStaffId).slice("admin-teacher-".length);
    if (teacherIdSet.has(suffixId)) newTeacherId = suffixId;
  }
  if (!newTeacherId) {
    const legacyName = legacyStaffNameMap.get(oldStaffId) || oldStaffId;
    newTeacherId = normalizedTeacherNameMap.get(normalizeStaffName(legacyName)) || null;
  }

  if (!newTeacherId) {
    unresolved.push({ movementKey: key, staffId: oldStaffId });
    continue;
  }

  const newKey = `${newTeacherId}__${movement.blockId}`;
  updates[key] = null;
  updates[newKey] = { ...movement, staffId: newTeacherId };
  migrated.push({ movementKey: key, from: oldStaffId, to: newTeacherId, newKey });
}

if (Object.keys(updates).length > 0) {
  updateDb(`/retreats/${retreatId}/iguard/movements`, updates, "movements.patch.json");
}

const summary = {
  retreatId,
  backupDir,
  activeTeacherCount: activeTeachers.length,
  movementCount: Object.keys(movements).length,
  migratedCount: migrated.length,
  unresolvedCount: unresolved.length,
};

fs.writeFileSync(path.join(backupDir, "migrated.json"), JSON.stringify(migrated, null, 2));
fs.writeFileSync(path.join(backupDir, "unresolved.json"), JSON.stringify(unresolved, null, 2));
fs.writeFileSync(path.join(backupDir, "summary.json"), JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2));
