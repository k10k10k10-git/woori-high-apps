export const STUDENT_MOVE_PENDING_STALE_MS = 10 * 60 * 1000;

export type StudentMoveLockPhase = 'preparing' | 'pending';

export type StudentMoveLockRecord = {
  phase: StudentMoveLockPhase;
  startedAt: number;
  fromCk: string;
  toCk: string;
  sid: string;
};

export type StudentMoveLockIdentity = {
  ownerUid: string;
  operationId: string;
  record: StudentMoveLockRecord;
};

export type StudentMoveLockTransaction = (
  updateValue: (currentValue: unknown) => Record<string, unknown> | null | undefined,
) => Promise<{ committed: boolean; value: unknown }>;

export type StudentMoveLockAcquireResult =
  | { acquired: true }
  | { acquired: false; currentValue: unknown };

type StudentMoveRecoveryEvidence = {
  commitMarkerState: 'absent' | 'committed' | 'invalid';
  sourceStudentExists: boolean;
  destinationStudentExists: boolean;
};

export type StudentMoveLockRecoveryResult =
  | { status: 'retry'; lock: StudentMoveLockIdentity }
  | { status: 'completed'; lock: StudentMoveLockIdentity }
  | { status: 'blocked'; reason: 'preparing' | 'pending' | 'changed' }
  | { status: 'manual' };

const isObject = (value: unknown): value is Record<string, unknown> => (
  value !== null && typeof value === 'object' && !Array.isArray(value)
);

function sameLockRecord(left: unknown, right: StudentMoveLockRecord): boolean {
  if (!isObject(left)) return false;
  const keys = Object.keys(left).sort();
  if (keys.join('|') !== 'fromCk|phase|sid|startedAt|toCk') return false;
  return left.phase === right.phase
    && left.startedAt === right.startedAt
    && left.fromCk === right.fromCk
    && left.toCk === right.toCk
    && left.sid === right.sid;
}

function isLockRecord(value: unknown): value is StudentMoveLockRecord {
  if (!isObject(value)) return false;
  const phase = value.phase;
  return (phase === 'preparing' || phase === 'pending')
    && typeof value.startedAt === 'number'
    && Number.isFinite(value.startedAt)
    && value.startedAt >= 0
    && typeof value.fromCk === 'string'
    && value.fromCk.length > 0
    && typeof value.toCk === 'string'
    && value.toCk.length > 0
    && value.fromCk !== value.toCk
    && typeof value.sid === 'string'
    && value.sid.length > 0
    && sameLockRecord(value, value as StudentMoveLockRecord);
}

function classLockValue(identity: StudentMoveLockIdentity): Record<string, unknown> {
  return {
    [identity.ownerUid]: {
      [identity.operationId]: { ...identity.record },
    },
  };
}

function isExactClassLock(value: unknown, identity: StudentMoveLockIdentity): boolean {
  if (!isObject(value)) return false;
  const ownerEntries = Object.entries(value);
  if (ownerEntries.length !== 1 || ownerEntries[0][0] !== identity.ownerUid) return false;
  const operationValue = ownerEntries[0][1];
  if (!isObject(operationValue)) return false;
  const operationEntries = Object.entries(operationValue);
  return operationEntries.length === 1
    && operationEntries[0][0] === identity.operationId
    && sameLockRecord(operationEntries[0][1], identity.record);
}

function asYearLockValue(currentValue: unknown): Record<string, unknown> | null {
  if (currentValue === null) return {};
  return isObject(currentValue) ? { ...currentValue } : null;
}

function hasExactDualLock(currentValue: unknown, identity: StudentMoveLockIdentity): boolean {
  if (!isObject(currentValue)) return false;
  return isExactClassLock(currentValue[identity.record.fromCk], identity)
    && isExactClassLock(currentValue[identity.record.toCk], identity);
}

