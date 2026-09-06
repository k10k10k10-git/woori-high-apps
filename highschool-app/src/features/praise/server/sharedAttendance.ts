import "server-only";
import { paths } from "@/features/semester/paths";
import type { Application } from "@/features/semester/types";
import { assertPraiseId } from "../paths";
import { groupVersionForMeeting } from "../permissions";
import type { PraiseAttendance, PraiseAttendanceSources, PraiseSharedAttendanceOperation, PraiseState } from "../types";
import { getPraiseFirebaseAdmin, praiseUnavailable } from "./firebaseAdmin";
import { rosterCandidate } from "./roster";
import { fingerprint } from "./stageModel";
import { requireValue } from "./validation";

export const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
export function sharedStatus(value: unknown): PraiseAttendance["status"] {
  const s = asRecord(value).s;
  return s === "출석" || s === "지각" ? "PRESENT" : s === "결석" ? "ABSENT" : null;
}
export function sharedRevision(value: unknown) { return fingerprint(value ?? null); }
export function sharedNumericRevision(value: unknown) { return value == null ? 0 : Number.parseInt(sharedRevision(value).slice(0, 13), 16); }
export async function readSharedPath(path: string): Promise<unknown> {
  try { return (await getPraiseFirebaseAdmin().database.ref(path).get()).val(); }
  catch { throw praiseUnavailable("shared_attendance_unavailable"); }
}
/** 연결 변경과 원본 조 변경은 사전에 읽은 외부 스냅샷에 끼워 넣을 수 없다. */
export function sharedMappingRevision(state: PraiseState) {
  return fingerprint({ semesterId: state.meta.semesterId, teamId: state.meta.teamId, mode: state.meta.mode,
    meetings: state.meetings, people: state.people, activeGroupVersionId: state.meta.activeGroupVersionId, groups: state.groupVersions });
}
export function sharedSessionOpen(value: unknown): boolean {
  const session = asRecord(value);
  return Boolean(session.date && session.type !== "휴강" && session.cancelled !== true && session.active !== false);
}
export function sharedMappingProof(meta: unknown, team: unknown, session: unknown, application: unknown) {
  const pick = (value: unknown, keys: string[]) => Object.fromEntries(keys.map(key => [key, asRecord(value)[key] ?? null]));
  return fingerprint({ semester: pick(meta, ["active", "status"]), semesterExists: Boolean(meta),
    team: pick(team, ["active", "disabled"]), teamExists: Boolean(team),
    session: pick(session, ["date", "endDate", "type", "active", "cancelled"]),
    application: pick(application, ["studentId", "personId", "bu", "grade", "class", "status", "teamId", "trainingOnly", "trainingClassId", "choice1"]),
  });
}
/** 이 검증은 학기 transaction 안에서도 실행되어 신청 취소·팀 이동과 출석 저장 사이의 틈을 없앤다. */
export function assertSharedSemesterMapping(semester: unknown, receipt: PraiseSharedAttendanceOperation) {
  const root = asRecord(semester), meta = root.meta, team = asRecord(root.teams)[receipt.teamId ?? ""],
    session = asRecord(root.sessions)[receipt.sessionId], application = asRecord(root.applications)[receipt.applicationKey];
  const candidate = application && receipt.teamId ? rosterCandidate(receipt.applicationKey, application as Application, receipt.semesterId, receipt.teamId) : null;
  requireValue(receipt.mappingProof && receipt.studentId && receipt.meetingDate && meta && team &&
    asRecord(meta).active !== false && asRecord(meta).status !== "archived" && asRecord(team).active !== false && asRecord(team).disabled !== true &&
    sharedSessionOpen(session) && asRecord(session).date === receipt.meetingDate && candidate?.kind === "STUDENT" && candidate.rosterLink.studentId === receipt.studentId &&
    sharedMappingProof(meta, team, session, application) === receipt.mappingProof,
    "학기·팀 배치 또는 회차가 변경됐습니다. 최신 연결을 확인해 주세요.", "shared_mapping_conflict", 409);
}
export type SharedAttendanceSnapshot = {
  mappingRevision: string;
  overrides: PraiseState["attendance"];
  sources: PraiseAttendanceSources;
  targets: Record<string, Record<string, { semesterId: string; sessionId: string; applicationKey: string; raw: unknown; mappingProof: string; studentId: string; teamId: string; meetingDate: string }>>;
};
/** 학기 원장은 서버에서만 읽는다. 비공개 신청·연락처와 다른 팀의 항목은 반환하지 않는다. */
export async function loadSharedAttendance(state: PraiseState): Promise<SharedAttendanceSnapshot> {
  const snapshot: SharedAttendanceSnapshot = { mappingRevision: sharedMappingRevision(state), overrides: {}, sources: {}, targets: {} };
  const students = Object.values(state.people).filter(p => p.kind === "STUDENT");
  for (const m of Object.values(state.meetings)) {
    snapshot.sources[m.id] = Object.fromEntries(students.map(p => [p.id, {
      source: "praise", mapping: state.meta.mode === "shadow" ? "shadow" : "unlinked", writable: !m.linkedSessionId && state.meta.mode !== "shadow",
    }]));
  }
  if (state.meta.mode === "shadow") return snapshot;
  const linked = Object.values(state.meetings).filter(m => m.linkedSessionId);
  if (!linked.length) return snapshot;
  const sid = state.meta.semesterId, teamId = state.meta.teamId;
  if (!sid || !teamId) {
    for (const m of linked) for (const p of students) {
      snapshot.sources[m.id][p.id] = { source: "praise", mapping: "invalid", writable: false };
      if (p.rosterLink?.applicationKey) {
        snapshot.overrides[m.id] ??= {};
        snapshot.overrides[m.id][p.id] = { status: null, groupVersionId: groupVersionForMeeting(state, m)?.id ?? "import-unresolved", revision: 0, updatedAt: 0, updatedBy: "" };
      }
    }
    return snapshot;
  }
  assertPraiseId(sid); assertPraiseId(teamId);
  const [team, applicationValue, sessionValue, meta] = await Promise.all([
    readSharedPath(paths.team(sid, teamId)),
    getPraiseFirebaseAdmin().database.ref(paths.applications(sid)).orderByChild("teamId").equalTo(teamId).get()
      .then(s => s.val() as unknown).catch(() => { throw praiseUnavailable("shared_attendance_unavailable"); }),
    readSharedPath(paths.sessions(sid)),
    readSharedPath(paths.semesterMeta(sid)),
  ]);
  const applications = asRecord(applicationValue), sessions = asRecord(sessionValue);
  const applicationCounts = new Map<string, number>(), sessionCounts = new Map<string, number>();
  for (const p of Object.values(state.people)) if (p.rosterLink?.applicationKey) applicationCounts.set(p.rosterLink.applicationKey, (applicationCounts.get(p.rosterLink.applicationKey) ?? 0) + 1);
  for (const m of linked) sessionCounts.set(m.linkedSessionId!, (sessionCounts.get(m.linkedSessionId!) ?? 0) + 1);
  // 회차 목록은 한 번, 필요한 출석 회차만 제한 병렬로 읽는다. 전체 학기 출석을 다운로드하지 않는다.
  for (let start = 0; start < linked.length; start += 6) await Promise.all(linked.slice(start, start + 6).map(async m => {
    const sessionId = assertPraiseId(m.linkedSessionId!);
    const session = asRecord(sessions[sessionId]);
    const uniqueSession = sessionCounts.get(sessionId) === 1;
    const open = sharedSessionOpen(session);
    const rows = team && session.date === m.date && uniqueSession && open
      ? asRecord(await readSharedPath(paths.attendanceSession(sid, "team", sessionId))) : {};
    for (const p of students) {
      const key = p.rosterLink?.applicationKey;
      if (!key) continue;
      assertPraiseId(key);
      const candidate = applications[key] ? rosterCandidate(key, applications[key] as Application, sid, teamId) : null;
      const raw = rows[key] ?? null, record = asRecord(raw), status = sharedStatus(raw);
      const valid = Boolean((raw === null || ["출석", "지각", "결석"].includes(String(record.s))) && meta && asRecord(meta).active !== false && asRecord(meta).status !== "archived" && team && asRecord(team).active !== false && asRecord(team).disabled !== true && open && session.date === m.date && uniqueSession && candidate?.kind === "STUDENT" &&
        candidate.rosterLink.studentId === p.rosterLink?.studentId &&
        applicationCounts.get(key) === 1);
      const groupId = groupVersionForMeeting(state, m)?.id ?? "import-unresolved";
      const source = valid ? { source: "semester" as const, mapping: "linked" as const, writable: true, revision: sharedRevision(raw),
        ...(["출석", "지각", "결석"].includes(String(record.s)) ? { originalStatus: record.s as "출석" | "지각" | "결석" } : {}) }
        : { source: "praise" as const, mapping: "invalid" as const, writable: false };
      snapshot.sources[m.id][p.id] = source;
      snapshot.overrides[m.id] ??= {};
      // 명시 연결이 깨지면 과거 출석으로 등단 자격을 잘못 부여하지 않는다.
      snapshot.overrides[m.id][p.id] = { status: valid ? status : null, groupVersionId: groupId,
        revision: valid ? sharedNumericRevision(raw) : 0, updatedAt: valid && typeof record.at === "string" ? Date.parse(record.at) || 0 : 0,
        updatedBy: valid && typeof record.by === "string" ? record.by : "", ...(valid && record.s === "지각" ? { originalStatus: "LATE" as const } : {}) };
      if (valid) { snapshot.targets[m.id] ??= {}; snapshot.targets[m.id][p.id] = { semesterId: sid, sessionId, applicationKey: key, raw, mappingProof: sharedMappingProof(meta, team, session, applications[key]), studentId: p.rosterLink!.studentId!, teamId, meetingDate: m.date }; }
    }
  }));
  return snapshot;
}
export function overlaySharedAttendance(state: PraiseState, snapshot: SharedAttendanceSnapshot): PraiseState {
  requireValue(sharedMappingRevision(state) === snapshot.mappingRevision, "명단 또는 회차 연결이 변경됐습니다. 새로고침해 주세요.", "revision_conflict", 409);
  const attendance = { ...state.attendance };
  for (const [meetingId, rows] of Object.entries(snapshot.overrides)) attendance[meetingId] = { ...attendance[meetingId], ...rows };
  return { ...state, attendance };
}
/** 새 운영 공간만 정확히 같은 날짜의 유일한 회차를 연결한다. 기존·과거 연결은 추정하지 않는다. */
export async function initialSharedSessions(semesterId?: string): Promise<Record<string, string>> {
  if (!semesterId) return {};
  const sessions = asRecord(await readSharedPath(paths.sessions(assertPraiseId(semesterId))));
  const byDate: Record<string, string[]> = {};
  for (const [key, value] of Object.entries(sessions)) {
    const date = asRecord(value).date;
    if (typeof date !== "string") continue;
    try { assertPraiseId(key); } catch { continue; }
    (byDate[date] ??= []).push(key);
  }
  return Object.fromEntries(Object.entries(byDate).filter(([, ids]) => ids.length === 1 && sharedSessionOpen(sessions[ids[0]])).map(([date, ids]) => [date, ids[0]]));
}

/** 등단 계산 후 저장 직전에 원본 출석과 연결 근거를 다시 대조한다. */
export async function assertSharedAttendanceCurrent(state: PraiseState, expected: SharedAttendanceSnapshot, meetingId: string) {
  if (!state.meetings[meetingId]?.linkedSessionId || state.meta.mode === "shadow") return;
  const current = await loadSharedAttendance(state);
  const signature = (snapshot: SharedAttendanceSnapshot) => fingerprint({ sources: snapshot.sources[meetingId], targets: snapshot.targets[meetingId] });
  requireValue(signature(current) === signature(expected), "저장 직전 학기 출석 또는 배치가 변경됐습니다. 최신 기준으로 등단표를 다시 검토해 주세요.", "input_conflict", 409);
}
