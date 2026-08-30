import { createHash } from "node:crypto";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const args = new Map();
for (let index = 2; index < process.argv.length; index += 2) {
  args.set(process.argv[index], process.argv[index + 1]);
}

const xlsxFile = args.get("--xlsx");
const inputDir = args.get("--input");
const updatesFile = args.get("--updates");
const reportFile = args.get("--report");
const now = args.get("--now") ?? new Date().toISOString();
if (!xlsxFile || !inputDir || !updatesFile || !reportFile) {
  throw new Error("--xlsx <파일> --input <백업 디렉터리> --updates <파일> --report <파일>이 필요합니다.");
}

const TARGET_SID = "2026-sunday";
const SOURCE_SHEET = "2026 새친구 시트";
const MIGRATION_ACTOR = "2026 새친구 시트 이관";
const asRecord = (value) => value && typeof value === "object" && !Array.isArray(value) ? value : {};
const text = (value) => value === null || value === undefined ? "" : String(value).trim();
const normalizeName = (value) => text(value).replace(/^\d+/, "").replace(/\s+/g, "").toLocaleLowerCase("ko");
const digits = (value) => text(value).replace(/\D/g, "");
const compact = (value) => value && typeof value === "object" && !Array.isArray(value)
  ? Object.fromEntries(Object.entries(value).filter(([, child]) => child !== undefined && child !== null && child !== ""))
  : value;