function withDualLock(
  currentValue: unknown,
  identity: StudentMoveLockIdentity,
  allowEmpty: boolean,
): Record<string, unknown> | undefined {
  const yearValue = asYearLockValue(currentValue);
  if (!yearValue) return undefined;
  for (const classKey of [identity.record.fromCk, identity.record.toCk]) {
    const currentClassLock = yearValue[classKey];
    if (currentClassLock !== undefined && currentClassLock !== null) {
      if (!isExactClassLock(currentClassLock, identity)) return undefined;
    } else if (!allowEmpty) {
      return undefined;
    }
  }
  return {
    ...yearValue,
    [identity.record.fromCk]: classLockValue(identity),
    [identity.record.toCk]: classLockValue(identity),
  };
}

export function studentMoveLockYearPath(year: number): string {
  return `config/studentMoveLocks/${year}`;
}

export function studentMoveLockParentPath(year: number, classKey: string): string {
  return `${studentMoveLockYearPath(year)}/${classKey}`;
}

export function studentMoveLockPath(
  year: number,
  classKey: string,
  ownerUid: string,
  operationId: string,
): string {
  return `${studentMoveLockParentPath(year, classKey)}/${ownerUid}/${operationId}`;
}

export function studentMoveLockRelativePath(
  classKey: string,
  ownerUid: string,
  operationId: string,
): string {
  return `${classKey}/${ownerUid}/${operationId}`;
}

export function studentMoveLockPaths(
  year: number,
  identity: StudentMoveLockIdentity,
): readonly [string, string] {
  return [
    studentMoveLockPath(year, identity.record.fromCk, identity.ownerUid, identity.operationId),
    studentMoveLockPath(year, identity.record.toCk, identity.ownerUid, identity.operationId),
  ];
}

export function studentMoveLockDisconnectPayload(
  identity: StudentMoveLockIdentity,
): Record<string, null> {
  return {
    [studentMoveLockRelativePath(identity.record.fromCk, identity.ownerUid, identity.operationId)]: null,
    [studentMoveLockRelativePath(identity.record.toCk, identity.ownerUid, identity.operationId)]: null,
  };
}

export function studentMoveCommitPath(
  year: number,
  identity: StudentMoveLockIdentity,
): string {
  const { fromCk, toCk, sid } = identity.record;
  return [
    'config',
    'studentMoveCommits',
    String(year),
    fromCk,
    toCk,
    sid,
    identity.ownerUid,
    identity.operationId,
  ].join('/');
}

export function createStudentMoveOperationId(
  now: number = Date.now(),
  nonce: string = globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2),
): string {
  return `student_move_${now}_${nonce}`;
}

