import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PraiseActor, PraiseCommand, PraiseState } from "../types";
vi.mock("server-only", () => ({}));
const memory = vi.hoisted(() => ({ rows: new Map<string, unknown>(), state: null as PraiseState | null, reads: [] as string[], writes: 0, writePaths: [] as string[], failFinalize: false, failResolutionFinalize: false, failEntryAfterCommit: false, concurrentEntry: undefined as unknown, failBeforeCommit: false, mutateBeforeTransaction: undefined as (() => void) | undefined, replayWith: undefined as unknown, beforeStageVerify: undefined as (() => void) | undefined, beforeCheckedRetry: undefined as (() => void) | undefined, beforeWorkspaceTransaction: undefined as (() => void) | undefined, afterWorkspaceTransaction: undefined as (() => void) | undefined }));
const store = vi.hoisted(() => {
  const object = (value: unknown): Record<string, unknown> => value && typeof value === "object" ? value as Record<string, unknown> : {};
  const get = (path: string): unknown => {
    let result: unknown = null;
    for (const [key, value] of [...memory.rows].sort((a,b) => a[0].length - b[0].length)) {
      if (path === key) result = structuredClone(value);
      else if (path.startsWith(key + "/")) {
        let child: unknown = value; for (const segment of path.slice(key.length + 1).split("/")) child = object(child)[segment];
        if (child !== undefined) result = structuredClone(child);
      } else if (key.startsWith(path + "/")) {
        const root = object(result), segments = key.slice(path.length + 1).split("/"); let parent = root;
        for (const segment of segments.slice(0,-1)) { parent[segment] ??= {}; parent = object(parent[segment]); }
        if (value === null) delete parent[segments.at(-1)!]; else parent[segments.at(-1)!] = structuredClone(value);
        result = root;
      }
    }
    return result;
  };
  const set = (path: string, value: unknown) => {
    for (const key of [...memory.rows.keys()]) if (key === path || key.startsWith(path + "/")) memory.rows.delete(key);
    memory.rows.set(path, structuredClone(value));
  };
  return {get, set};
});
vi.mock("./firebaseAdmin", () => ({
  praiseUnavailable: (code: string) => Object.assign(new Error(code), { code }),
  getPraiseFirebaseAdmin: () => ({ database: { ref: (path: string) => {
    const reference = {
      get: async () => { memory.reads.push(path); return { val: () => store.get(path) }; },
      orderByChild: () => ({ equalTo: () => reference }),
      on: (_event: string, listener: () => void) => listener(), off: () => {},
      transaction: async (update: (raw: unknown) => unknown) => {
        if (memory.failBeforeCommit) { memory.failBeforeCommit = false; throw new Error("network"); }
        if (memory.concurrentEntry !== undefined) { store.set("semesters/2026-2/attendance/team/session/1_student", memory.concurrentEntry); memory.concurrentEntry = undefined; }
        memory.mutateBeforeTransaction?.(); memory.mutateBeforeTransaction = undefined;
        let next = update(store.get(path));
        if (memory.replayWith !== undefined) { store.set(path, memory.replayWith); memory.replayWith = undefined; next = update(store.get(path)); }
        if (next !== undefined) { memory.writes++; memory.writePaths.push(path); store.set(path, next); }
        if (memory.failEntryAfterCommit) { memory.failEntryAfterCommit = false; throw new Error("lost response"); }
        return { committed: next !== undefined, snapshot: { val: () => store.get(path) } };
      },
    };
    return reference;
  } } }),
}));
vi.mock("./repository", () => ({ transactWorkspaceChecked: async (_id: string, update: (current: PraiseState | null) => PraiseState | undefined, verify: (current: PraiseState | null) => Promise<void>) => {
  let current = structuredClone(memory.state), next = update(current);
  if (next === current || next === undefined) return current;
  memory.beforeStageVerify?.(); memory.beforeStageVerify = undefined;
  await verify(current);
  if (memory.beforeCheckedRetry) {
    const retry = memory.beforeCheckedRetry; memory.beforeCheckedRetry = undefined; retry();
    current = structuredClone(memory.state); next = update(current);
    if (next === current || next === undefined) return current;
    await verify(current);
  }
  memory.state = next; return structuredClone(next);
}, readWorkspace: async () => structuredClone(memory.state), listWorkspaceIds: async () => [], transactWorkspace: async (_id: string, update: (current: PraiseState | null) => PraiseState | undefined) => {
  const before = memory.beforeWorkspaceTransaction; memory.beforeWorkspaceTransaction = undefined; before?.();
  const next = update(structuredClone(memory.state));
  if (memory.failFinalize && next && Object.values(next.operations).some(op => op.sharedAttendance?.phase === "complete")) { memory.failFinalize = false; throw new Error("audit unavailable"); }
  if (memory.failResolutionFinalize && next && Object.values(next.operations).some(op => op.sharedAttendanceResolution?.phase === "complete")) { memory.failResolutionFinalize = false; throw new Error("resolution audit unavailable"); }
  if (next !== undefined) memory.state = next;
  const after = memory.afterWorkspaceTransaction; memory.afterWorkspaceTransaction = undefined; after?.();
  return structuredClone(memory.state);
} }));
vi.mock("./projection", () => ({ projectPraiseAudit: async () => false }));
vi.mock("./references", () => ({ praiseReferences: async () => [{ id: "2026-2", title: "합성 학기", teams: [{ id: "praise", name: "합성 찬양" }] }], validateSemesterLink: async () => {}, praiseAccounts: async () => [] }));
import { createPraise, createPraiseReferences, executePraise, readPraiseView } from "./service";
import { createPraiseState, applyPraiseCommand } from "./commands";
import { initialSharedSessions, loadSharedAttendance, overlaySharedAttendance, sharedRevision, sharedNumericRevision, assertSharedAttendanceCurrent } from "./sharedAttendance";
import { executeSharedAttendance, resolveSharedAttendance, pendingSharedAttendance, sharedOperationKey, sharedSemesterUpdate, closeSharedSemester } from "./sharedAttendanceWrite";
import { praiseView } from "./view";
import { stageInputRevision, generatePraiseStage } from "./stageModel";
import { parseCommand } from "./parsers";