function validIsoDate(year, month, day) {
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function normalizeMonthDay(value, year = 2026) {
  const match = text(value).match(/^(\d{1,2})\s*[.\/-]\s*(\d{1,2})\.?$/);
  if (!match) return "";
  const month = Number(match[1]);
  const day = Number(match[2]);
  if (!validIsoDate(year, month, day)) return "";
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function normalizeBirth(value) {
  const raw = digits(value);
  const normalized = raw.length === 6 ? `20${raw}` : raw;
  if (normalized.length !== 8) return "";
  const year = Number(normalized.slice(0, 4));
  const month = Number(normalized.slice(4, 6));
  const day = Number(normalized.slice(6, 8));
  if (!validIsoDate(year, month, day)) return "";
  return `${normalized.slice(0, 4)}-${normalized.slice(4, 6)}-${normalized.slice(6, 8)}`;
}

function normalizePhone(value) {
  const raw = digits(value);
  if (raw.length !== 10 && raw.length !== 11) return "";
  if (raw.startsWith("02")) {
    return raw.length === 10
      ? `${raw.slice(0, 2)}-${raw.slice(2, 6)}-${raw.slice(6)}`
      : `${raw.slice(0, 2)}-${raw.slice(2, 5)}-${raw.slice(5)}`;
  }
  return raw.length === 11
    ? `${raw.slice(0, 3)}-${raw.slice(3, 7)}-${raw.slice(7)}`
    : `${raw.slice(0, 3)}-${raw.slice(3, 6)}-${raw.slice(6)}`;
}

function classKeyFrom(value) {
  const raw = typeof value === "number" ? String(Math.trunc(value)) : text(value).replace(/\.0$/, "");
  return /^[12][123]\d+$/.test(raw) && raw.length === 3 ? `${raw[0]}-${raw[1]}-${raw[2]}` : "";
}

function partGradeFromClassKey(classKey) {
  const match = text(classKey).match(/^([12])-([123])-\d+$/);
  return match ? { part: `${match[1]}부`, grade: Number(match[2]) } : null;
}

function normalizeDecision(value) {
  const raw = text(value).toUpperCase();
  if (raw === "O") return "등록";
  if (raw === "△") return "보류";
  if (raw === "X") return "미등록";
  return "미정";
}

function normalizeFaithStep(value) {
  return text(value).replace(/\s+/g, "");
}

function joinNotes(...values) {
  const result = [];
  for (const value of values.flat()) {
    const lines = text(value).split("\n").map((line) => line.trim()).filter(Boolean);
    for (const normalized of lines) {
      if (!result.includes(normalized)) result.push(normalized);
    }
  }
  return result.join("\n");
}

function mergeNoteText(existingValue, incomingValue) {
  const existing = text(existingValue);
  if (!existing) return text(incomingValue);
  const known = new Set(existing.split("\n").map((line) => line.trim()).filter(Boolean));
  const additions = text(incomingValue).split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !known.has(line));
  return additions.length ? `${existing}\n${additions.join("\n")}` : existing;
}

function sourceCreatedAt(registeredDate) {
  return registeredDate ? `${registeredDate}T03:00:00.000Z` : now;
}

function identifier(value, field) {
  if (field === "birth") return normalizeBirth(value);
  return digits(value).length >= 10 ? digits(value) : "";
}

function evidenceFor(source, candidate) {
  const identityFields = [
    ["birth", source.birth, candidate.birth],
    ["phone", source.phone, candidate.phone],
    ["parentPhone", source.parentPhone, candidate.pphone ?? candidate.parentPhone],
  ];
  const matched = [];
  const conflicted = [];
  for (const [field, sourceValue, candidateValue] of identityFields) {
    const left = identifier(sourceValue, field);
    const right = identifier(candidateValue, field);
    if (!left || !right) continue;
    if (left === right) matched.push(field);
    else conflicted.push(field);
  }
  return { matched, conflicted };
}

function chooseRosterMatch(source, roster) {
  const candidates = roster.filter((candidate) => normalizeName(candidate.student.name) === normalizeName(source.name));
  const scored = candidates.map((candidate) => {
    const evidence = evidenceFor(source, candidate.student);
    const classMatch = Boolean(source.assignedClassKey && source.assignedClassKey === candidate.classKey);
    const schoolMatch = Boolean(text(source.school) && normalizeName(source.school) === normalizeName(candidate.student.school));
    const score = evidence.matched.length * 10 + (classMatch ? 3 : 0) + (schoolMatch ? 1 : 0);
    return { ...candidate, ...evidence, classMatch, schoolMatch, score };
  }).filter((candidate) => candidate.matched.length > 0 && candidate.conflicted.length === 0)
    .sort((a, b) => b.score - a.score);
  if (!scored.length || (scored[1] && scored[0].score === scored[1].score)) return null;
  return scored[0];
}

function chooseExistingMatch(source, existingFriends) {
  const candidates = existingFriends.map((candidate) => {
    const evidence = evidenceFor(source, {
      birth: candidate.privateValue.birth,
      phone: candidate.privateValue.phone,
      parentPhone: candidate.privateValue.parentPhone,
    });
    const sameRegistration = Boolean(source.registeredDate && source.registeredDate === candidate.friend.registeredDate);
    const samePartGrade = source.part === candidate.friend.part && source.grade === candidate.friend.grade;
    return { ...candidate, ...evidence, score: evidence.matched.length * 10 + (sameRegistration ? 2 : 0) + (samePartGrade ? 1 : 0) };
  }).filter((candidate) => normalizeName(candidate.friend.name) === normalizeName(source.name))
    .filter((candidate) => candidate.conflicted.length === 0 && (candidate.matched.length > 0 || candidate.score >= 3))
    .sort((a, b) => b.score - a.score);
  if (!candidates.length || (candidates[1] && candidates[0].score === candidates[1].score)) return null;
  return candidates[0];
}

function deterministicId(rowNumber, name, registeredDate) {
  const fingerprint = createHash("sha256").update(`${rowNumber}|${name}|${registeredDate}`).digest("hex").slice(0, 6);
  return `sheet26_${String(rowNumber).padStart(3, "0")}_${fingerprint}`;
}

function rowSource(row, rowNumber) {
  const registeredDate = normalizeMonthDay(row[0]);
  const assignedClassKey = classKeyFrom(row[16]);
  const classPartGrade = partGradeFromClassKey(assignedClassKey);
  const explicitPart = ["1부", "2부"].includes(text(row[2])) ? text(row[2]) : "";
  const explicitGrade = [1, 2, 3].includes(Number(row[5])) ? Number(row[5]) : 0;
  const birth = normalizeBirth(row[7]);
  const phone = normalizePhone(row[8]);
  const parentPhone = normalizePhone(row[9]);
  const warnings = [];
  if (text(row[7]) && !birth) warnings.push(`생년월일 원본: ${text(row[7])}`);
  if (text(row[8]) && !phone) warnings.push(`본인 연락처 원본: ${text(row[8])}`);
  if (text(row[9]) && !parentPhone) warnings.push(`주양육자 연락처 원본: ${text(row[9])}`);
  if (text(row[13]) && !normalizeMonthDay(row[13])) warnings.push(`2주차 원본: ${text(row[13])}`);
  if (text(row[16]) && !assignedClassKey) warnings.push(`반배정 원본: ${text(row[16])}`);
  if (explicitPart && classPartGrade && explicitPart !== classPartGrade.part) {
    warnings.push(`부서 원본 ${explicitPart} / 반배정 기준 ${classPartGrade.part}`);
  }
  return {
    rowNumber,
    name: text(row[1]),
    part: explicitPart || classPartGrade?.part || "",
    grade: explicitGrade || classPartGrade?.grade || 0,
    gender: ["남", "여"].includes(text(row[3])) ? text(row[3]) : "",
    school: text(row[4]),
    address: text(row[6]),
    birth,
    phone,
    parentPhone,
    owner: text(row[10]),
    decision: normalizeDecision(row[11]),
    sourceDecision: normalizeDecision(row[11]),
    week1Date: normalizeMonthDay(row[12]),
    week2Date: normalizeMonthDay(row[13]),
    registeredDate,
    inviter: text(row[14]),
    faithStep: normalizeFaithStep(row[15]),
    assignedClassKey,
    churchFriend: text(row[17]),
    teamMemo: text(row[18]),
    pastoralNotes: joinNotes(
      text(row[19]) && `교역자 심방: ${text(row[19])}`,
      text(row[20]) && `특이사항 및 심방내용: ${text(row[20])}`,
    ),
    familyNotes: joinNotes(
      text(row[21]) && `가족사항: ${text(row[21])}`,
      text(row[22]) && `부: ${text(row[22])}`,
      text(row[23]) && `모: ${text(row[23])}`,
      text(row[24]) && `형제: ${text(row[24])}`,
      text(row[25]) && `형제2: ${text(row[25])}`,
      text(row[26]) && `형제3: ${text(row[26])}`,
    ),
    warnings,
  };
}

function mergeExisting(existing, incoming, memoFields = []) {
  const next = { ...incoming };
  for (const [key, value] of Object.entries(existing ?? {})) {
    if (memoFields.includes(key)) continue;
    if (value !== undefined && value !== null && value !== "") next[key] = value;
  }
  for (const field of memoFields) next[field] = mergeNoteText(existing?.[field], incoming?.[field]);
  return compact(next);
}

function leafUpdates(basePath, before, after) {
  const updates = {};
  for (const [key, value] of Object.entries(after)) {
    if (JSON.stringify(before?.[key]) !== JSON.stringify(value)) updates[`${basePath}/${key}`] = value;
  }
  return updates;
}

const XLSXModule = await import("xlsx");
const XLSX = XLSXModule.default ?? XLSXModule;
const workbook = XLSX.readFile(resolve(xlsxFile), { cellDates: false });
const worksheet = workbook.Sheets[SOURCE_SHEET];
if (!worksheet) throw new Error(`시트 '${SOURCE_SHEET}'를 찾을 수 없습니다.`);
const matrix = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: null, raw: true });
const dataRows = matrix.slice(1)
  .map((row, index) => ({ row, rowNumber: index + 2 }))
  .filter(({ row }) => row.some((value) => text(value)));

