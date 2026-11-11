import {
  child, push, runTransaction as nativeRunTransaction, serverTimestamp, update as nativeUpdate,
  type DatabaseReference, type TransactionResult,
} from "@/lib/rtdb";
import { auth } from "@/lib/firebase";
import { paths } from "@/lib/paths";
import { rootPatchForUpdate, summarizeWrite, validateWritePath, type ActivityWriteContext, type RootWritePatch } from "./writeModel";
import type { ActivityLogRecord } from "./types";
export type { ActivityWriteContext } from "./writeModel";

const LOGIN_ERROR = "활동 기록을 남기려면 로그인 상태를 확인해 주세요. 새로고침 후 다시 저장해 주세요.";
const CHANGED_AUTH_ERROR = "저장 중 로그인 계정이 변경되었습니다. 새로고침 후 다시 저장해 주세요.";

export class ActivityLogAfterCommitError extends Error {
  readonly businessCommitted = true;
  constructor() {
    super("업무는 저장됐으나 활동 로그 저장에 실패했습니다. 새로고침 후 확인해 주세요.");
    this.name = "ActivityLogAfterCommitError";
  }
}

function pathOf(reference: DatabaseReference): string {
  const parts: string[] = [];
  for (let current: DatabaseReference | null = reference; current?.key != null; current = current.parent) parts.unshift(current.key);
  return parts.join("/");
}

async function writer() {
  const user = auth.currentUser;
  if (!user?.uid) throw new Error(LOGIN_ERROR);
  // 이름 조회 실패가 기존 RTDB 오프라인 저장 큐 진입까지 막지 않도록 UID만으로 진행한다.
  const token = await user.getIdTokenResult().catch(() => null);
  if (auth.currentUser !== user || auth.currentUser.uid !== user.uid) throw new Error(CHANGED_AUTH_ERROR);
  // 이름은 서명된 토큰 클레임에서만 가져온다. 이메일이나 UI의 역할 이름을 사용하지 않는다.
  const candidate = token?.claims.name;
  const name = typeof candidate === "string" && candidate.trim().length > 0 && candidate.length <= 80
    && !/[\u0000-\u001f\u007f@]/.test(candidate) && !/\d/.test(candidate) ? candidate : undefined;
  const actor: ActivityLogRecord["actor"] = { kind: "user", uid: user.uid, ...(name ? { name } : {}) };
  return {
    actor,
    ensureCurrent() {
      if (auth.currentUser !== user || auth.currentUser?.uid !== user.uid) throw new Error(CHANGED_AUTH_ERROR);
    },
  };
}

async function prepareLog(reference: DatabaseReference, patch: RootWritePatch, author: Awaited<ReturnType<typeof writer>>, context?: ActivityWriteContext) {
  const action = Object.values(patch).every((value) => value === null) ? "delete" : "update";
  const summary = await summarizeWrite(patch, action, { actorUid: author.actor.uid, context });
  if (!summary) return null;
  const eventsPath = paths.activityLogEvents();
  const logRef = push(child(reference.root, eventsPath));
  if (!logRef.key) throw new Error("활동 기록 번호를 만들지 못했습니다.");
  return {
    path: `${eventsPath}/${logRef.key}`,
    record: { id: logRef.key, schemaVersion: 1, occurredAt: serverTimestamp(), recordedAt: serverTimestamp(), actor: author.actor, ...summary },
  };
}

async function atomicWrite(reference: DatabaseReference, patch: RootWritePatch, context?: ActivityWriteContext): Promise<void> {
  if (Object.keys(patch).length === 0) return;
  const author = await writer();
  const log = await prepareLog(reference, patch, author, context);
  author.ensureCurrent();
  // 호출자가 준 값은 그대로 유지한다. 서버 Rules가 업무와 로그 권한을 모두 검사한다.
  await nativeUpdate(reference.root, log ? { ...patch, [log.path]: log.record } : patch);
}

export async function auditedUpdate(reference: DatabaseReference, values: Parameters<typeof nativeUpdate>[1], context?: ActivityWriteContext): Promise<void> {
  await atomicWrite(reference, rootPatchForUpdate(pathOf(reference), values), context);
}

export async function auditedSet(reference: DatabaseReference, value: unknown): Promise<void> {
  const path = pathOf(reference);
  if (!path) throw new Error("원장 전체 덮어쓰기는 활동 기록과 함께 저장할 수 없습니다. 경로별 변경을 사용해 주세요.");
  validateWritePath(path);
  await atomicWrite(reference, { [path]: value });
}

export async function auditedRemove(reference: DatabaseReference, context?: ActivityWriteContext): Promise<void> {
  const path = pathOf(reference);
  validateWritePath(path);
  await atomicWrite(reference, { [path]: null }, context);
}

// 트랜잭션 callback이 입력 객체를 직접 수정해도 호출 전 상태를 보존해 비교한다.
function valueSignature(value: unknown): string {
  if (value === undefined) return "undefined";
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(valueSignature).join(",")}]`;
  return `{${Object.entries(value).sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
    .map(([key, entry]) => `${JSON.stringify(key)}:${valueSignature(entry)}`).join(",")}}`;
}

export async function auditedRunTransaction(
  reference: DatabaseReference,
  updateFn: Parameters<typeof nativeRunTransaction>[1],
  options?: Parameters<typeof nativeRunTransaction>[2],
): Promise<TransactionResult> {
  const path = pathOf(reference);
  validateWritePath(path);
  const author = await writer();
  author.ensureCurrent();
  // 재시도되는 callback 안에 로그 부수효과를 넣지 않는다. 기존 트랜잭션 범위를 유지한다.
  let changed = false;
  const result = await nativeRunTransaction(reference, (current) => {
    const before = valueSignature(current);
    const next = updateFn(current);
    changed = next !== undefined && before !== valueSignature(next);
    return next;
  }, options);
  if (!result.committed || !changed) return result;
  try {
    const log = await prepareLog(reference, { [path]: result.snapshot.val() }, author);
    author.ensureCurrent();
    if (log) await nativeUpdate(reference.root, { [log.path]: log.record });
  } catch {
    throw new ActivityLogAfterCommitError();
  }
  return result;
}
