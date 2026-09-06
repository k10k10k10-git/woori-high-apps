import "server-only";
import { paths as semesterPaths } from "@/features/semester/paths";
import { assertPraiseId, praisePaths } from "../paths";
import type { PraiseState } from "../types";
import { getPraiseFirebaseAdmin, praiseUnavailable } from "./firebaseAdmin";

type JsonRecord = Record<string, unknown>;
function object(value: unknown): JsonRecord {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw praiseUnavailable("invalid_workspace_data");
  return value as JsonRecord;
}
function list(value: unknown): unknown[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw praiseUnavailable("invalid_workspace_data");
  return value;
}
function map(value: unknown, transform: (item: JsonRecord) => JsonRecord = (item) => item): JsonRecord {
  if (value === undefined || value === null) return {};
  if (typeof value !== "object") throw praiseUnavailable("invalid_workspace_data");
  // 숫자 키만 있는 RTDB map은 val()에서 배열로 올 수 있다. 빈 슬롯은 노드가 아니다.
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== null && item !== undefined)
    .map(([key, item]) => [key, transform(object(item))]));
}
function nestedMap(value: unknown, transform: (item: JsonRecord) => JsonRecord = (item) => item): JsonRecord {
  if (value === undefined || value === null) return {};
  if (typeof value !== "object") throw praiseUnavailable("invalid_workspace_data");
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== null && item !== undefined)
    .map(([key, entries]) => [key, map(entries, transform)]));
}
function rules(value: unknown) {
  return list(value).map((item) => ({ ...object(item), memberIds: list(object(item).memberIds) }));
}

/** RTDB가 생략하는 빈 목록과 null 상태를 도메인 계약으로 복원한다. 원문 필드는 덮어쓰지 않는다. */
function workspace(value: unknown, id: string): PraiseState | null {
  if (value === null || value === undefined) return null;
  const raw = object(value);
  if (raw.schemaVersion !== 1 || object(raw.meta).id !== id) throw praiseUnavailable("invalid_workspace_data");
  const policy = object(raw.policy);
  return {
    ...raw,
    people: map(raw.people), meetings: map(raw.meetings), access: map(raw.access),
    availability: nestedMap(raw.availability, (entry) => ({ ...entry, present: entry.present ?? null })),
    attendance: nestedMap(raw.attendance, (entry) => ({ ...entry, status: entry.status ?? null })),
    operations: map(raw.operations), imports: map(raw.imports, (entry) => ({ ...entry, counts: entry.counts ?? {} })),
    policy: { ...policy, rules: rules(policy.rules) },
    audit: map(raw.audit, (entry) => ({ ...entry, changes: list(entry.changes) })),
    groupVersions: map(raw.groupVersions, (entry) => ({
      ...entry, rules: rules(entry.rules), warnings: list(entry.warnings),
      groups: list(entry.groups).map((group) => ({ ...object(group), studentIds: list(object(group).studentIds), staffIds: list(object(group).staffIds) })),
    })),
    stageVersions: map(raw.stageVersions, (entry) => ({
      ...entry, overrides: list(entry.overrides), candidates: list(entry.candidates), warnings: list(entry.warnings),
      services: list(entry.services).map((service) => ({ ...object(service), assignments: list(object(service).assignments) })),
    })),
    guides: map(raw.guides, (entry) => {
      const content = object(entry.content);
      return { ...entry, content: { ...content,
        preparation: list(content.preparation), interviewGuidelines: list(content.interviewGuidelines), fallbacks: list(content.fallbacks),
        roles: list(content.roles).map((role) => ({ ...object(role), responsibilities: list(object(role).responsibilities) })),
        steps: list(content.steps).map((step) => ({ ...object(step), instructions: list(object(step).instructions) })),
      } };
    }),
  } as unknown as PraiseState;
}

/** 선택 필드의 undefined만 제외한다. 비정상 숫자나 객체를 null로 바꾸어 저장하지 않는다. */
function storageValue(value: unknown): unknown {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (Array.isArray(value)) return value.map(storageValue);
  if (value && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype) {
    return Object.fromEntries(Object.entries(value).filter(([, child]) => child !== undefined).map(([key, child]) => [key, storageValue(child)]));
  }
  throw praiseUnavailable("invalid_workspace_data");
}