const files = await readdir(resolve(inputDir));
const publicFiles = files.filter((file) => /^newFriends-2026.*\.json$/.test(file) && !file.startsWith("newFriendsPrivate"));
const existingFriends = [];
for (const publicFile of publicFiles) {
  const sid = publicFile.replace(/^newFriends-/, "").replace(/\.json$/, "");
  const publicValue = asRecord(JSON.parse(await readFile(resolve(inputDir, publicFile), "utf8")));
  const privateFile = resolve(inputDir, `newFriendsPrivate-${sid}.json`);
  const privateValue = await readFile(privateFile, "utf8").then(JSON.parse).catch(() => null);
  for (const [id, friend] of Object.entries(publicValue)) {
    existingFriends.push({ sid, id, friend: asRecord(friend), privateValue: asRecord(asRecord(privateValue)[id]) });
  }
}

const classes = asRecord(JSON.parse(await readFile(resolve(inputDir, "classes-2026.json"), "utf8")));
const roster = [];
for (const [classKey, classValue] of Object.entries(classes)) {
  for (const [studentId, studentValue] of Object.entries(asRecord(asRecord(classValue).students))) {
    roster.push({ classKey, studentId, student: asRecord(studentValue) });
  }
}

const updates = {};
const auditRows = [];
let created = 0;
let updatedExisting = 0;
let rosterLinked = 0;
let rosterInferredOnly = 0;
let statusReconciled = 0;

