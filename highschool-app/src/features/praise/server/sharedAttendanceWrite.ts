import "server-only";
import { paths } from "@/features/semester/paths";
import { canWritePraiseAttendance, groupVersionForMeeting, praisePermissions } from "../permissions";
import type { PraiseActor, PraiseCommand, PraisePendingAttendanceReview, PraiseSharedAttendanceOperation, PraiseState } from "../types";
import { applyPraiseCommand } from "./commands";
import { getPraiseFirebaseAdmin, praiseUnavailable } from "./firebaseAdmin";
import { transactWorkspace } from "./repository";
import { asRecord, assertSharedSemesterMapping, overlaySharedAttendance, readSharedPath, sharedRevision, sharedStatus, type SharedAttendanceSnapshot } from "./sharedAttendance";
import { fingerprint } from "./stageModel";
import { PraiseDomainError, requireValue } from "./validation";

type Command = Extract<PraiseCommand, { type: "attendance.set" }>;
const pendingMessage = "공통 출석 저장 결과를 확인하지 못했습니다. 같은 작업으로 다시 확인해 주세요. 원장 증거가 바뀐 경우 담당자 확인이 필요합니다.";
export function sharedAppliedProof(value: unknown, signature: string, at: number) {
  const marker = asRecord(value);
  return marker.phase === "applied" && marker.fingerprint === signature && marker.at === at;
}
export function sharedOperationKey(workspaceId: string, operationId: string) { return fingerprint({ workspaceId, operationId }); }
function targetPath(receipt: PraiseSharedAttendanceOperation) {
  return paths.attendanceEntry(receipt.semesterId, "team", receipt.sessionId, receipt.applicationKey);
}
export function sharedWriteProof(raw: unknown, operationKey: string, signature: string, receipt: PraiseSharedAttendanceOperation, actorUid: string, at: number) {
  // 삭제 결과인 null에는 작업 식별자를 남길 수 없다. 최초 적용은 반드시 source revision을
  // 대조하고, 재시도의 멱등성은 같은 학기 transaction에 남긴 영구 표식으로만 확인한다.
  if (receipt.status === null) return false;
  const value = asRecord(raw);
  return value.praiseOperationId === operationKey && value.praiseOperationFingerprint === signature &&
    value.by === actorUid && value.at === new Date(at).toISOString() &&
    value.s === (receipt.status === "PRESENT" ? "출석" : "결석");
}
export function sharedEntryUpdate(raw: unknown, receipt: PraiseSharedAttendanceOperation, actorUid: string, at: number, operationKey: string, signature: string) {
  if (sharedWriteProof(raw, operationKey, signature, receipt, actorUid, at)) return raw;
  requireValue(sharedRevision(raw) === receipt.expectedSourceRevision,
    "학기 출석이 먼저 변경됐습니다. 최신 기록을 불러온 뒤 다시 입력해 주세요.", "revision_conflict", 409);
  if (receipt.status === null) return null;
  return { ...asRecord(raw), s: receipt.status === "PRESENT" ? "출석" : "결석", by: actorUid, at: new Date(at).toISOString(),
    praiseOperationId: operationKey, praiseOperationFingerprint: signature };
}
export function sharedSemesterEntry(semester: unknown, receipt: PraiseSharedAttendanceOperation) {
  return asRecord(asRecord(asRecord(asRecord(semester).attendance).team)[receipt.sessionId])[receipt.applicationKey] ?? null;
}
/** 학기 아래 다른 원장을 보존하고 배치·회차 검사와 출석 한 칸 변경을 같은 transaction에 묶는다. */
export function sharedSemesterUpdate(raw: unknown, receipt: PraiseSharedAttendanceOperation, actorUid: string, at: number, key: string, signature: string) {
  const root = asRecord(raw), marker = asRecord(asRecord(root.praiseOperationReceipts)[key]);
  if (Object.keys(marker).length) {
    requireValue(marker.phase === "applied" && marker.fingerprint === signature && marker.at === at, "이미 종료되었거나 다른 내용의 공통 출석 요청입니다.", "operation_conflict", 409);
    return raw;
  }
  assertSharedSemesterMapping(raw, receipt);
  const value = sharedEntryUpdate(sharedSemesterEntry(raw, receipt), receipt, actorUid, at, key, signature);
  const next = structuredClone(asRecord(raw));
  const attendance = asRecord(next.attendance), team = asRecord(attendance.team), session = asRecord(team[receipt.sessionId]);
  if (value === null) delete session[receipt.applicationKey]; else session[receipt.applicationKey] = value;
  team[receipt.sessionId] = session; attendance.team = team; next.attendance = attendance;
  next.praiseOperationReceipts = { ...asRecord(next.praiseOperationReceipts), [key]: { phase: "applied", fingerprint: signature, at } };
  return next;
}
async function writeEntry(receipt: PraiseSharedAttendanceOperation, actorUid: string, at: number, key: string, signature: string) {
  const reference = getPraiseFirebaseAdmin().database.ref(paths.semester(receipt.semesterId));
  let callbackError: unknown;
  let stopListening = () => {};
  try {
    await new Promise<void>((resolve, reject) => { const listener = () => resolve(); stopListening = () => reference.off("value", listener); reference.on("value", listener, reject); });
    const result = await reference.transaction(raw => {
      try { return sharedSemesterUpdate(raw, receipt, actorUid, at, key, signature); }
      catch (error) { callbackError = error; return undefined; }
    }, undefined, false);
    if (callbackError) throw callbackError;
    requireValue(result.committed && sharedAppliedProof(asRecord(asRecord(result.snapshot.val()).praiseOperationReceipts)[key], signature, at), pendingMessage, "shared_write_pending", 409);
  } catch (error) {
    if (callbackError) throw callbackError;
    if (error instanceof PraiseDomainError) throw error;
    throw praiseUnavailable("shared_write_pending");
  } finally { stopListening(); }
}
function assertReceiptActor(state: PraiseState, operationId: string, actor: PraiseActor, signature: string) {
  const operation = state.operations[operationId];
  requireValue(operation && operation.actorUid === actor.uid && operation.fingerprint === signature && operation.sharedAttendance,
    "다른 내용에 사용된 작업 번호입니다.", "operation_conflict", 409);
  return operation as typeof operation & { sharedAttendance: PraiseSharedAttendanceOperation };
}
/** workspace 예약 → 단일 학기 셀 transaction → 감사 완료. 재시도는 확인만 하고 이미 시도한 쓰기를 재적용하지 않는다. */
export async function executeSharedAttendance(actor: PraiseActor, before: PraiseState, command: Command, operationId: string, snapshot: SharedAttendanceSnapshot): Promise<PraiseState> {
  const workspaceId = before.meta.id, signature = fingerprint(command), key = sharedOperationKey(workspaceId, operationId), at = Date.now();
  const known = before.operations[operationId];
  if (known) {
    const operation = assertReceiptActor(before, operationId, actor, signature);
    if (operation.sharedAttendance.phase === "complete") return before;
    requireValue(!["failed", "closed"].includes(operation.sharedAttendance.phase), "이 작업은 충돌로 저장되지 않았습니다. 새로고침 후 다시 입력해 주세요.", "revision_conflict", 409);
  }
  const target = snapshot.targets[command.meetingId]?.[command.personId];
  const meeting = before.meetings[command.meetingId];
  requireValue(praisePermissions(actor, before).read, "찬양팀 접근 권한이 없습니다.", "forbidden", 403);
  if (!known || known.sharedAttendance?.phase === "prepared") {
    requireValue(meeting && canWritePraiseAttendance(actor, before, meeting, command.personId), "담당 조의 출결만 수정할 수 있습니다.", "forbidden", 403);
    requireValue(before.meta.mode !== "shadow" && before.meta.status !== "archived", "읽기 전용 기록입니다.", "read_only", 409);
  }
  if (!known) {
    requireValue(target, "학기 회차와 현재 찬양팀 신청 인물을 먼저 연결해 주세요.", "attendance_mapping_required", 409);
    requireValue(command.expectedSourceRevision === sharedRevision(target.raw), "공통 출석 기준이 변경됐습니다. 새로고침해 주세요.", "revision_conflict", 409);
    await transactWorkspace(workspaceId, current => {
      requireValue(current, "운영 공간이 없습니다.", "not_found", 404);
      if (current.operations[operationId]) { assertReceiptActor(current, operationId, actor, signature); return current; }
      const resolved = overlaySharedAttendance(current, snapshot);
      // 기존 권한·활성 인물·휴강·조·버전·운영 모드 검증을 그대로 통과해야 예약할 수 있다.
      applyPraiseCommand(resolved, command, actor, at, operationId, { sharedWrite: true });
      const group = groupVersionForMeeting(current, current.meetings[command.meetingId]);
      requireValue(group, "확정된 조 편성이 없습니다.");
      const next = structuredClone(current);
      next.operations[operationId] = { at, actorUid: actor.uid, fingerprint: signature, sharedAttendance: {
        phase: "prepared", meetingId: command.meetingId, personId: command.personId,
        semesterId: target.semesterId, sessionId: target.sessionId, applicationKey: target.applicationKey,
        mappingProof: target.mappingProof, teamId: target.teamId, studentId: target.studentId, meetingDate: target.meetingDate,
        groupVersionId: group.id, expectedSourceRevision: command.expectedSourceRevision!, status: command.status, beforeStatus: sharedStatus(target.raw),
      } };
      return next;
    });
  }
  let attempt = false;
  const reserved = await transactWorkspace(workspaceId, current => {
    attempt = false;
    requireValue(current, "운영 공간이 없습니다.", "not_found", 404);
    const operation = assertReceiptActor(current, operationId, actor, signature);
    if (operation.sharedAttendance.phase !== "prepared") return current;
    requireValue(canWritePraiseAttendance(actor, current, current.meetings[command.meetingId], command.personId), "담당 권한이 변경됐습니다.", "forbidden", 403);
    const next = structuredClone(current);
    next.operations[operationId].sharedAttendance!.phase = "attempting";
    attempt = true;
    return next;
  });
  requireValue(reserved, pendingMessage, "shared_write_pending", 409);
  const operation = assertReceiptActor(reserved, operationId, actor, signature), receipt = operation.sharedAttendance;
  if (receipt.phase === "complete") return reserved;
  requireValue(receipt.phase === "attempting", pendingMessage, "shared_write_pending", 409);
  if (attempt) {
    try { await writeEntry(receipt, actor.uid, operation.at, key, signature); }
    catch (error) {
      if (error instanceof PraiseDomainError && ["revision_conflict", "shared_mapping_conflict", "operation_conflict"].includes(error.code))
        await transactWorkspace(workspaceId, current => {
          if (!current) return undefined;
          const next = structuredClone(current);
          const shared = assertReceiptActor(next, operationId, actor, signature).sharedAttendance;
          if (shared.phase === "attempting") shared.phase = "failed";
          return next;
        });
      throw error;
    }
  } else {
    const proof = await readSharedPath(paths.praiseOperationReceipt(receipt.semesterId, key));
    requireValue(sharedAppliedProof(proof, signature, operation.at), pendingMessage, "shared_write_pending", 409);
  }
  const result = await transactWorkspace(workspaceId, current => {
    requireValue(current, pendingMessage, "shared_write_pending", 409);
    assertReceiptActor(current, operationId, actor, signature);
    return finalizeSharedState(current, operationId, actor);
  });
  requireValue(result, pendingMessage, "shared_write_pending", 409);
  return result;
}

