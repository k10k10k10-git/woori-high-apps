import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const args = new Map();
for (let index = 2; index < process.argv.length; index += 2) {
  args.set(process.argv[index], process.argv[index + 1]);
}

const inputDir = args.get("--input");
const updatesFile = args.get("--updates");
const reportFile = args.get("--report");
if (!inputDir) throw new Error("--input <Firebase JSON 백업 디렉터리>가 필요합니다.");

const asRecord = (value) => value && typeof value === "object" && !Array.isArray(value) ? value : {};
const text = (value) => typeof value === "string" ? value.trim() : "";
const digits = (value) => text(value).replace(/\D/g, "");
const compactBirth = (value) => digits(value);
const normalizeName = (value) => text(value).replace(/^\d+/, "").replace(/\s+/g, "");
const stripSuffix = (value) => {
  const match = value.match(/^(.+[가-힣])([A-Z])$/);
  return match ? match[1].trim() : value;
};

async function readRoot(name) {
  const value = JSON.parse(await readFile(resolve(inputDir, `${name}.json`), "utf8"));
  return asRecord(value);
}

function addRecord(records, input) {
  const name = stripSuffix(normalizeName(input.value.name));
  if (name.length < 2) return;
  records.push({
    path: input.path,
    year: String(input.year),
    kind: input.kind,
    name,
    birth: compactBirth(input.value.birth),
    phone: digits(input.value.phone),
    personId: text(input.value.personId),
  });
}

function collectStudents(classes) {
  const records = [];
  for (const [year, yearValue] of Object.entries(classes)) {
    for (const [classKey, classValue] of Object.entries(asRecord(yearValue))) {
      for (const [studentId, studentValue] of Object.entries(asRecord(asRecord(classValue).students))) {
        addRecord(records, {
          path: `classes/${year}/${classKey}/students/${studentId}`,
          year,
          kind: "student",
          value: asRecord(studentValue),
        });
      }
    }
  }
  return records;
}

function collectFlatYearRoot(root, rootName, kind) {
  const records = [];
  for (const [year, yearValue] of Object.entries(root)) {
    for (const [entryId, entryValue] of Object.entries(asRecord(yearValue))) {
      addRecord(records, { path: `${rootName}/${year}/${entryId}`, year, kind, value: asRecord(entryValue) });
    }
  }
  return records;
}

function collectNestedYearRoot(root, rootName, kind) {
  const records = [];
  function walk(value, segments) {
    if (!value || typeof value !== "object") return;
    const record = asRecord(value);
    if (text(record.name)) {
      addRecord(records, { path: [rootName, ...segments].join("/"), year: segments[0], kind, value: record });
      return;
    }
    for (const [key, child] of Object.entries(value)) walk(child, [...segments, key]);
  }
  walk(root, []);
  return records;
}

class UnionFind {
  constructor(size) {
    this.parent = Array.from({ length: size }, (_, index) => index);
  }
  find(index) {
    if (this.parent[index] !== index) this.parent[index] = this.find(this.parent[index]);
    return this.parent[index];
  }
  union(left, right) {
    const a = this.find(left);
    const b = this.find(right);
    if (a !== b) this.parent[b] = a;
  }
}

function studentStrongKey(record) {
  if (record.birth.length < 6 || record.phone.length < 8) return "";
  return `${record.name}|${record.birth}|${record.phone}`;
}

function canMergeWorker(left, right) {
  if (left.kind !== right.kind || left.name !== right.name) return false;
  if (left.phone.length >= 8 && right.phone.length >= 8 && left.phone === right.phone) {
    return !(left.birth.length >= 6 && right.birth.length >= 6 && left.birth !== right.birth);
  }
  return left.birth.length >= 6 && right.birth.length >= 6 && left.birth === right.birth;
}

function deterministicPersonId(kind, canonicalPath) {
  const hash = createHash("sha256").update(`woori-high-person-v1|${kind}|${canonicalPath}`).digest("hex").slice(0, 24);
  return `person_${kind}_${hash}`;
}