const actor: PraiseActor = { uid: "synthetic_manager", roles: { semester: "superAdmin", retreat: "none" } };
const staff: PraiseActor = { uid: "synthetic_staff", roles: { semester: "praise", retreat: "none" } };
const entryPath = "semesters/2026-2/attendance/team/session/1_student";
function fixture(): PraiseState {
  const s = createPraiseState({ operationId: "create", workspace: { id: "synthetic", name: "합성 학기", startDate: "2026-09-05", endDate: "2026-09-05", semesterId: "2026-2", teamId: "praise" } }, actor, 1000);
  s.meta.mode = "live"; s.meta.activeGroupVersionId = "group";
  s.meetings.m_20260905.linkedSessionId = "session";
  for (const id of ["student", "other"]) s.people[id] = { id, kind: "STUDENT", name: "합성 학생", grade: 1, gender: "FEMALE", department: "FIRST", team: "SINGER", active: true, isStudentLeader: false, singerCapable: true, groupStaffCapable: false, preferredService: "BOTH", excludeFromAutoSinger: false, revision: 1, updatedAt: 1000, updatedBy: actor.uid, rosterLink: { applicationKey: `1_${id}`, personId: `person_student_${id}`, year: "2026", classKey: "1-1-1", studentId: id } };
  s.people.staff = { ...s.people.student, id: "staff", kind: "STAFF", name: "합성 스탭", rosterLink: undefined, groupStaffCapable: true };
  s.groupVersions.group = { id: "group", number: 1, kind: "CONFIRMED", createdAt: 1000, createdBy: actor.uid, seed: 1, settings: s.policy.grouping, rules: [], groups: [{ id: "g", name: "합성 조", studentIds: ["student"], staffIds: ["staff"] }, { id: "g2", name: "합성 2조", studentIds: ["other"], staffIds: [] }], warnings: [], acknowledgedWarnings: true };
  s.attendance.m_20260905 = { student: { status: "ABSENT", groupVersionId: "group", revision: 3, updatedAt: 1000, updatedBy: actor.uid } };
  s.access[staff.uid] = { uid: staff.uid, staffId: "staff", role: "groupStaff", active: true, revision: 1, updatedAt: 1000, updatedBy: actor.uid };
  s.availability.m_20260905 = { staff: { present: true, role: "SINGER", revision: 1, updatedAt: 1000, updatedBy: actor.uid } };
  return s;
}
function seed() {
  memory.state = fixture(); memory.rows.clear(); memory.reads = []; memory.writes = 0; memory.writePaths = []; memory.mutateBeforeTransaction = undefined; memory.replayWith = undefined; memory.beforeStageVerify = undefined; memory.beforeCheckedRetry = undefined; memory.beforeWorkspaceTransaction = undefined; memory.afterWorkspaceTransaction = undefined; memory.failFinalize = false; memory.failResolutionFinalize = false; memory.failEntryAfterCommit = false; memory.concurrentEntry = undefined; memory.failBeforeCommit = false;
  memory.rows.set("semesters/2026-2/meta", { title: "합성 학기" });
  memory.rows.set("semesters/2026-2/teams/praise", { name: "합성 찬양" });
  memory.rows.set("semesters/2026-2/sessions", { session: { date: "2026-09-05" } });
  memory.rows.set("semesters/2026-2/applications", Object.fromEntries(["student", "other"].map(id => [`1_${id}`, { id: `1_${id}`, studentId: id, personId: `person_student_${id}`, bu: "1부", name: "합성 학생", grade: 1, class: 1, trainingClassId: "class", choice1: "praise", teamId: "praise", status: "배치", createdAt: "2026-09-01" }])));
}
async function snapshot() { return loadSharedAttendance(memory.state!); }
async function command(status: "PRESENT" | "ABSENT" | null = "PRESENT", personId = "student"): Promise<Extract<PraiseCommand, { type: "attendance.set" }>> {
  const shared = await snapshot(), entry = shared.targets.m_20260905[personId].raw;
  return { type: "attendance.set", meetingId: "m_20260905", personId, status, expectedRevision: sharedNumericRevision(entry), expectedSourceRevision: sharedRevision(entry) };
}
async function execute(cmd: Extract<PraiseCommand, { type: "attendance.set" }>, operationId = "write", who = actor) { return executeSharedAttendance(who, memory.state!, cmd, operationId, await snapshot()); }
beforeEach(seed);

