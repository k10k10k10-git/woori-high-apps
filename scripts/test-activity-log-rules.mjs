import assert from "node:assert/strict";
import { createRequire, Module } from "node:module";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";

// 운영 주소·실제 계정으로 이 검사를 실행할 수 없도록 데모 에뮬레이터만 허용한다.
const project = "demo-activity-log";
const namespace = `${project}-default-rtdb`;
const host = process.env.FIREBASE_DATABASE_EMULATOR_HOST;
if (!host || !/^127\.0\.0\.1:\d+$/.test(host) || process.env.GCLOUD_PROJECT !== project) {
  throw new Error("demo-activity-log 로컬 DB 에뮬레이터 안에서만 실행할 수 있습니다.");
}
const require = createRequire(new URL("../highschool-app/package.json", import.meta.url));
const { initializeApp, deleteApp } = require("firebase/app");
const { connectDatabaseEmulator, getDatabase, get, ref, set, update, remove, serverTimestamp, goOffline } = require("firebase/database");
// 실제 쓰기 도우미를 번들하되 인증 입력만 합성 계정으로 교체한다. DB SDK·Rules는 실제 에뮬레이터를 사용한다.
const ts = require("typescript");
globalThis.__activityLogTestAuth = { currentUser: { uid: "leader", getIdTokenResult: async () => ({ claims: { name: "검증 계정" } }) } };
const compiledModules = new Map();
function loadSource(url) {
  const filename = fileURLToPath(url);
  if (compiledModules.has(filename)) return compiledModules.get(filename).exports;
  const compiled = new Module(filename);
  compiledModules.set(filename, compiled);
  compiled.require = (specifier) => {
    if (specifier === "firebase/database") return require(specifier);
    if (specifier === "@/lib/firebase") return { auth: globalThis.__activityLogTestAuth };
    if (specifier === "@/lib/paths") return loadSource(new URL("../highschool-app/src/lib/paths.ts", import.meta.url));
    if (specifier === "./writeModel") return loadSource(new URL("./writeModel.ts", url));
    throw new Error(`통합 검사에서 허용하지 않은 import: ${specifier}`);
  };
  const { outputText } = ts.transpileModule(readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  compiled._compile(outputText, filename);
  return compiled.exports;
}
const writer = loadSource(new URL("../highschool-app/src/features/activityLog/write.ts", import.meta.url));
const apps = [];
function client(uid, name = "검증 계정") {
  const app = initializeApp({ projectId: project, databaseURL: `https://${namespace}.firebaseio.com` }, uid || "anonymous");
  const database = getDatabase(app);
  const [hostname, port] = host.split(":");
  connectDatabaseEmulator(database, hostname, Number(port), uid ? { mockUserToken: { sub: uid, name } } : undefined);
  apps.push({ app, database });
  return database;
}
const admin = client("admin");
const leader = client("leader");
const field = client("field");
const stranger = client("stranger");
const attendanceAdmin = client("attendance-only");
const anonymous = client(null);
const record = (id, uid = "leader") => ({
  id, schemaVersion: 1, occurredAt: serverTimestamp(), recordedAt: serverTimestamp(),
  actor: { kind: "user", uid, name: "검증 계정" }, area: "attendance", action: "update",
  target: { path: "semesters/example/attendance/team/session/student", label: "검증 출석" },
  changes: [{ field: "출석 상태", after: "출석" }], changedCount: 1,
});
const denied = async (operation) => assert.rejects(operation, /permission_denied|PERMISSION_DENIED|Permission denied/i);
const seed = await fetch(`http://${host}/.json?ns=${namespace}`, {
  method: "PUT", headers: { Authorization: "Bearer owner", "Content-Type": "application/json" },
  body: JSON.stringify({ admins: { admin: true }, retreatAdmins: { leader: { role: "leader", name: "검증 계정" } },
    iguardMembers: { field: { name: "검증 계정" } }, attendanceAdmins: { "attendance-only": true },
    semesters: { example: { name: "검증 학기" } } }),
});
assert.equal(seed.status, 200);
let checks = 0;
async function check(label, run) { await run(); checks++; console.log(`PASS ${label}`); }
try {
  await check("승인 계정 원장·로그 동시 저장", async () => {
    await update(ref(leader), {
      "semesters/example/attendance/team/session/student": { s: "출석", by: "leader" },
      "activityLogs/events/first": record("first"),
    });
    const saved = (await get(ref(admin, "activityLogs/events/first"))).val();
    assert.equal(saved.actor.uid, "leader");
    assert.equal(typeof saved.occurredAt, "number");
    assert.equal(saved.occurredAt, saved.recordedAt);
  });
  await check("통합관리자 이외 로그 조회 거부", async () => {
    for (const database of [leader, field, stranger, attendanceAdmin, anonymous]) await denied(get(ref(database, "activityLogs/events")));
  });
  await check("통합관리자도 기존 로그 수정·삭제 불가", async () => {
    await denied(update(ref(admin, "activityLogs/events/first"), { action: "delete" }));
    await denied(remove(ref(admin, "activityLogs/events/first")));
    await denied(remove(ref(admin, "activityLogs")));
  });
  await check("다른 UID·이름·과거 시각·미등록 필드 거부", async () => {
    const attempts = [
      { ...record("bad"), actor: { kind: "user", uid: "admin" } },
      { ...record("bad"), actor: { kind: "user", uid: "leader", name: "다른 사람" } },
      { ...record("bad"), occurredAt: 123 },
      { ...record("bad"), extra: "원문" },
      { ...record("bad"), changes: [{ field: "연락처", after: "연락처 원문" }] },
      { ...record("bad"), changes: [{ field: "출석 상태", before: "결석", after: "출석" }] },
    ];
    for (const attempt of attempts) await denied(set(ref(leader, "activityLogs/events/bad"), attempt));
  });
  await check("로그 검증 실패 시 원장 변경도 함께 취소", async () => {
    await denied(update(ref(leader), {
      "semesters/example/attendance/team/session/student/s": "결석",
      "activityLogs/events/invalid": { ...record("invalid"), actor: { kind: "user", uid: "admin" } },
    }));
    assert.equal((await get(ref(admin, "semesters/example/attendance/team/session/student/s"))).val(), "출석");
  });
  await check("미승인 계정·학생앱 전용관리자는 일반 로그 생성 불가", async () => {
    for (const [database, uid] of [[stranger, "stranger"], [attendanceAdmin, "attendance-only"]]) await denied(set(ref(database, "activityLogs/events/unapproved"), record("unapproved", uid)));
  });
  await check("미승인 계정은 본인 접근 요청 기록만 생성", async () => {
    const own = { ...record("request", "stranger"), area: "requests", target: { path: "iguardPending/stranger/siteRequests/example", label: "본인 요청" } };
    await set(ref(stranger, "activityLogs/events/request"), own);
    await denied(set(ref(stranger, "activityLogs/events/other-request"), { ...own, id: "other-request", target: { ...own.target, path: "iguardPending/admin/siteRequests/example" } }));
  });
  await check("이가드 계정 기록·원문 생략·1001행 일괄 저장", async () => {
    await set(ref(field, "activityLogs/events/field"), { ...record("field", "field"), area: "field", changes: [{ field: "특이사항", redacted: true }] });
    const values = Object.fromEntries(Array.from({ length: 1001 }, (_, i) => [`student-${i}`, { s: "출석" }]));
    await update(ref(leader), { "semesters/example/attendance/team/session": values, "activityLogs/events/bulk": record("bulk") });
    assert.equal((await get(ref(admin, "semesters/example/attendance/team/session"))).size, 1001);
  });
  await check("출석부 전용 권한은 기존 상태 유지", async () => {
    await denied(set(ref(field, "classes/2026/1-1-1/students/blocked"), { name: "검증" }));
    await denied(set(ref(leader, "classes/2026/1-1-1/students/blocked"), { name: "검증" }));
  });
  await check("실제 앱 도우미로 학생·날짜·상태·로그 한 번에 저장", async () => {
    const before = (await get(ref(admin, "activityLogs/events"))).size;
    await writer.auditedUpdate(ref(leader, "semesters/example/attendance/team/session/fixture"), { s: "결석", by: "leader" }, { subjectName: "검증학생", date: "2026-09-06" });
    const records = (await get(ref(admin, "activityLogs/events"))).val();
    assert.equal(Object.keys(records).length, before + 1);
    const saved = Object.values(records).find((entry) => entry.target.label.includes("검증학생"));
    assert.ok(saved);
    assert.equal(saved.actor.uid, "leader");
    assert.equal(saved.occurredAt, saved.recordedAt);
    assert.equal(saved.changes[0].after, "결석");
    assert.equal(saved.changes[0].before, undefined);
    assert.ok(saved.target.context.includes("2026-09-06"));
  });
  await check("실제 도우미의 UID가 DB 인증과 다르면 업무 저장도 거부", async () => {
    globalThis.__activityLogTestAuth.currentUser = { uid: "admin", getIdTokenResult: async () => ({ claims: { name: "검증 계정" } }) };
    await denied(writer.auditedUpdate(ref(leader, "semesters/example/attendance/team/session/fixture"), { s: "출석" }));
    assert.equal((await get(ref(admin, "semesters/example/attendance/team/session/fixture/s"))).val(), "결석");
  });
  console.log(`${checks} activity log Rules checks passed (local demo only)`);
} finally {
  delete globalThis.__activityLogTestAuth;
  for (const { app, database } of apps) { goOffline(database); await deleteApp(app); }
}
