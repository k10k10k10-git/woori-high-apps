#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports */

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const PROJECT_ID = "woori-high";
const ROOT = path.resolve(__dirname, "..");
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const backupDir = path.join(ROOT, "backups", `db-audit-${stamp}`);

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
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

function updateDb(pathname, data) {
  const tmpFile = path.join(backupDir, `payload-${pathname.replace(/[\/]/g, "_")}.json`);
  fs.writeFileSync(tmpFile, JSON.stringify(data, null, 2));
  runFirebase(["database:update", pathname, tmpFile, "--project", PROJECT_ID, "--force"]);
}

function setDb(pathname, data) {
  const tmpFile = path.join(backupDir, `payload-${pathname.replace(/[\/]/g, "_")}.json`);
  fs.writeFileSync(tmpFile, JSON.stringify(data, null, 2));
  runFirebase(["database:set", pathname, tmpFile, "--project", PROJECT_ID, "--force"]);
}

function writeBackup(filename, data) {
  fs.writeFileSync(path.join(backupDir, filename), JSON.stringify(data, null, 2));
}

function normalizeStudentCollection(students) {
  if (!students || typeof students !== "object") return {};
  const entries = Array.isArray(students) ? students.entries() : Object.entries(students);
  const out = {};
  for (const [rawKey, rawValue] of entries) {
    if (!rawValue || typeof rawValue !== "object") continue;
    const value = { ...rawValue };
    const sid = typeof value.id === "string" && value.id.trim() ? value.id.trim() : String(rawKey);
    out[sid] = value;
  }
  return out;
}

function migrateClasses2025() {
  const classes2025 = getDb("/classes/2025") || {};
  writeBackup("classes-2025.before.json", classes2025);

  const next = {};
  let convertedClassCount = 0;
  let updatedClassCount = 0;

  for (const [classKey, classData] of Object.entries(classes2025)) {
    const beforeStudents = classData && typeof classData === "object" ? classData.students : null;
    const wasArray = Array.isArray(beforeStudents);
    if (wasArray) convertedClassCount += 1;
    const normalizedStudents = normalizeStudentCollection(beforeStudents);
    next[classKey] = {
      ...(classData || {}),
      students: normalizedStudents,
    };
    if (wasArray) {
      setDb(`/classes/2025/${classKey}/students`, normalizedStudents);
      updatedClassCount += 1;
    }
  }

  writeBackup("classes-2025.after.json", next);

  return { convertedClassCount, updatedClassCount, classCount: Object.keys(next).length };
}

function cleanupAttendance2026() {
  const classes2026 = getDb("/classes/2026") || {};
  const attendance2026 = getDb("/attendance/2026") || {};
  writeBackup("attendance-2026.before.json", attendance2026);

  const validByClass = {};
  for (const [classKey, classData] of Object.entries(classes2026)) {
    validByClass[classKey] = new Set(Object.keys(normalizeStudentCollection(classData?.students)));
  }

  const next = {};
  const removed = [];
  const deleteUpdates = {};

  for (const [classKey, classAttendance] of Object.entries(attendance2026)) {
    const validStudents = validByClass[classKey] || new Set();
    const cleanedClassAttendance = {};

    for (const [studentId, studentAttendance] of Object.entries(classAttendance || {})) {
      if (validStudents.has(studentId)) {
        cleanedClassAttendance[studentId] = studentAttendance;
      } else {
        removed.push({ classKey, studentId });
        deleteUpdates[`${classKey}/${studentId}`] = null;
      }
    }

    next[classKey] = cleanedClassAttendance;
  }

  if (Object.keys(deleteUpdates).length > 0) {
    updateDb("/attendance/2026", deleteUpdates);
  }
  writeBackup("attendance-2026.after.json", next);
  writeBackup("attendance-2026.removed.json", removed);

  return {
    removedCount: removed.length,
    deletedKeyCount: Object.keys(deleteUpdates).length,
    classCount: Object.keys(next).length,
  };
}

function main() {
  ensureDir(backupDir);

  const classes2025 = migrateClasses2025();
  const attendance2026 = cleanupAttendance2026();

  const summary = { backupDir, classes2025, attendance2026 };
  writeBackup("summary.json", summary);
  console.log(JSON.stringify(summary, null, 2));
}

main();