describe("학기 공통 출석의 조회·미입력·매핑·권한", () => {
  it.each([["출석", "PRESENT"], ["지각", "PRESENT"], ["결석", "ABSENT"], [null, null]])("%s를 %s로 읽고 찬양 스냅샷에는 복제하지 않는다", async (rawStatus, expected) => {
    if (rawStatus) memory.rows.set(entryPath, { s: rawStatus, by: "synthetic", at: "2026-09-05T09:00:00Z" });
    const saved = structuredClone(memory.state), shared = await snapshot(), resolved = overlaySharedAttendance(memory.state!, shared);
    expect(resolved.attendance.m_20260905.student.status).toBe(expected);
    expect(shared.sources.m_20260905.student).toMatchObject({ source: "semester", mapping: "linked", revision: expect.any(String) });
    expect(memory.state).toEqual(saved); expect(memory.writes).toBe(0);
    if (rawStatus === "지각") expect(resolved.attendance.m_20260905.student.originalStatus).toBe("LATE");
  });
  it("shadow는 원본 보관 출석을 유지하고 학기 DB를 읽지 않는다", async () => {
    memory.state!.meta.mode = "shadow";
    const shared = await loadSharedAttendance(memory.state!);
    expect(overlaySharedAttendance(memory.state!, shared).attendance.m_20260905.student.status).toBe("ABSENT");
    expect(shared.sources.m_20260905.student.mapping).toBe("shadow"); expect(memory.reads).toEqual([]);
  });
  it("미매핑은 기존 기록을 보존하며 공통 모임 쓰기는 연결 전 차단한다", async () => {
    delete memory.state!.people.student.rosterLink;
    const shared = await snapshot(); expect(shared.sources.m_20260905.student).toMatchObject({ mapping: "unlinked", writable: false });
    expect(overlaySharedAttendance(memory.state!, shared).attendance.m_20260905.student.status).toBe("ABSENT");
    await expect(execute({ type: "attendance.set", meetingId: "m_20260905", personId: "student", status: "PRESENT", expectedRevision: 3 })).rejects.toMatchObject({ code: "attendance_mapping_required" });
    expect(memory.writes).toBe(0);
  });
  it("타 팀 이동·날짜 불일치·중복 회차 연결은 과거 출석으로 등단 자격을 부여하지 않는다", async () => {
    for (const reason of ["team", "date", "duplicate"]) {
      seed(); memory.state!.attendance.m_20260905.student.status = "PRESENT";
      if (reason === "team") store.set("semesters/2026-2/applications/1_student/teamId", "media");
      if (reason === "date") memory.rows.set("semesters/2026-2/sessions", { session: { date: "2026-09-12" } });
      if (reason === "duplicate") memory.state!.meetings.duplicate = { ...memory.state!.meetings.m_20260905, id: "duplicate" };
      const shared = await snapshot(); expect(shared.sources.m_20260905.student.mapping).toBe("invalid"); expect(overlaySharedAttendance(memory.state!, shared).attendance.m_20260905.student.status).toBeNull();
    }
  });
  it("신청의 안정 인물키·반 경로가 저장된 연결과 달라지면 공통 출석을 읽거나 쓰지 않는다", async () => {
    for (const reason of ["person", "class"] as const) {
      seed();
      if (reason === "person") store.set("semesters/2026-2/applications/1_student/personId", "person_student_changed");
      else store.set("semesters/2026-2/applications/1_student/class", 2);
      const shared = await snapshot();
      expect(shared.sources.m_20260905.student).toMatchObject({ mapping: "invalid", writable: false });
      expect(shared.targets.m_20260905?.student).toBeUndefined();
      await expect(execute({ type: "attendance.set", meetingId: "m_20260905", personId: "student", status: "PRESENT", expectedRevision: 0 })).rejects.toMatchObject({ code: "attendance_mapping_required" });
      expect(memory.writes).toBe(0);
    }
  });
  it("담당 조만 출결과 출처를 받고 신청키·영수증·다른 조 fingerprint는 노출하지 않는다", async () => {
    const shared = await snapshot(), view = praiseView(overlaySharedAttendance(memory.state!, shared), staff, shared.sources);
    expect(Object.keys(view.attendanceSources!.m_20260905)).toEqual(["student"]);
    expect(view.attendanceSources!.m_20260905.student.writable).toBe(true);
    expect(JSON.stringify(view)).not.toContain("applicationKey"); expect(JSON.stringify(view)).not.toContain("expectedSourceRevision");
  });
  it("회차 목록 1회와 필요한 출석 회차만 조회하고 전체 학기 출석은 읽지 않는다", async () => {
    memory.state!.meetings.next = { ...memory.state!.meetings.m_20260905, id: "next", date: "2026-09-12", linkedSessionId: "next" };
    memory.rows.set("semesters/2026-2/sessions", { session: { date: "2026-09-05" }, next: { date: "2026-09-12" } });
    await snapshot(); expect(memory.reads.filter(p => p === "semesters/2026-2/sessions")).toHaveLength(1);
    expect(memory.reads.filter(p => p.startsWith("semesters/2026-2/attendance/"))).toEqual(["semesters/2026-2/attendance/team/session", "semesters/2026-2/attendance/team/next"]);
  });
  it("학기 연결 손상이나 알 수 없는 원본 상태는 저장과 등단 자격을 차단한다", async () => {
    memory.state!.attendance.m_20260905.student.status = "PRESENT"; delete memory.state!.meta.teamId;
    let shared = await snapshot(); expect(overlaySharedAttendance(memory.state!, shared).attendance.m_20260905.student.status).toBeNull();
    memory.state!.meta.teamId = "praise"; memory.rows.set(entryPath, { s: "invalid" }); shared = await snapshot();
    expect(shared.sources.m_20260905.student.mapping).toBe("invalid"); expect(shared.targets.m_20260905?.student).toBeUndefined();
  });
  it("동일 날짜가 유일한 신규 학기 회차만 연결 후보로 사용한다", async () => {
    memory.rows.set("semesters/2026-2/sessions", { a: { date: "2026-09-05" }, b: { date: "2026-09-12" }, c: { date: "2026-09-12" }, d: { date: "2026-09-19" } });
    expect(await initialSharedSessions("2026-2")).toEqual({ "2026-09-05": "a", "2026-09-19": "d" });
    expect(await initialSharedSessions()).toEqual({});
  });
  it("등단 후보와 inputRevision도 공통 지각/결석 변경을 사용한다", async () => {
    const config = { leaderType: "STAFF" as const, leaderId: "staff", staffOnly: false, first: { singerTarget: 1, choirTarget: 0 }, second: { singerTarget: 0, choirTarget: 0 }, studentRatio: 1, minimumFemaleSingers: 0 };
    memory.rows.set(entryPath, { s: "지각" });
    const shared = await snapshot(), resolved = overlaySharedAttendance(memory.state!, shared), meeting = resolved.meetings.m_20260905;
    expect(generatePraiseStage(resolved, meeting, config, []).candidates.find(p => p.personId === "student")?.eligible).toBe(true);
    const result = applyPraiseCommand(memory.state!, { type: "stage.generate", meetingId: meeting.id, inputRevision: stageInputRevision(resolved, meeting), config, overrides: [] }, actor, 2000, "stage", { stageAttendance: resolved.attendance });
    expect(result.attendance).toEqual(memory.state!.attendance);
    memory.rows.set(entryPath, { s: "결석" }); const absent = overlaySharedAttendance(memory.state!, await snapshot());
    expect(generatePraiseStage(absent, meeting, config, []).candidates.find(p => p.personId === "student")?.eligible).toBe(false);
    expect(stageInputRevision(absent, meeting)).not.toBe(stageInputRevision(resolved, meeting));
  });
});

