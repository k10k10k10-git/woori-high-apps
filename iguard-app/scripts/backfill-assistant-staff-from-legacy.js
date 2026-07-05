#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports */

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const PROJECT_ID = "woori-high";
const retreatId = process.argv[2];

if (!retreatId) {
  console.error("Usage: node scripts/backfill-assistant-staff-from-legacy.js <retreatId>");
  process.exit(1);
}

const ROOT = path.resolve(__dirname, "..");
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const backupDir = path.join(ROOT, "backups", `assistant-staff-backfill-${retreatId}-${stamp}`);
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

const teachers = getDb(`/retreats/${retreatId}/teachers`) || {};
const legacyStaff = getDb(`/retreats/${retreatId}/iguard/staff`) || {};
const movements = getDb(`/retreats/${retreatId}/iguard/movements`) || {};

fs.writeFileSync(path.join(backupDir, "teachers.before.json"), JSON.stringify(teachers, null, 2));
fs.writeFileSync(path.join(backupDir, "legacyStaff.before.json"), JSON.stringify(legacyStaff, null, 2));
fs.writeFileSync(path.join(backupDir, "movements.before.json"), JSON.stringify(movements, null, 2));

const currentNames = new Set(
  Object.values(teachers)
    .map((teacher) => teacher && teacher.name)
    .filter(Boolean)
);

const referencedLegacyIds = new Set(
  Object.values(movements)
    .map((movement) => movement.staffId)
    .filter((staffId) => staffId && legacyStaff[staffId] && !currentNames.has(legacyStaff[staffId].name))
);

const updates = {};
const added = [];

for (const staffId of referencedLegacyIds) {
  const legacy = legacyStaff[staffId];
  if (!legacy || !legacy.name) continue;
  const newId = `assistant-${staffId}`;
  updates[newId] = {
    name: legacy.name,
    bu: "스탭",
    classKey: "보조스탭",
    status: "전참",
    note: "legacy iguard assistant staff backfill",
    arrivalInfo: "",
    transport: "",
    age: legacy.age || null,
    worship: !!legacy.worship || null,
    source: "manual-assistant",
    originType: "assistant-staff",
  };
  added.push({ id: newId, name: legacy.name, legacyStaffId: staffId });
}

if (Object.keys(updates).length > 0) {
  updateDb(`/retreats/${retreatId}/teachers`, updates, "teachers.patch.json");
}

const summary = {
  retreatId,
  addedCount: added.length,
  added,
  backupDir,
};
fs.writeFileSync(path.join(backupDir, "summary.json"), JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2));