function finalizeSharedState(current: PraiseState, operationId: string, requestingActor: PraiseActor): PraiseState {
  const operation = current.operations[operationId], receipt = operation.sharedAttendance!;
  if (receipt.phase === "complete") return current;
  requireValue(["prepared", "attempting"].includes(receipt.phase) && !current.audit[operationId], "작업 기록이 충돌했습니다.", "operation_conflict", 409);
  const next = structuredClone(current), m = next.meetings[receipt.meetingId];
  if (m && !m.groupVersionId && next.groupVersions[receipt.groupVersionId])
    next.meetings[m.id] = { ...m, groupVersionId: receipt.groupVersionId, revision: m.revision + 1, updatedAt: operation.at, updatedBy: operation.actorUid };
  next.meta = { ...next.meta, revision: next.meta.revision + 1, updatedAt: operation.at, updatedBy: operation.actorUid };
  next.operations[operationId].sharedAttendance!.phase = "complete";
  const label = (status: string | null) => status === "PRESENT" ? "출석" : status === "ABSENT" ? "결석" : "미입력";
  next.audit[operationId] = { id: operationId, at: operation.at,
    actor: { uid: operation.actorUid, ...(requestingActor.uid === operation.actorUid && requestingActor.name ? { name: requestingActor.name } : {}) },
    action: "attendance.set", label: `${m?.date ?? receipt.meetingDate ?? ""} ${next.people[receipt.personId]?.name ?? "팀원"} 공통 출결 변경`, targetId: receipt.personId,
    changes: [{ field: "출결", before: label(receipt.beforeStatus), after: label(receipt.status) }, { field: "출처", after: "학기 사역팀 공통 원장" }] };
  return next;
}