describe("공통 셀 저장과 감사 복구", () => {
  it("원장 한 셀만 저장하고 praise 출결 복제 없이 감사·영수증을 완료한다", async () => {
    const oldAttendance = structuredClone(memory.state!.attendance), cmd = await command();
    const result = await execute(cmd);
    expect(store.get(entryPath)).toMatchObject({ s: "출석", by: actor.uid, at: expect.any(String), praiseOperationId: expect.any(String), praiseOperationFingerprint: expect.any(String) });
    expect(result.attendance).toEqual(oldAttendance); expect(result.audit.write.action).toBe("attendance.set"); expect(result.operations.write.sharedAttendance?.phase).toBe("complete");
    expect(memory.writes).toBe(1);
    memory.rows.set(entryPath, { s: "결석", by: "later_actor" }); await execute(cmd);
    expect(store.get(entryPath)).toEqual({ s: "결석", by: "later_actor" }); expect(memory.writes).toBe(1);
  });
  it("null은 메타데이터 tombstone 없이 leaf를 지운다", async () => {
    memory.rows.set(entryPath, { s: "출석" }); const cmd = await command(null); await execute(cmd);
    expect((store.get(entryPath) != null)).toBe(false); expect(memory.state!.attendance.m_20260905.student.status).toBe("ABSENT");
    await execute(cmd); expect(memory.writes).toBe(1);
  });
  it("삭제 예약 뒤 다른 담당자가 먼저 지운 셀을 내 작업 결과로 확정하지 않는다", async () => {
    memory.rows.set(entryPath, { s: "출석", by: "synthetic_previous" });
    const cmd = await command(null); memory.concurrentEntry = null;
    await expect(execute(cmd)).rejects.toMatchObject({ code: "revision_conflict" });
    expect(store.get(entryPath)).toBeNull();
    expect(memory.state!.operations.write.sharedAttendance?.phase).toBe("failed");
    expect(memory.writes).toBe(0);
  });
  it("조 외 접근·권한 회수·shadow는 공통 저장 예약 전 차단한다", async () => {
    const cmd = await command("PRESENT", "other"); await expect(execute(cmd, "other", staff)).rejects.toMatchObject({ code: "forbidden" });
    memory.state!.access[staff.uid].active = false; await expect(execute(await command(), "revoked", staff)).rejects.toMatchObject({ code: "forbidden" });
    memory.state!.meta.mode = "shadow"; await expect(execute({ ...cmd, personId: "student" }, "shadow")).rejects.toMatchObject({ code: "read_only" }); expect(memory.writes).toBe(0);
  });
  it("그 사이 다른 화면에서 바뀐 값은 409이고 작업 실패 영수증으로 재시도를 막는다", async () => {
    const cmd = await command(); memory.concurrentEntry = { s: "결석", by: "concurrent" };
    await expect(execute(cmd)).rejects.toMatchObject({ code: "revision_conflict" });
    expect(store.get(entryPath)).toEqual({ s: "결석", by: "concurrent" }); expect(memory.state!.operations.write.sharedAttendance?.phase).toBe("failed");
    await expect(execute(cmd)).rejects.toMatchObject({ code: "revision_conflict" }); expect(memory.writes).toBe(0);
  });
  it.each(["audit", "response"])("%s 단계 장애 뒤 동일 요청은 증거로 감사만 복구한다", async failure => {
    const cmd = await command(); memory.failFinalize = failure === "audit"; memory.failEntryAfterCommit = failure === "response";
    await expect(execute(cmd)).rejects.toBeDefined(); expect(memory.writes).toBe(1); expect(memory.state!.audit.write).toBeUndefined();
    const recovered = await execute(cmd); expect(recovered.operations.write.sharedAttendance?.phase).toBe("complete"); expect(recovered.audit.write).toBeDefined(); expect(memory.writes).toBe(1);
  });
  it("canonical 저장 후 매핑·담당 조가 바뀌어도 본인 receipt로 감사만 복구한다", async () => {
    const cmd = await command(); memory.failFinalize = true; await expect(execute(cmd, "write", staff)).rejects.toBeDefined();
    store.set("semesters/2026-2/applications/1_student/teamId", "media");
    memory.state!.access[staff.uid].active = false;
    const result = await execute(cmd, "write", staff); expect(result.audit.write).toBeDefined(); expect(memory.writes).toBe(1);
  });
  it("저장 응답 유실 뒤 학기에서 삭제한 셀을 지연 재시도가 되살리지 않는다", async () => {
    const cmd = await command(); memory.failFinalize = true; await expect(execute(cmd)).rejects.toBeDefined(); store.set(entryPath, null);
    expect((await execute(cmd)).operations.write.sharedAttendance?.phase).toBe("complete"); expect((store.get(entryPath) != null)).toBe(false); expect(memory.writes).toBe(1);
    expect(applyPraiseCommand(memory.state!, { type: "availability.set", meetingId: "m_20260905", personId: "staff", present: false, role: "SINGER", expectedRevision: 1 }, actor, 2000, "unrelated").availability.m_20260905.staff.present).toBe(false);
    const next = await command("ABSENT"); await execute(next, "new_explicit_command");
    expect(store.get(entryPath)).toMatchObject({ s: "결석" }); expect(memory.writes).toBe(2);
    await execute(cmd); expect(store.get(entryPath)).toMatchObject({ s: "결석" });
  });
  it("canonical 전송 여부 불명확한 요청은 재전송하지 않는다", async () => {
    const cmd = await command(); memory.failBeforeCommit = true; await expect(execute(cmd)).rejects.toMatchObject({ code: "shared_write_pending" });
    await expect(execute(cmd)).rejects.toMatchObject({ code: "shared_write_pending" }); expect(memory.writes).toBe(0);
  });
  it("동일 요청의 동시 도착도 한 셀 쓰기와 한 감사만 남긴다", async () => {
    const cmd = await command(); const results = await Promise.allSettled([execute(cmd), execute(cmd)]);
    expect(results.some(r => r.status === "fulfilled")).toBe(true); expect(memory.writes).toBe(1); expect(Object.keys(memory.state!.audit).filter(k => k === "write")).toHaveLength(1);
  });
  it("기준 fingerprint 없이 보내거나 같은 operationId를 변조하면 차단한다", async () => {
    const cmd = await command(); await expect(execute({ ...cmd, expectedSourceRevision: undefined })).rejects.toMatchObject({ code: "revision_conflict" });
    await execute(cmd); await expect(execute({ ...cmd, status: "ABSENT" })).rejects.toMatchObject({ code: "operation_conflict" });
    expect(() => parseCommand({ operationId: "bad", command: { ...cmd, expectedSourceRevision: "not-a-fingerprint" } })).toThrow();
  });
});


