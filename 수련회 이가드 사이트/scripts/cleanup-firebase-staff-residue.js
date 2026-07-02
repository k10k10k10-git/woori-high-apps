#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports */

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const PROJECT_ID = "woori-high";
const ROOT = path.resolve(__dirname, "..");
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const backupDir = path.join(ROOT, "backups", `firebase-cleanup-${stamp}`);
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

function setDb(pathname, data, filename) {
  const tmpFile = path.join(backupDir, filename);
  fs.writeFileSync(tmpFile, JSON.stringify(data, null, 2));
  runFirebase(["database:set", pathname, tmpFile, "--project", PROJECT_ID, "--force"]);
}

function updateDb(pathname, data, filename) {
  const tmpFile = path.join(backupDir, filename);
  fs.writeFileSync(tmpFile, JSON.stringify(data, null, 2));
  runFirebase(["database:update", pathname, tmpFile, "--project", PROJECT_ID, "--force"]);
}

const rulesWrapper = getDb("/.settings/rules");
const rules = rulesWrapper && rulesWrapper.rules ? rulesWrapper.rules : rulesWrapper;
if (!rules || typeof rules !== "object") {
  throw new Error("Failed to load current RTDB rules.");
}

fs.writeFileSync(path.join(backupDir, "rules.before.json"), JSON.stringify(rules, null, 2));
fs.writeFileSync(path.join(backupDir, "staff_admins.before.json"), JSON.stringify(getDb("/staff_admins"), null, 2));
fs.writeFileSync(path.join(backupDir, "staff_roles.before.json"), JSON.stringify(getDb("/staff_roles"), null, 2));

const nextRules = JSON.parse(JSON.stringify(rules));

nextRules.retreatAdmins = {
  ".read": "auth != null && root.child('admins').child(auth.uid).val() === true",
  ".write": "auth != null && root.child('admins').child(auth.uid).val() === true",
  "$uid": {
    ".read": "auth != null && (root.child('admins').child(auth.uid).val() === true || auth.uid === $uid)",
  },
};

nextRules.iguardMembers = {
  ".read": "auth != null && root.child('admins').child(auth.uid).val() === true",
  ".write": "auth != null && root.child('admins').child(auth.uid).val() === true",
  "$uid": {
    ".read": "auth != null && (root.child('admins').child(auth.uid).val() === true || auth.uid === $uid)",
  },
};

nextRules.iguardRoles = {
  ".read": "auth != null && root.child('admins').child(auth.uid).val() === true",
  ".write": "auth != null && root.child('admins').child(auth.uid).val() === true",
  "$uid": {
    ".read": "auth != null && (root.child('admins').child(auth.uid).val() === true || auth.uid === $uid)",
    ".validate": "newData.val() === 'staff' || newData.val() === 'team'",
  },
};

fs.writeFileSync(path.join(backupDir, "rules.after.json"), JSON.stringify(nextRules, null, 2));
setDb("/.settings/rules", { rules: nextRules }, "rules.after.payload.json");

const deletePatch = {
  staff_admins: null,
  staff_roles: null,
  staff_members: null,
  staff_attendance: null,
  staff_events: null,
};
updateDb("/", deletePatch, "delete-staff-residue.patch.json");

const summary = {
  backupDir,
  removedNodes: Object.keys(deletePatch),
  tightenedRules: ["retreatAdmins", "iguardMembers", "iguardRoles"],
};
fs.writeFileSync(path.join(backupDir, "summary.json"), JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2));