function buildPlan(records) {
  const groups = new UnionFind(records.length);
  const ambiguousStudentIndexes = new Set();
  const studentsByStrongKey = new Map();

  records.forEach((record, index) => {
    if (record.kind !== "student") return;
    const key = studentStrongKey(record);
    if (!key) return;
    const indexes = studentsByStrongKey.get(key) ?? [];
    indexes.push(index);
    studentsByStrongKey.set(key, indexes);
  });

  for (const indexes of studentsByStrongKey.values()) {
    const years = new Map();
    for (const index of indexes) {
      const values = years.get(records[index].year) ?? [];
      values.push(index);
      years.set(records[index].year, values);
    }
    if ([...years.values()].some((values) => values.length > 1)) {
      indexes.forEach((index) => ambiguousStudentIndexes.add(index));
      continue;
    }
    for (let index = 1; index < indexes.length; index += 1) groups.union(indexes[0], indexes[index]);
  }

  for (let left = 0; left < records.length; left += 1) {
    if (records[left].kind === "student") continue;
    for (let right = left + 1; right < records.length; right += 1) {
      if (canMergeWorker(records[left], records[right])) groups.union(left, right);
    }
  }

  const clusters = new Map();
  records.forEach((record, index) => {
    const root = groups.find(index);
    const values = clusters.get(root) ?? [];
    values.push(record);
    clusters.set(root, values);
  });

  const updates = {};
  const countsByKind = {};
  const peopleByKind = {};
  let reusedPersonIds = 0;
  for (const cluster of clusters.values()) {
    const existing = [...new Set(cluster.map((record) => record.personId).filter(Boolean))];
    if (existing.length > 1) {
      throw new Error(`서로 다른 기존 personId가 한 동일인 후보에 포함됐습니다: ${cluster.map((record) => record.path).join(", ")}`);
    }
    const canonical = [...cluster].sort((a, b) => a.path.localeCompare(b.path))[0];
    const personId = existing[0] || deterministicPersonId(canonical.kind, canonical.path);
    if (existing.length === 1) reusedPersonIds += 1;
    peopleByKind[canonical.kind] = (peopleByKind[canonical.kind] ?? 0) + 1;
    for (const record of cluster) {
      countsByKind[record.kind] = (countsByKind[record.kind] ?? 0) + 1;
      if (record.personId !== personId) updates[`${record.path}/personId`] = personId;
    }
  }

  return {
    updates,
    report: {
      schemaVersion: 1,
      totalRecords: records.length,
      updatePaths: Object.keys(updates).length,
      countsByKind,
      peopleByKind,
      linkedRecordSavings: records.length - clusters.size,
      ambiguousStudentRecords: ambiguousStudentIndexes.size,
      ambiguousStudentGroups: [...studentsByStrongKey.values()].filter((indexes) => indexes.some((index) => ambiguousStudentIndexes.has(index))).length,
      reusedPersonIds,
    },
  };
}

const [classes, teacherStaff, teacherSpecial, teacherExtra, teacherAdditional] = await Promise.all([
  readRoot("classes"),
  readRoot("teacherStaff"),
  readRoot("teacherSpecial"),
  readRoot("teacherExtra"),
  readRoot("teacherAdditional"),
]);

const sourceRecords = {
  classes: collectStudents(classes),
  teacherStaff: collectFlatYearRoot(teacherStaff, "teacherStaff", "staff"),
  teacherSpecial: collectNestedYearRoot(teacherSpecial, "teacherSpecial", "teacher"),
  teacherExtra: collectNestedYearRoot(teacherExtra, "teacherExtra", "teacher"),
  teacherAdditional: collectNestedYearRoot(teacherAdditional, "teacherAdditional", "teacher"),
};
const records = Object.values(sourceRecords).flat();

const { updates, report } = buildPlan(records);
report.sourceCounts = Object.fromEntries(Object.entries(sourceRecords).map(([name, values]) => [name, values.length]));
if (updatesFile) await writeFile(resolve(updatesFile), `${JSON.stringify(updates, null, 2)}\n`, { mode: 0o600 });
if (reportFile) await writeFile(resolve(reportFile), `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