describe("API 서비스의 공통 원장 연결", () => {
  it("조회와 쓰기 응답 모두 공통 원장 값과 출처를 반환한다", async () => {
    memory.rows.set(entryPath, { s: "지각" });
    const before = await readPraiseView(actor, "synthetic"); expect(before.attendance.m_20260905.student.status).toBe("PRESENT");
    const result = await executePraise(actor, "synthetic", { operationId: "service_write", command: await command("ABSENT") });
    expect(result.view.attendance.m_20260905.student.status).toBe("ABSENT"); expect(result.view.attendanceSources!.m_20260905.student).toMatchObject({ source: "semester", mapping: "linked", originalStatus: "결석" });
    expect(memory.writes).toBe(1); expect(memory.state!.attendance.m_20260905.student.revision).toBe(3);
  });
  it("생성 전 공통 학기 목록은 개설 권한을 가진 역할에만 반환한다", async () => {
    await expect(createPraiseReferences(staff)).rejects.toMatchObject({ status: 403 });
    expect((await createPraiseReferences(actor)).semesters).toHaveLength(1);
  });
  it("새 운영 공간 생성에만 유일한 동일 날짜 회차를 저장하고 재시도는 다시 연결하지 않는다", async () => {
    memory.state = null;
    const request = { operationId: "new", workspace: { id: "new", name: "합성 신규", startDate: "2026-09-05", endDate: "2026-09-12", semesterId: "2026-2", teamId: "praise" } };
    memory.rows.set("semesters/2026-2/sessions", { unique: { date: "2026-09-05" }, duplicate1: { date: "2026-09-12" }, duplicate2: { date: "2026-09-12" } });
    await createPraise(actor, request);
    const saved = memory.state as PraiseState | null;
    expect(saved?.meetings.m_20260905.linkedSessionId).toBe("unique"); expect(saved?.meetings.m_20260912.linkedSessionId).toBeUndefined();
    memory.rows.set("semesters/2026-2/sessions", { different: { date: "2026-09-05" } }); await createPraise(actor, request);
    expect((memory.state as PraiseState | null)?.meetings.m_20260905.linkedSessionId).toBe("unique");
  });
});

describe("학기 transaction 안의 매핑 검증과 영구 영수증", () => {
  it.each(["team", "cancel", "holiday", "date", "inactive"])("예약 후 %s 변경도 출석 커밋 안에서 거절한다", async reason => {
    const cmd = await command(); memory.mutateBeforeTransaction = () => {
      if (reason === "team") store.set("semesters/2026-2/applications/1_student/teamId", "media");
      if (reason === "cancel") store.set("semesters/2026-2/applications/1_student/status", "취소");
      if (reason === "holiday") store.set("semesters/2026-2/sessions/session/type", "휴강");
      if (reason === "date") store.set("semesters/2026-2/sessions/session/date", "2026-09-12");
      if (reason === "inactive") store.set("semesters/2026-2/teams/praise/active", false);
    };
    await expect(execute(cmd)).rejects.toMatchObject({ code: "shared_mapping_conflict" });
    expect(store.get(entryPath)).toBeNull(); expect(memory.writes).toBe(0); expect(memory.state!.operations.write.sharedAttendance?.phase).toBe("failed");
  });
  it("SDK 재시도에서 신청 취소를 다시 평가해 오래된 스냅샷을 저장하지 않는다", async () => {
    const cmd = await command(); const concurrent = store.get("semesters/2026-2") as {applications: Record<string, {status:string}>};
    concurrent.applications["1_student"].status = "취소"; memory.replayWith = concurrent;
    await expect(execute(cmd)).rejects.toMatchObject({ code: "shared_mapping_conflict" }); expect(memory.writes).toBe(0);
  });
  it("출석 한 칸과 비식별 applied 표식만 바꾸고 다른 학기 원장은 보존한다", async () => {
    store.set("semesters/2026-2/attendance/training/session/1_student", { s: "결석", by: "synthetic_teacher" });
    store.set("semesters/2026-2/unknownLegacy", { preserved: ["synthetic", "value"] });
    const before = store.get("semesters/2026-2") as Record<string, unknown>;
    await execute(await command());
    const after = store.get("semesters/2026-2") as Record<string, unknown>;
    expect(memory.writePaths).toEqual(["semesters/2026-2"]);
    expect(after.applications).toEqual(before.applications); expect(after.teams).toEqual(before.teams); expect(after.sessions).toEqual(before.sessions); expect(after.meta).toEqual(before.meta); expect(after.unknownLegacy).toEqual(before.unknownLegacy);
    expect(store.get("semesters/2026-2/attendance/training/session/1_student")).toEqual({ s: "결석", by: "synthetic_teacher" });
    const markers = after.praiseOperationReceipts as Record<string, unknown>, marker = Object.values(markers)[0];
    expect(Object.keys(marker as object).sort()).toEqual(["at", "fingerprint", "phase"]);
    expect(marker).toMatchObject({ phase: "applied", fingerprint: expect.stringMatching(/^[a-f0-9]{64}$/) });
    expect(JSON.stringify(markers)).not.toContain("student"); expect(JSON.stringify(markers)).not.toContain(actor.uid);
  });
  it("휴강은 자동 연결하지 않고 이미 연결된 휴강은 출석/등단을 차단한다", async () => {
    store.set("semesters/2026-2/sessions/session/type", "휴강");
    expect(await initialSharedSessions("2026-2")).toEqual({});
    const shared = await snapshot(); expect(shared.sources.m_20260905.student).toMatchObject({ mapping: "invalid", writable: false });
    expect(overlaySharedAttendance(memory.state!, shared).attendance.m_20260905.student.status).toBeNull();
  });
});