/** 잠금 필드를 늘리지 않고 재접속 시에도 확정된 목적지 ID를 복원한다. */
export function studentMoveOperationWithDestination(operationId: string, destinationId: string): string {
  if (!destinationId || /[.#$\[\]/\u0000-\u001f\u007f]/.test(destinationId)) {
    throw new Error('학생 이동 ID가 올바르지 않습니다.');
  }
  const value = `student_move_v2~${encodeURIComponent(destinationId).replaceAll('~', '%7E')}~${operationId}`;
  if (new TextEncoder().encode(value).length > 768) throw new Error('학생 이동 ID가 너무 깁니다.');
  return value;
}

export function studentMoveDestinationId(identity: StudentMoveLockIdentity): string {
  if (!identity.operationId.startsWith('student_move_v2~')) return identity.record.sid;
  const parts = identity.operationId.split('~');
  const destinationId = decodeURIComponent(parts[1] ?? '');
  if (parts.length !== 3 || studentMoveOperationWithDestination(parts[2], destinationId) !== identity.operationId) {
    throw new Error('학생 이동 목적지를 확인할 수 없습니다.');
  }
  return destinationId;
}

export function createStudentMoveLockRecord(input: {
  startedAt: number;
  fromCk: string;
  toCk: string;
  sid: string;
}): StudentMoveLockRecord {
  return { phase: 'preparing', ...input };
}

export function claimStudentMoveLocksValue(
  currentValue: unknown,
  identity: StudentMoveLockIdentity,
): Record<string, unknown> | undefined {
  return withDualLock(currentValue, identity, true);
}

export async function acquireStudentMoveLocks(
  identity: StudentMoveLockIdentity,
  transact: StudentMoveLockTransaction,
): Promise<StudentMoveLockAcquireResult> {
  const result = await transact((currentValue) => claimStudentMoveLocksValue(currentValue, identity));
  if (result.committed && hasExactDualLock(result.value, identity)) return { acquired: true };
  return { acquired: false, currentValue: result.value };
}

export function serverAdjustedStudentMoveTime(
  clientNow: number,
  serverTimeOffset: unknown,
  serverConnected: unknown,
): number | null {
  if (serverConnected !== true
    || !Number.isFinite(clientNow)
    || typeof serverTimeOffset !== 'number'
    || !Number.isFinite(serverTimeOffset)) {
    return null;
  }
  const adjusted = clientNow + serverTimeOffset;
  return Number.isFinite(adjusted) && adjusted >= 0 ? adjusted : null;
}

export function pendingStudentMoveLock(
  identity: StudentMoveLockIdentity,
  pendingStartedAt: number,
): StudentMoveLockIdentity {
  return {
    ...identity,
    record: { ...identity.record, phase: 'pending', startedAt: pendingStartedAt },
  };
}

export function transitionStudentMoveLocksValue(
  currentValue: unknown,
  preparingLock: StudentMoveLockIdentity,
  pendingStartedAt: number,
): Record<string, unknown> | undefined {
  if (preparingLock.record.phase !== 'preparing') return undefined;
  const pendingLock = pendingStudentMoveLock(preparingLock, pendingStartedAt);
  if (!hasExactDualLock(currentValue, preparingLock) && !hasExactDualLock(currentValue, pendingLock)) {
    return undefined;
  }
  if (!isObject(currentValue)) return undefined;
  return {
    ...currentValue,
    [pendingLock.record.fromCk]: classLockValue(pendingLock),
    [pendingLock.record.toCk]: classLockValue(pendingLock),
  };
}

export async function transitionStudentMoveLocksToPending(
  preparingLock: StudentMoveLockIdentity,
  pendingStartedAt: number,
  transact: StudentMoveLockTransaction,
): Promise<StudentMoveLockIdentity | null> {
  const pendingLock = pendingStudentMoveLock(preparingLock, pendingStartedAt);
  const result = await transact((currentValue) => (
    transitionStudentMoveLocksValue(currentValue, preparingLock, pendingStartedAt)
  ));
  return result.committed && hasExactDualLock(result.value, pendingLock) ? pendingLock : null;
}

export async function confirmStudentMoveLockOwnership(
  pendingLock: StudentMoveLockIdentity,
  transact: StudentMoveLockTransaction,
): Promise<boolean> {
  if (pendingLock.record.phase !== 'pending') return false;
  const result = await transact((currentValue) => (
    hasExactDualLock(currentValue, pendingLock) ? { ...(currentValue as Record<string, unknown>) } : undefined
  ));
  return result.committed && hasExactDualLock(result.value, pendingLock);
}

export function releaseStudentMoveLocksValue(
  currentValue: unknown,
  identity: StudentMoveLockIdentity,
): Record<string, unknown> | null | undefined {
  if (!hasExactDualLock(currentValue, identity) || !isObject(currentValue)) return undefined;
  const nextValue = { ...currentValue };
  delete nextValue[identity.record.fromCk];
  delete nextValue[identity.record.toCk];
  return Object.keys(nextValue).length > 0 ? nextValue : null;
}

export async function releaseStudentMoveLocks(
  identity: StudentMoveLockIdentity,
  transact: StudentMoveLockTransaction,
): Promise<boolean> {
  const result = await transact((currentValue) => releaseStudentMoveLocksValue(currentValue, identity));
  if (!result.committed) return false;
  if (result.value === null) return true;
  if (!isObject(result.value)) return false;
  return result.value[identity.record.fromCk] == null && result.value[identity.record.toCk] == null;
}

function parseClassLock(value: unknown): StudentMoveLockIdentity | null {
  if (!isObject(value)) return null;
  const ownerEntries = Object.entries(value);
  if (ownerEntries.length !== 1) return null;
  const [ownerUid, operationValue] = ownerEntries[0];
  if (!ownerUid || !isObject(operationValue)) return null;
  const operationEntries = Object.entries(operationValue);
  if (operationEntries.length !== 1) return null;
  const [operationId, record] = operationEntries[0];
  if (!operationId || !isLockRecord(record)) return null;
  return { ownerUid, operationId, record };
}

function sameIdentity(left: StudentMoveLockIdentity, right: StudentMoveLockIdentity): boolean {
  return left.ownerUid === right.ownerUid
    && left.operationId === right.operationId
    && sameLockRecord(left.record, right.record);
}

export function findStudentMoveLockConflict(
  currentValue: unknown,
  requestedClassKeys: readonly [string, string],
): { status: 'none' } | { status: 'manual' } | { status: 'found'; lock: StudentMoveLockIdentity } {
  if (currentValue === null) return { status: 'none' };
  if (!isObject(currentValue)) return { status: 'manual' };

  const found: StudentMoveLockIdentity[] = [];
  for (const classKey of [...new Set(requestedClassKeys)]) {
    const classValue = currentValue[classKey];
    if (classValue === undefined || classValue === null) continue;
    const parsed = parseClassLock(classValue);
    if (!parsed || (parsed.record.fromCk !== classKey && parsed.record.toCk !== classKey)) {
      return { status: 'manual' };
    }
    if (!found.some((candidate) => sameIdentity(candidate, parsed))) found.push(parsed);
  }
  if (found.length === 0) return { status: 'none' };
  if (found.length !== 1) return { status: 'manual' };

  const lock = found[0];
  if (!hasExactDualLock(currentValue, lock)) return { status: 'manual' };
  return { status: 'found', lock };
}

export function isStalePendingStudentMoveLock(
  record: StudentMoveLockRecord,
  now: number,
): boolean {
  return record.phase === 'pending' && now - record.startedAt >= STUDENT_MOVE_PENDING_STALE_MS;
}

export function classifyStudentMoveRecoveryEvidence(
  evidence: StudentMoveRecoveryEvidence,
): 'retry' | 'completed' | 'manual' {
  if (evidence.commitMarkerState === 'absent'
    && evidence.sourceStudentExists
    && !evidence.destinationStudentExists) {
    return 'retry';
  }
  if (evidence.commitMarkerState === 'committed'
    && !evidence.sourceStudentExists
    && evidence.destinationStudentExists) {
    return 'completed';
  }
  return 'manual';
}

export async function recoverStaleStudentMoveLock(input: {
  currentValue: unknown;
  requestedClassKeys: readonly [string, string];
  now: number;
  readEvidence: (lock: StudentMoveLockIdentity) => Promise<StudentMoveRecoveryEvidence>;
  release: (lock: StudentMoveLockIdentity) => Promise<boolean>;
}): Promise<StudentMoveLockRecoveryResult> {
  const conflict = findStudentMoveLockConflict(input.currentValue, input.requestedClassKeys);
  if (conflict.status === 'none') return { status: 'blocked', reason: 'changed' };
  if (conflict.status === 'manual') return { status: 'manual' };

  const { lock } = conflict;
  if (lock.record.phase === 'preparing') return { status: 'blocked', reason: 'preparing' };
  if (!isStalePendingStudentMoveLock(lock.record, input.now)) {
    return { status: 'blocked', reason: 'pending' };
  }

  let evidence: StudentMoveRecoveryEvidence;
  try {
    evidence = await input.readEvidence(lock);
  } catch {
    return { status: 'manual' };
  }
  const decision = classifyStudentMoveRecoveryEvidence(evidence);
  if (decision === 'manual') return { status: 'manual' };

  let released = false;
  try {
    released = await input.release(lock);
  } catch {
    return { status: 'blocked', reason: 'changed' };
  }
  if (!released) return { status: 'blocked', reason: 'changed' };
  return { status: decision, lock };
}