/** 운영자 검토에 필요한 표시 필드만 반환한다. 원본 신청키·UID·경로·명단 proof는 제외한다. */
export async function pendingSharedAttendance(state: PraiseState, actor: PraiseActor): Promise<PraisePendingAttendanceReview[]> {
  if (!praisePermissions(actor, state).manage) return [];
  const pending = Object.entries(state.operations).filter(([, op]) => op.sharedAttendance && ["prepared", "attempting"].includes(op.sharedAttendance.phase))
    .sort((a, b) => a[1].at - b[1].at).slice(0, 50);
  const result: PraisePendingAttendanceReview[] = [];
  for (const [operationId, operation] of pending) {
    const receipt = operation.sharedAttendance!, key = sharedOperationKey(state.meta.id, operationId);
    const [raw, marker] = await Promise.all([readSharedPath(targetPath(receipt)), readSharedPath(paths.praiseOperationReceipt(receipt.semesterId, key))]);
    result.push({ operationId, meetingId: receipt.meetingId, personId: receipt.personId, requestedAt: operation.at, status: receipt.status,
      phase: receipt.phase as "prepared" | "attempting", currentStatus: sharedStatus(raw), sourceRevision: sharedRevision(raw),
      canFinalize: sharedAppliedProof(marker, operation.fingerprint, operation.at) });
  }
  return result;
}