describe("관리자 검토로 불확실 요청 종료·감사 완료", () => {
  const resolveCommand = (resolution: "close" | "finalize", revision: string): Extract<PraiseCommand, {type:"attendance.resolve"}> => ({ type: "attendance.resolve", pendingOperationId: "write", resolution, expectedSourceRevision: revision, acknowledge: true });
  async function uncertain() { const cmd = await command(); memory.failBeforeCommit = true; await expect(execute(cmd)).rejects.toMatchObject({ code: "shared_write_pending" }); return cmd; }
  it("저장 전 중단 요청은 원장 그대로 closed 표식과 관리자 감사로 종료한다", async () => {
    const cmd = await uncertain(), receipt = structuredClone(memory.state!.operations.write.sharedAttendance!);
    const pending = await pendingSharedAttendance(memory.state!, actor); expect(pending).toHaveLength(1); expect(pending[0].canFinalize).toBe(false);
    const original = structuredClone(memory.state!.operations.write);
    const result = await resolveSharedAttendance(actor, memory.state!, resolveCommand("close", pending[0].sourceRevision), "resolve");
    expect(result.operations.write.sharedAttendance?.phase).toBe("closed"); expect(result.audit.resolve.action).toBe("attendance.resolve"); expect(result.audit.write).toBeUndefined(); expect(store.get(entryPath)).toBeNull();
    expect(() => sharedSemesterUpdate(store.get("semesters/2026-2"), receipt, actor.uid, original.at, sharedOperationKey("synthetic", "write"), original.fingerprint)).toThrow(expect.objectContaining({ code: "operation_conflict" }));
    await expect(execute(cmd)).rejects.toMatchObject({ code: "revision_conflict" });
    expect(await pendingSharedAttendance(memory.state!, actor)).toEqual([]);
    const person = { ...result.people.student, name: "합성 변경" }; const { revision: _revision, updatedAt: _at, updatedBy: _by, ...input } = person; void _revision; void _at; void _by;
    expect(applyPraiseCommand(result, { type: "person.save", person: input, expectedRevision: 1 }, actor, 3000, "edit_after_review").people.student.name).toBe("합성 변경");
  });
  it("applied 표식이 있으면 close를 거절하고 원래 작성자의 감사만 finalize한다", async () => {
    memory.failFinalize = true; const cmd = await command(); await expect(execute(cmd, "write", staff)).rejects.toBeDefined();
    store.set(entryPath, null); const review = (await pendingSharedAttendance(memory.state!, actor))[0]; expect(review.canFinalize).toBe(true);
    await expect(resolveSharedAttendance(actor, memory.state!, resolveCommand("close", review.sourceRevision), "close_applied")).rejects.toMatchObject({ code: "shared_proof_exists" });
    const result = await resolveSharedAttendance(actor, memory.state!, resolveCommand("finalize", review.sourceRevision), "finalize_applied");
    expect(result.audit.write.actor.uid).toBe(staff.uid); expect(result.audit.finalize_applied.actor.uid).toBe(actor.uid); expect(result.operations.write.sharedAttendance?.phase).toBe("complete"); expect(store.get(entryPath)).toBeNull();
    expect(memory.writes).toBe(1);
  });
  it("현재 값이 요청과 같더라도 applied proof 없이는 성공 확정하지 않는다", async () => {
    await uncertain(); store.set(entryPath, { s: "출석" });
    await expect(resolveSharedAttendance(actor, memory.state!, resolveCommand("finalize", sharedRevision(store.get(entryPath))), "invalid_finalize")).rejects.toMatchObject({ code: "shared_proof_missing" });
    expect(memory.state!.audit.write).toBeUndefined(); expect(memory.writes).toBe(0);
  });
  it("관리자 외 계정은 검토 목록·키·경로를 받지 못하고 종료할 수 없다", async () => {
    await uncertain(); expect(await pendingSharedAttendance(memory.state!, staff)).toEqual([]);
    await expect(resolveSharedAttendance(staff, memory.state!, resolveCommand("close", sharedRevision(null)), "unauthorized")).rejects.toMatchObject({ code: "forbidden" });
    const view = await readPraiseView(actor, "synthetic"), pending = view.pendingAttendance!;
    expect(pending).toHaveLength(1); expect(JSON.stringify(pending)).not.toContain("applicationKey"); expect(JSON.stringify(pending)).not.toContain("semesterId"); expect(JSON.stringify(pending)).not.toContain("actorUid"); expect(JSON.stringify(pending)).not.toContain("fingerprint");
  });
  it("검토 중 현재 출석이 바뀌면 close도 거절하며 명시 확인 없는 요청을 파싱하지 않는다", async () => {
    await uncertain(); const stale = resolveCommand("close", sharedRevision(null)); store.set(entryPath, { s: "결석" });
    await expect(resolveSharedAttendance(actor, memory.state!, stale, "stale_review")).rejects.toMatchObject({ code: "revision_conflict" });
    expect(() => parseCommand({ operationId: "no_ack", command: { ...stale, acknowledge: false } })).toThrow();
    expect(memory.writes).toBe(0);
  });
  it.each(["before_reservation", "after_reservation"])("%s에서 관리자 권한이 회수되면 외부 종료 표식을 쓰지 않는다", async timing => {
    await uncertain(); memory.state!.access[staff.uid].role = "manager";
    const before = structuredClone(memory.state!);
    const revoke = () => { memory.state!.access[staff.uid].active = false; };
    if (timing === "before_reservation") memory.beforeWorkspaceTransaction = revoke;
    else memory.afterWorkspaceTransaction = revoke;
    await expect(resolveSharedAttendance(staff, before, resolveCommand("close", sharedRevision(null)), "resolve")).rejects.toMatchObject({ code: "forbidden" });
    expect(memory.writes).toBe(0); expect(store.get("semesters/2026-2/praiseOperationReceipts")).toBeNull();
    expect(memory.state!.operations.write.sharedAttendance?.phase).toBe("attempting");
  });
  it("검토 화면 이후 충돌한 작업 번호는 원장 표식 작성 전에 차단한다", async () => {
    await uncertain(); const before = structuredClone(memory.state!);
    memory.beforeWorkspaceTransaction = () => { memory.state!.operations.resolve = { at: 100, actorUid: "synthetic_other", fingerprint: "different" }; };
    await expect(resolveSharedAttendance(actor, before, resolveCommand("close", sharedRevision(null)), "resolve")).rejects.toMatchObject({ code: "operation_conflict" });
    expect(memory.writes).toBe(0); expect(store.get("semesters/2026-2/praiseOperationReceipts")).toBeNull();
  });
  it("종료 표식 이후 감사 장애는 같은 예약으로 감사만 재시도하고 권한 회수로 고착되지 않는다", async () => {
    await uncertain(); memory.state!.access[staff.uid].role = "manager";
    const cmd = resolveCommand("close", sharedRevision(null)); memory.failResolutionFinalize = true;
    await expect(resolveSharedAttendance(staff, memory.state!, cmd, "resolve")).rejects.toThrow("resolution audit unavailable");
    expect(memory.state!.operations.resolve.sharedAttendanceResolution?.phase).toBe("verified");
    expect(memory.state!.operations.write.sharedAttendance?.phase).toBe("attempting");
    const marker = store.get("semesters/2026-2/praiseOperationReceipts"); expect(memory.writes).toBe(1);
    memory.state!.access[staff.uid].active = false;
    const completed = await resolveSharedAttendance(staff, memory.state!, cmd, "resolve");
    expect(completed.operations.resolve.sharedAttendanceResolution?.phase).toBe("complete");
    expect(completed.operations.write.sharedAttendance?.phase).toBe("closed");
    expect(completed.audit.resolve.actor.uid).toBe(staff.uid); expect(completed.audit.write).toBeUndefined();
    expect(memory.writes).toBe(1); expect(store.get("semesters/2026-2/praiseOperationReceipts")).toEqual(marker); expect(store.get(entryPath)).toBeNull();
    await resolveSharedAttendance(staff, memory.state!, cmd, "resolve"); expect(memory.writes).toBe(1); expect(Object.keys(memory.state!.audit)).toEqual(["create", "resolve"]);
  });
  it("표식 저장 직후 권한 회수도 예약된 관리자 감사 완료를 막지 않는다", async () => {
    await uncertain(); memory.state!.access[staff.uid].role = "manager";
    memory.mutateBeforeTransaction = () => { memory.state!.access[staff.uid].active = false; };
    const result = await resolveSharedAttendance(staff, memory.state!, resolveCommand("close", sharedRevision(null)), "resolve");
    expect(result.operations.resolve.sharedAttendanceResolution?.phase).toBe("complete"); expect(result.audit.resolve.actor.uid).toBe(staff.uid); expect(memory.writes).toBe(1);
  });
  it("종료 표식 저장 직후 private 검증 단계가 실패해도 prepared 예약과 증거로 복구한다", async () => {
    await uncertain(); memory.state!.access[staff.uid].role = "manager";
    const cmd = resolveCommand("close", sharedRevision(null));
    memory.mutateBeforeTransaction = () => { memory.beforeWorkspaceTransaction = () => { throw new Error("verification unavailable"); }; };
    await expect(resolveSharedAttendance(staff, memory.state!, cmd, "resolve")).rejects.toThrow("verification unavailable");
    expect(memory.state!.operations.resolve.sharedAttendanceResolution?.phase).toBe("prepared"); expect(memory.writes).toBe(1);
    memory.state!.access[staff.uid].active = false;
    const result = await resolveSharedAttendance(staff, memory.state!, cmd, "resolve");
    expect(result.operations.resolve.sharedAttendanceResolution?.phase).toBe("complete"); expect(result.operations.write.sharedAttendance?.phase).toBe("closed");
    expect(memory.writes).toBe(1); expect(store.get(entryPath)).toBeNull();
  });
  it("다른 관리자가 종료 증거를 인계하면 기존 미완 검토를 종료하고 원장은 유지한다", async () => {
    await uncertain(); memory.state!.access[staff.uid].role = "manager";
    const cmd = resolveCommand("close", sharedRevision(null)); memory.failResolutionFinalize = true;
    await expect(resolveSharedAttendance(staff, memory.state!, cmd, "first_review")).rejects.toThrow();
    memory.state!.access[staff.uid].active = false;
    const result = await resolveSharedAttendance(actor, memory.state!, cmd, "second_review");
    expect(result.operations.first_review.sharedAttendanceResolution?.phase).toBe("superseded");
    expect(result.operations.second_review.sharedAttendanceResolution?.phase).toBe("complete");
    expect(result.audit.second_review.actor.uid).toBe(actor.uid); expect(result.audit.first_review).toBeUndefined(); expect(store.get(entryPath)).toBeNull(); expect(memory.writes).toBe(1);
    await expect(resolveSharedAttendance(staff, memory.state!, cmd, "first_review")).rejects.toMatchObject({ code: "already_resolved" });
  });
  it("출석 값이 달라 거절된 finalize 예약은 같은 작업 번호 재시도로 검토를 우회하지 않는다", async () => {
    memory.failFinalize = true; const original = await command(); await expect(execute(original)).rejects.toThrow();
    const stale = resolveCommand("finalize", sharedRevision(null));
    for (let attempt = 0; attempt < 2; attempt++) await expect(resolveSharedAttendance(actor, memory.state!, stale, "stale_finalize")).rejects.toMatchObject({ code: "revision_conflict" });
    expect(memory.state!.operations.stale_finalize.sharedAttendanceResolution?.phase).toBe("prepared");
    expect(memory.state!.audit.write).toBeUndefined(); expect(memory.state!.audit.stale_finalize).toBeUndefined(); expect(memory.writes).toBe(1);
  });
  it("close와 오래된 쓰기가 경합해도 먼저 확정된 영구 표식을 뒤집지 못한다", async () => {
    await uncertain(); const op = memory.state!.operations.write, receipt = op.sharedAttendance!, key = sharedOperationKey("synthetic", "write");
    const original = store.get("semesters/2026-2");
    const closed = closeSharedSemester(original, receipt, key, op.fingerprint, sharedRevision(null), 5000);
    expect(() => sharedSemesterUpdate(closed, receipt, actor.uid, op.at, key, op.fingerprint)).toThrow(expect.objectContaining({ code: "operation_conflict" }));
    const applied = sharedSemesterUpdate(original, receipt, actor.uid, op.at, key, op.fingerprint);
    expect(() => closeSharedSemester(applied, receipt, key, op.fingerprint, sharedRevision(null), 5000)).toThrow(expect.objectContaining({ code: "shared_proof_exists" }));
  });
});