export async function listWorkspaceIds(): Promise<string[]> {
  const { app } = getPraiseFirebaseAdmin();
  try {
    // 전체 원장 다운로드를 피한다. 서버 토큰을 URL·응답·로그에 넣지 않는다.
    const token = await app.options.credential!.getAccessToken();
    const url = new URL(`${praisePaths.root()}.json`, `${app.options.databaseURL}/`);
    url.searchParams.set("shallow", "true");
    const response = await fetch(url, { headers: { Authorization: `Bearer ${token.access_token}` }, cache: "no-store", signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error();
    const value: unknown = await response.json();
    if (value === null) return [];
    const entries = Object.entries(object(value));
    if (entries.some(([, present]) => present !== true)) throw new Error();
    return entries.map(([id]) => assertPraiseId(id)).sort();
  } catch {
    throw praiseUnavailable("workspace_list_unavailable");
  }
}

export async function readWorkspace(id: string): Promise<PraiseState | null> {
  const path = praisePaths.workspace(id);
  const { database } = getPraiseFirebaseAdmin();
  let value: unknown;
  try { value = (await database.ref(path).get()).val(); }
  catch { throw praiseUnavailable("workspace_read_unavailable"); }
  return workspace(value, id);
}

/** 업무·감사·operationId를 한 workspace 트랜잭션으로 저장한다. updater는 재시도 가능 순수 함수다. */
export async function transactWorkspace(id: string, updater: (current: PraiseState | null) => PraiseState | undefined): Promise<PraiseState | null> {
  const path = praisePaths.workspace(id);
  const { database } = getPraiseFirebaseAdmin();
  let callbackFailed = false;
  let callbackError: unknown;
  let result;
  const reference = database.ref(path);
  let stopListening = () => {};
  try {
    // transaction의 최초 null은 미조회 캐시일 수 있다. 실제 첫 스냅샷을 유지한 채 시작한다.
    await new Promise<void>((resolve, reject) => {
      const listener = () => resolve();
      stopListening = () => reference.off("value", listener);
      reference.on("value", listener, reject);
    });
    result = await reference.transaction((current: unknown) => {
      try {
        const next = updater(workspace(current, id));
        if (next === undefined) return undefined;
        // 호출자가 실수로 삭제·다른 workspace 저장을 요청하는 경우도 커밋 전에 차단한다.
        if (workspace(next, id) === null) throw praiseUnavailable("invalid_workspace_data");
        return storageValue(next);
      } catch (error) {
        callbackFailed = true;
        callbackError = error;
        return undefined;
      }
    }, undefined, false);
  } catch {
    if (callbackFailed) throw callbackError;
    throw praiseUnavailable("workspace_write_unavailable");
  } finally {
    stopListening();
  }
  if (callbackFailed) throw callbackError;
  return workspace(result.snapshot.val(), id);
}

export type PraiseSemesterReference = {
  id: string;
  meta: { title?: string; startDate?: string; endDate?: string };
  teams: Record<string, { id: string; name?: string; order?: number }>;
  sessions: Record<string, { id: string; date?: string; endDate?: string; type?: string; label?: string }>;
  applications: Record<string, { id: string; name?: string; studentId?: string; personId?: string; bu?: string; grade?: number; class?: number; status?: string; teamId?: string }>;
};
function pick(source: JsonRecord, fields: string[]) {
  return Object.fromEntries(fields.filter((key) => typeof source[key] === "string" || typeof source[key] === "number").map((key) => [key, source[key]]));
}
function referenceMap(value: unknown, fields: string[]) {
  if (value === null || value === undefined) return {};
  if (typeof value !== "object") throw praiseUnavailable("invalid_semester_data");
  return Object.fromEntries(Object.entries(value).filter(([, row]) => row !== null && row !== undefined)
    .map(([id, row]) => [id, { id, ...pick(object(row), fields) }]));
}

/** 기존 학기는 참조만 읽는다. 비공개 원장·연락처·메모·출석 데이터는 조회하지 않는다. */
export async function readSemesterReference(sid: string): Promise<PraiseSemesterReference | null> {
  assertPraiseId(sid);
  const { database } = getPraiseFirebaseAdmin();
  let values: unknown[];
  try {
    values = await Promise.all([semesterPaths.semesterMeta(sid), semesterPaths.teams(sid), semesterPaths.sessions(sid), semesterPaths.applications(sid)]
      .map(async (path) => (await database.ref(path).get()).val()));
  } catch { throw praiseUnavailable("semester_reference_unavailable"); }
  const [meta, teams, sessions, applications] = values;
  if (meta === null || meta === undefined) return null;
  return {
    id: sid, meta: pick(object(meta), ["title", "startDate", "endDate"]),
    teams: referenceMap(teams, ["name", "order"]),
    sessions: referenceMap(sessions, ["date", "endDate", "type", "label"]),
    applications: referenceMap(applications, ["name", "studentId", "personId", "bu", "grade", "class", "status", "teamId"]),
  } as PraiseSemesterReference;
}