export function closeSharedSemester(raw: unknown, receipt: PraiseSharedAttendanceOperation, key: string, signature: string, expectedRevision: string, at: number) {
  const root = asRecord(raw), marker = asRecord(asRecord(root.praiseOperationReceipts)[key]);
  requireValue(root.meta, "학기 원장이 없어 요청을 안전하게 종료할 수 없습니다.", "shared_mapping_conflict", 409);
  if (Object.keys(marker).length) {
    requireValue(marker.phase === "closed" && marker.fingerprint === signature, "이미 저장된 증거가 있습니다. 기록 완료로 처리해 주세요.", "shared_proof_exists", 409);
    return raw;
  }
  requireValue(sharedRevision(sharedSemesterEntry(raw, receipt)) === expectedRevision, "검토 중 공통 출석이 변경됐습니다. 현재 기록을 다시 확인해 주세요.", "revision_conflict", 409);
  return { ...root, praiseOperationReceipts: { ...asRecord(root.praiseOperationReceipts), [key]: { phase: "closed", fingerprint: signature, at } } };
}
async function closeEntry(receipt: PraiseSharedAttendanceOperation, key: string, signature: string, expectedRevision: string, at: number) {
  const reference = getPraiseFirebaseAdmin().database.ref(paths.semester(receipt.semesterId));
  let callbackError: unknown;
  let stopListening = () => {};
  try {
    await new Promise<void>((resolve, reject) => { const listener = () => resolve(); stopListening = () => reference.off("value", listener); reference.on("value", listener, reject); });
    const result = await reference.transaction(raw => { try { return closeSharedSemester(raw, receipt, key, signature, expectedRevision, at); } catch (error) { callbackError = error; return undefined; } }, undefined, false);
    if (callbackError) throw callbackError;
    const marker = asRecord(asRecord(asRecord(result.snapshot.val()).praiseOperationReceipts)[key]);
    requireValue(result.committed && marker.phase === "closed" && marker.fingerprint === signature, pendingMessage, "shared_write_pending", 409);
  } catch (error) {
    if (callbackError) throw callbackError;
    if (error instanceof PraiseDomainError) throw error;
    throw praiseUnavailable("shared_write_pending");
  } finally { stopListening(); }
}
export async function resolveSharedAttendance(actor: PraiseActor, before: PraiseState, command: Extract<PraiseCommand, {type: "attendance.resolve"}>, operationId: string): Promise<PraiseState> {
  requireValue(praisePermissions(actor, before).read, "찬양팀 접근 권한이 없습니다.", "forbidden", 403);
  requireValue(command.acknowledge === true, "현재 원장을 검토한 뒤 확인해 주세요.");
  const signature = fingerprint(command), known = before.operations[operationId];
  if (!known) requireValue(praisePermissions(actor, before).manage, "관리자만 공통 출석 요청을 검토할 수 있습니다.", "forbidden", 403);
  // 외부 표식에 손대기 전에 최신 권한·대상·작업 번호를 private workspace에 예약한다.
  const reserved = await transactWorkspace(before.meta.id, current => {
    requireValue(current, "운영 공간이 없습니다.", "not_found", 404);
    const existing = current.operations[operationId];
    if (existing) {
      requireValue(existing.actorUid === actor.uid && existing.fingerprint === signature && existing.sharedAttendanceResolution,
        "다른 내용에 사용된 작업 번호입니다.", "operation_conflict", 409);
      requireValue(existing.sharedAttendanceResolution.phase !== "superseded", "다른 관리자가 이미 검토를 완료했습니다. 최신 화면을 확인해 주세요.", "already_resolved", 409);
      return current;
    }
    requireValue(praisePermissions(actor, current).manage, "관리자 권한이 변경됐습니다. 다시 확인해 주세요.", "forbidden", 403);
    requireValue(!current.audit[operationId] && !current.groupVersions[`v_${operationId}`] && !current.stageVersions[`v_${operationId}`],
      "다른 기록에 사용된 작업 번호입니다.", "operation_conflict", 409);
    const original = current.operations[command.pendingOperationId], receipt = original?.sharedAttendance;
    requireValue(receipt && ["prepared", "attempting"].includes(receipt.phase), "검토할 공통 출석 요청이 없습니다.", "not_found", 404);
    requireValue(before.operations[command.pendingOperationId]?.fingerprint === original.fingerprint, "검토할 원본 요청이 변경됐습니다.", "operation_conflict", 409);
    const next = structuredClone(current);
    next.operations[operationId] = { at: Date.now(), actorUid: actor.uid, fingerprint: signature, sharedAttendanceResolution: {
      phase: "prepared", pendingOperationId: command.pendingOperationId, resolution: command.resolution,
      expectedSourceRevision: command.expectedSourceRevision, originalFingerprint: original.fingerprint,
    } };
    return next;
  });
  requireValue(reserved, pendingMessage, "shared_write_pending", 409);
  const reservation = reserved.operations[operationId], resolution = reservation.sharedAttendanceResolution!;
  if (resolution.phase === "complete") return reserved;
  const original = reserved.operations[resolution.pendingOperationId], receipt = original.sharedAttendance!;
  requireValue(original.fingerprint === resolution.originalFingerprint, "원본 요청이 변경됐습니다.", "operation_conflict", 409);
  const key = sharedOperationKey(before.meta.id, resolution.pendingOperationId);
  const marker = asRecord(await readSharedPath(paths.praiseOperationReceipt(receipt.semesterId, key)));
  const externalComplete = resolution.resolution === "close"
    ? marker.phase === "closed" && marker.fingerprint === original.fingerprint
    : sharedAppliedProof(marker, original.fingerprint, original.at);
  requireValue(resolution.phase !== "verified" || externalComplete, "검토 처리 증거가 없어 현재 상태를 다시 확인해야 합니다.", "shared_proof_missing", 409);
  if (resolution.phase !== "verified" && (resolution.resolution === "finalize" || !externalComplete || !known)) {
    // 아직 외부 처리를 하지 않은 예약의 재개에는 현재 관리자 권한도 필요하다.
    await transactWorkspace(before.meta.id, current => {
      requireValue(current && praisePermissions(actor, current).manage, "관리자 권한이 변경됐습니다. 다시 확인해 주세요.", "forbidden", 403);
      const pending = current.operations[operationId];
      requireValue(pending?.actorUid === actor.uid && pending.fingerprint === signature && pending.sharedAttendanceResolution?.phase === "prepared" &&
        current.operations[resolution.pendingOperationId]?.fingerprint === original.fingerprint,
        "검토 요청이 변경됐습니다.", "operation_conflict", 409);
      return current;
    });
    if (resolution.resolution === "close") {
      if (!externalComplete) await closeEntry(receipt, key, original.fingerprint, resolution.expectedSourceRevision, reservation.at);
    } else {
      const raw = await readSharedPath(targetPath(receipt));
      requireValue(sharedRevision(raw) === resolution.expectedSourceRevision, "검토 중 공통 출석이 변경됐습니다. 다시 확인해 주세요.", "revision_conflict", 409);
      requireValue(externalComplete, "해당 요청의 저장 증거가 없어 성공으로 확정할 수 없습니다.", "shared_proof_missing", 409);
    }
  }
  await transactWorkspace(before.meta.id, current => {
    requireValue(current, pendingMessage, "shared_write_pending", 409);
    const approved = current.operations[operationId];
    requireValue(approved?.actorUid === reservation.actorUid && approved.fingerprint === signature && approved.sharedAttendanceResolution &&
      current.operations[resolution.pendingOperationId]?.fingerprint === original.fingerprint,
      "검토 작업 예약이 변경됐습니다.", "operation_conflict", 409);
    requireValue(approved.sharedAttendanceResolution.phase !== "superseded", "다른 관리자가 검토를 완료했습니다.", "already_resolved", 409);
    if (approved.sharedAttendanceResolution.phase !== "prepared") return current;
    const next = structuredClone(current); next.operations[operationId].sharedAttendanceResolution!.phase = "verified"; return next;
  });
  // 외부 처리 뒤에는 예약 당시 권한으로 감사 완료에 수렴한다. 이후 권한 회수로 고아 표식을 만들지 않는다.
  const result = await transactWorkspace(before.meta.id, current => {
    requireValue(current, pendingMessage, "shared_write_pending", 409);
    const activeReservation = current.operations[operationId];
    requireValue(activeReservation?.actorUid === reservation.actorUid && activeReservation.fingerprint === signature && activeReservation.sharedAttendanceResolution,
      "검토 작업 예약이 변경됐습니다.", "operation_conflict", 409);
    if (activeReservation.sharedAttendanceResolution.phase === "complete") return current;
    requireValue(activeReservation.sharedAttendanceResolution.phase === "verified" && !current.audit[operationId], "다른 관리자가 검토를 완료했습니다.", "already_resolved", 409);
    const actual = current.operations[resolution.pendingOperationId];
    requireValue(actual?.fingerprint === original.fingerprint && actual.sharedAttendance, "원본 요청이 변경됐습니다.", "operation_conflict", 409);
    let next = resolution.resolution === "finalize" ? finalizeSharedState(current, resolution.pendingOperationId, actor) : structuredClone(current);
    if (resolution.resolution === "close") {
      requireValue(actual.sharedAttendance.phase !== "complete", "완료된 요청은 종료할 수 없습니다.", "operation_conflict", 409);
      next.operations[resolution.pendingOperationId].sharedAttendance!.phase = "closed";
    }
    next = structuredClone(next);
    const at = Date.now();
    next.meta = { ...next.meta, revision: next.meta.revision + 1, updatedAt: at, updatedBy: reservation.actorUid };
    next.operations[operationId].sharedAttendanceResolution!.phase = "complete";
    for (const [otherId, other] of Object.entries(next.operations)) {
      const review = other.sharedAttendanceResolution;
      if (otherId !== operationId && review && ["prepared", "verified"].includes(review.phase) && review.pendingOperationId === resolution.pendingOperationId) review.phase = "superseded";
    }
    next.audit[operationId] = { id: operationId, at, actor: { uid: reservation.actorUid, ...(actor.name ? {name: actor.name} : {}) }, action: "attendance.resolve",
      label: resolution.resolution === "close" ? "공통 출석 요청 검토·종료 확인" : "공통 출석 저장 증거 확인·감사 완료", targetId: receipt.personId,
      changes: [{ field: "검토 결과", after: resolution.resolution === "close" ? "원장 미변경·미확정 요청 종료" : "원자 저장 증거로 완료 확인" }] };
    return next;
  });
  requireValue(result, pendingMessage, "shared_write_pending", 409);
  return result;
}