describe("등단 커밋 직전 공통 출석 대조", () => {
  it.each(["attendance", "assignment", "holiday"])("계산 후 %s 변경을 재조회해서 거절한다", async reason => {
    memory.rows.set(entryPath, { s: "출석" }); const original = await snapshot();
    if (reason === "attendance") store.set(entryPath, { s: "결석" });
    if (reason === "assignment") store.set("semesters/2026-2/applications/1_student/teamId", "media");
    if (reason === "holiday") store.set("semesters/2026-2/sessions/session/type", "휴강");
    await expect(assertSharedAttendanceCurrent(memory.state!, original, "m_20260905")).rejects.toMatchObject({ code: "input_conflict", status: 409 }); expect(memory.writes).toBe(0);
  });
  it("API가 등단 계산과 workspace 저장 사이에 공통 원장을 다시 검증한다", async () => {
    store.set(entryPath, { s: "출석" }); const view = await readPraiseView(actor, "synthetic");
    const config = { leaderType: "STAFF" as const, leaderId: "staff", staffOnly: false, first: { singerTarget: 1, choirTarget: 0 }, second: { singerTarget: 0, choirTarget: 0 }, studentRatio: 1, minimumFemaleSingers: 0 };
    memory.beforeStageVerify = () => store.set(entryPath, { s: "결석" });
    await expect(executePraise(actor, "synthetic", { operationId: "stale_stage", command: { type: "stage.generate", meetingId: "m_20260905", config, overrides: [], inputRevision: view.inputRevisions.m_20260905 } })).rejects.toMatchObject({ code: "input_conflict" });
    expect(memory.state!.stageVersions).toEqual({}); expect(memory.state!.audit.stale_stage).toBeUndefined();
  });
});