for (const { row, rowNumber } of dataRows) {
  const source = rowSource(row, rowNumber);
  if (!source.name) continue;
  const plannedId = deterministicId(rowNumber, source.name, source.registeredDate);
  const existingMatch = existingFriends.find((candidate) => candidate.sid === TARGET_SID && candidate.id === plannedId)
    ?? chooseExistingMatch(source, existingFriends);
  const rosterMatch = chooseRosterMatch(source, roster);
  const sameNameRoster = roster.filter((candidate) => normalizeName(candidate.student.name) === normalizeName(source.name));
  const displayFallback = !rosterMatch && sameNameRoster.length === 1 ? sameNameRoster[0] : null;
  const fallbackPartGrade = partGradeFromClassKey((rosterMatch ?? displayFallback)?.classKey);
  const warnings = [...source.warnings];

  let part = source.part || fallbackPartGrade?.part || "1부";
  let grade = source.grade || fallbackPartGrade?.grade || 0;
  let assignedClassKey = source.assignedClassKey;
  let decision = source.decision;
  let rosterSync;

  if (rosterMatch) {
    const authoritative = partGradeFromClassKey(rosterMatch.classKey);
    if (source.part && authoritative && source.part !== authoritative.part) {
      warnings.push(`현재 출석부 기준 부서 보완: ${source.part} → ${authoritative.part}`);
    }
    if (source.grade && authoritative && source.grade !== authoritative.grade) {
      warnings.push(`현재 출석부 기준 학년 보완: ${source.grade} → ${authoritative.grade}`);
    }
    part = authoritative?.part || part;
    grade = authoritative?.grade || grade;
    assignedClassKey = rosterMatch.classKey;
    if (source.decision !== "등록") {
      warnings.push(`시트 원본 등록가부: ${source.decision}`);
      decision = "등록";
      statusReconciled += 1;
    }
    rosterSync = compact({
      studentId: rosterMatch.studentId,
      personId: text(rosterMatch.student.personId),
      classKey: rosterMatch.classKey,
      syncedAt: now,
      syncedBy: MIGRATION_ACTOR,
    });
    rosterLinked += 1;
  } else if (displayFallback && (!source.part || !source.grade)) {
    warnings.push(`부서·학년 표시만 2026 출석부의 유일한 동일 이름 후보(${displayFallback.classKey})로 보완; 자동 연결은 보류`);
    rosterInferredOnly += 1;
  }

  const id = existingMatch?.id ?? plannedId;
  const sid = existingMatch?.sid ?? TARGET_SID;
  const publicIncoming = compact({
    name: source.name,
    part,
    gender: source.gender,
    school: source.school,
    grade,
    owner: source.owner,
    decision,
    week1Date: source.week1Date,
    week2Date: source.week2Date,
    registeredDate: source.registeredDate,
    inviter: source.inviter,
    faithStep: source.faithStep,
    assignedClassKey,
    createdAt: sourceCreatedAt(source.registeredDate),
    createdBy: MIGRATION_ACTOR,
    updatedAt: now,
    rosterSync,
  });
  const privateIncoming = compact({
    birth: source.birth,
    phone: source.phone,
    parentPhone: source.parentPhone,
    address: source.address,
    churchFriend: source.churchFriend,
    teamMemo: joinNotes(source.teamMemo, warnings.map((warning) => `[이관 확인] ${warning}`)),
    familyNotes: source.familyNotes,
    pastoralNotes: source.pastoralNotes,
  });

  if (existingMatch) {
    let nextPublic = mergeExisting(existingMatch.friend, publicIncoming);
    const nextPrivate = mergeExisting(existingMatch.privateValue, privateIncoming, ["teamMemo", "familyNotes", "pastoralNotes"]);
    // 출석부에서 강하게 확인된 현재 상태는 과거 시트나 기존 접수값보다 우선한다.
    if (rosterSync) {
      const previousSync = asRecord(existingMatch.friend.rosterSync);
      const sameRosterLink = previousSync.studentId === rosterSync.studentId
        && previousSync.classKey === rosterSync.classKey;
      nextPublic = {
        ...nextPublic,
        part,
        grade,
        decision,
        assignedClassKey,
        rosterSync: sameRosterLink ? previousSync : rosterSync,
      };
    }
    const publicChanges = leafUpdates(`semesters/${sid}/newFriends/${id}`, existingMatch.friend, nextPublic);
    const privateChanges = leafUpdates(`semestersPrivate/${sid}/newFriendsPrivate/${id}`, existingMatch.privateValue, nextPrivate);
    Object.assign(updates, publicChanges, privateChanges);
    if (Object.keys(publicChanges).length || Object.keys(privateChanges).length) updatedExisting += 1;
  } else {
    updates[`semesters/${sid}/newFriends/${id}`] = publicIncoming;
    // RTDB는 빈 객체를 저장하지 않으므로 비공개 값이 실제로 있을 때만 경로를 만든다.
    if (Object.keys(privateIncoming).length) {
      updates[`semestersPrivate/${sid}/newFriendsPrivate/${id}`] = privateIncoming;
    }
    created += 1;
  }

  auditRows.push({
    sheetRow: rowNumber,
    name: source.name,
    target: `${sid}/${id}`,
    action: existingMatch ? "update" : "create",
    roster: rosterMatch ? `${rosterMatch.classKey}/${rosterMatch.studentId}` : null,
    warnings,
  });
}

const report = {
  mode: "dry-run-plan",
  sourceSheet: SOURCE_SHEET,
  sourceRows: dataRows.length,
  created,
  updatedExisting,
  rosterLinked,
  rosterInferredOnly,
  statusReconciled,
  updatePaths: Object.keys(updates).length,
  writesOutsideOwnedPaths: Object.keys(updates).filter((path) => !path.startsWith("semesters/") && !path.startsWith("semestersPrivate/")),
  untouched: ["classes/2026", "attendance/2026", "trash/2026", "Firebase Rules"],
  auditRows,
};

await writeFile(resolve(updatesFile), `${JSON.stringify(updates, null, 2)}\n`);
await writeFile(resolve(reportFile), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ ...report, auditRows: undefined }, null, 2));