describe("찬양팀 명단의 공식 원장 일괄 대조", () => {
  function batchRequest() {
    const current = memory.state!.people.student;
    const { revision, updatedAt: _updatedAt, updatedBy: _updatedBy, ...person } = current;
    void _updatedAt; void _updatedBy;
    return {
      operationId: "batch-roster-link",
      command: {
        type: "people.reconcile" as const,
        people: [{ expectedRevision: revision, person: { ...person, rosterLink: { applicationKey: "1_student", personId: "person_student_student", year: "2026", classKey: "1-1-1", studentId: "student" } } }],
      },
    };
  }
  function seedMainRoster() {
    memory.state!.meta.mode = "shadow";
    delete memory.state!.people.student.rosterLink;
    memory.rows.set("semesters/2026-2/applications", { "1_student": { id: "1_student", studentId: "student", personId: "person_student_student", bu: "1부", name: "합성 학생", grade: 1, class: 1, trainingClassId: "class", choice1: "praise", teamId: "praise", status: "배치", createdAt: "2026-09-01" } });
    memory.rows.set("classes/2026", { "1-1-1": { students: { student: { name: "합성 학생", personId: "person_student_student" } } } });
    memory.rows.set("teacherStaff/2026", {});
  }
  it("API는 공식 신청·학생 원장을 재확인하고 workspace 한 번에 연결한다", async () => {
    seedMainRoster();
    const result = await executePraise(actor, "synthetic", batchRequest());
    expect(memory.state!.people.student.rosterLink).toMatchObject({ applicationKey: "1_student", personId: "person_student_student", classKey: "1-1-1" });
    expect(memory.state!.audit["batch-roster-link"]).toMatchObject({ label: "찬양팀 통합 명단 1명 연결" });
    expect(result.view.people.find((person) => person.id === "student")?.rosterLink?.personId).toBe("person_student_student");
    expect(memory.reads).not.toContain("classes/2026"); expect(memory.reads).not.toContain("teacherStaff/2026");
    expect(memory.reads.filter((path) => path === "classes/2026/1-1-1/students/student")).toHaveLength(2);
  });
  it("계산 후 공식 인물키가 바뀌면 커밋 직전 재검증으로 전체 연결을 취소한다", async () => {
    seedMainRoster(); const before = structuredClone(memory.state);
    memory.beforeStageVerify = () => store.set("classes/2026/1-1-1/students/student/personId", "person_student_changed");
    await expect(executePraise(actor, "synthetic", batchRequest())).rejects.toMatchObject({ code: "roster_changed", status: 409 });
    expect(memory.state).toEqual(before); expect(memory.state!.audit["batch-roster-link"]).toBeUndefined();
  });
  it("ETag 충돌 뒤 최신 mode와 중복 연결을 다시 검사해 오래된 일괄 대조를 거절한다", async () => {
    for (const scenario of ["mode", "duplicate"] as const) {
      seed(); seedMainRoster();
      memory.beforeCheckedRetry = () => {
        if (scenario === "mode") memory.state!.meta.mode = "live";
        else memory.state!.people.other.rosterLink = { applicationKey: "1_student", personId: "person_student_student", year: "2026", classKey: "1-1-1", studentId: "student" };
      };
      await expect(executePraise(actor, "synthetic", batchRequest())).rejects.toMatchObject({
        code: scenario === "mode" ? "read_only" : "duplicate_person",
        status: 409,
      });
      expect(memory.state!.people.student.rosterLink).toBeUndefined();
      expect(memory.state!.audit["batch-roster-link"]).toBeUndefined();
      expect(memory.reads.filter((path) => path === "classes/2026/1-1-1/students/student")).toHaveLength(2);
    }
  });
});
