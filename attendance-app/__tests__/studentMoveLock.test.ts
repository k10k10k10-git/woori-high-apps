import { describe, expect, it, vi } from 'vitest';
import {
  STUDENT_MOVE_PENDING_STALE_MS,
  acquireStudentMoveLocks,
  claimStudentMoveLocksValue,
  confirmStudentMoveLockOwnership,
  createStudentMoveLockRecord,
  createStudentMoveOperationId,
  isStalePendingStudentMoveLock,
  pendingStudentMoveLock,
  recoverStaleStudentMoveLock,
  releaseStudentMoveLocks,
  releaseStudentMoveLocksValue,
  serverAdjustedStudentMoveTime,
  studentMoveCommitPath,
  studentMoveDestinationId,
  studentMoveOperationWithDestination,
  studentMoveLockDisconnectPayload,
  studentMoveLockParentPath,
  studentMoveLockPath,
  studentMoveLockRelativePath,
  studentMoveLockYearPath,
  transitionStudentMoveLocksToPending,
  transitionStudentMoveLocksValue,
  type StudentMoveLockIdentity,
  type StudentMoveLockTransaction,
} from '@/utils/studentMoveLock';

describe('이동 목적지 ID의 재접속 호환', () => {
  const record = createStudentMoveLockRecord({ startedAt: 123, fromCk: '2-1-7', toCk: '1-1-7', sid: 'S17_05' });
  it('구버전은 원래 ID, 새버전은 확정된 새 ID로 복구 증거를 조회한다', () => {
    const old = { ownerUid: 'admin', operationId: createStudentMoveOperationId(123, 'nonce'), record };
    expect(studentMoveDestinationId(old)).toBe('S17_05');
    for (const destinationId of ['S17_05', '-new-key', 'safe~id']) {
      const next = { ...old, operationId: studentMoveOperationWithDestination(old.operationId, destinationId) };
      expect(studentMoveDestinationId(next)).toBe(destinationId);
      expect(studentMoveDestinationId(pendingStudentMoveLock(next, 999))).toBe(destinationId);
      expect(studentMoveCommitPath(2026, next)).toContain('/S17_05/admin/');
    }
  });
  it('손상되거나 경로를 침범하는 목적지는 추정하지 않는다', () => {
    expect(() => studentMoveOperationWithDestination('op', '../other')).toThrow();
    expect(() => studentMoveOperationWithDestination('op', 'a'.repeat(769))).toThrow();
    expect(() => studentMoveDestinationId({ ownerUid: 'admin', operationId: 'student_move_v2~%ZZ~op', record })).toThrow();
  });
});

function memoryTransaction(initialValue: unknown) {
  let value = initialValue;
  const transact: StudentMoveLockTransaction = async (updateValue) => {
    const nextValue = updateValue(value);
    if (nextValue === undefined) return { committed: false, value };
    value = nextValue;
    return { committed: true, value };
  };
  return { transact, value: () => value };
}

const preparingLock: StudentMoveLockIdentity = {
  ownerUid: 'admin_uid',
  operationId: 'student_move_100_nonce',
  record: createStudentMoveLockRecord({
    startedAt: 100,
    fromCk: '1-1-1',
    toCk: '1-1-2',
    sid: 'S11_01',
  }),
};
const pendingStartedAt = 200;

function dualLockValue(lock: StudentMoveLockIdentity): Record<string, unknown> {
  const value = claimStudentMoveLocksValue(null, lock);
  if (!value) throw new Error('테스트 잠금 생성 실패');
  return value;
}

describe('studentMoveLock 경로와 dual lock', () => {
  it('연도·반·UID·작업별 잠금 경로를 만든다', () => {
    expect(studentMoveLockYearPath(2026)).toBe('config/studentMoveLocks/2026');
    expect(studentMoveLockParentPath(2026, '1-2-3')).toBe(
      'config/studentMoveLocks/2026/1-2-3',
    );
    const operationId = createStudentMoveOperationId(123, 'nonce');
    expect(operationId).toBe('student_move_123_nonce');
    expect(studentMoveLockPath(2026, '1-2-3', 'admin_uid', operationId)).toBe(
      'config/studentMoveLocks/2026/1-2-3/admin_uid/student_move_123_nonce',
    );
    expect(studentMoveLockRelativePath('1-2-3', 'admin_uid', operationId)).toBe(
      '1-2-3/admin_uid/student_move_123_nonce',
    );
    const identity = {
      ...preparingLock,
      operationId,
      record: { ...preparingLock.record, fromCk: '1-2-3', toCk: '1-2-4' },
    };
    expect(studentMoveCommitPath(2026, identity)).toBe(
      'config/studentMoveCommits/2026/1-2-3/1-2-4/S11_01/admin_uid/student_move_123_nonce',
    );
    expect(studentMoveLockDisconnectPayload(identity)).toEqual({
      '1-2-3/admin_uid/student_move_123_nonce': null,
      '1-2-4/admin_uid/student_move_123_nonce': null,
    });
  });

  it('원본·목적지 반을 한 트랜잭션에서 선점하고 다른 반 잠금은 보존한다', async () => {
    const unrelated = { anotherClass: { other: true } };
    const store = memoryTransaction(unrelated);

    expect(await acquireStudentMoveLocks(preparingLock, store.transact)).toEqual({ acquired: true });
    expect(store.value()).toEqual({
      ...unrelated,
      '1-1-1': {
        admin_uid: { student_move_100_nonce: preparingLock.record },
      },
      '1-1-2': {
        admin_uid: { student_move_100_nonce: preparingLock.record },
      },
    });
  });

  it('양쪽 반 잠금 값을 독립 객체로 만들어 한쪽 변조가 다른 쪽에 번지지 않는다', () => {
    const value = dualLockValue(preparingLock);
    const source = value['1-1-1'] as Record<string, unknown>;
    const destination = value['1-1-2'] as Record<string, unknown>;

    expect(source).not.toBe(destination);
    destination.unexpected = true;
    expect(source).not.toHaveProperty('unexpected');
  });

  it('두 반 중 한 곳이라도 다른 작업이 잠갔으면 둘 다 선점하지 않는다', async () => {
    const otherLock: StudentMoveLockIdentity = {
      ...preparingLock,
      ownerUid: 'other_uid',
      operationId: 'other_operation',
    };
    const current = { '1-1-2': dualLockValue(otherLock)['1-1-2'] };
    const store = memoryTransaction(current);

    const result = await acquireStudentMoveLocks(preparingLock, store.transact);
    expect(result).toEqual({ acquired: false, currentValue: current });
    expect(store.value()).toEqual(current);
  });

  it('두 leaf를 preparing에서 pending으로 함께 전환하고 pending 소유권만 재확인한다', async () => {
    const store = memoryTransaction(dualLockValue(preparingLock));
    const pendingLock = await transitionStudentMoveLocksToPending(
      preparingLock,
      pendingStartedAt,
      store.transact,
    );

    expect(pendingLock).toEqual(pendingStudentMoveLock(preparingLock, pendingStartedAt));
    expect(await confirmStudentMoveLockOwnership(pendingLock!, store.transact)).toBe(true);
    expect(await confirmStudentMoveLockOwnership(preparingLock, store.transact)).toBe(false);
    expect(transitionStudentMoveLocksValue(
      store.value(),
      preparingLock,
      pendingStartedAt,
    )).toEqual(store.value());
  });

  it('두 반의 exact lock이 모두 일치할 때만 조건부 정리한다', async () => {
    const pendingLock = pendingStudentMoveLock(preparingLock, pendingStartedAt);
    const unrelated = { '2-2-2': { other_uid: { other_operation: { phase: 'preparing' } } } };
    const current = { ...unrelated, ...dualLockValue(pendingLock) };
    const store = memoryTransaction(current);

    expect(await releaseStudentMoveLocks(pendingLock, store.transact)).toBe(true);
    expect(store.value()).toEqual(unrelated);

    const changed = dualLockValue(pendingLock);
    const destination = changed['1-1-2'] as Record<string, Record<string, Record<string, unknown>>>;
    destination.admin_uid.student_move_100_nonce.startedAt = 101;
    expect(releaseStudentMoveLocksValue(changed, pendingLock)).toBeUndefined();
  });
});

describe('studentMoveLock pending 복구', () => {
  it('서버 시간 오프셋이 유효할 때 pending 기준 시각을 보정한다', () => {
    expect(serverAdjustedStudentMoveTime(1_000, 250, true)).toBe(1_250);
    expect(serverAdjustedStudentMoveTime(1_000, 250, false)).toBeNull();
    expect(serverAdjustedStudentMoveTime(1_000, Number.NaN, true)).toBeNull();
    expect(serverAdjustedStudentMoveTime(1_000, null, true)).toBeNull();
  });

  it('pending은 정확히 10분 경계부터만 오래된 잠금으로 본다', () => {
    const pending = pendingStudentMoveLock(preparingLock, pendingStartedAt).record;
    expect(isStalePendingStudentMoveLock(
      pending,
      pending.startedAt + STUDENT_MOVE_PENDING_STALE_MS - 1,
    )).toBe(false);
    expect(isStalePendingStudentMoveLock(
      pending,
      pending.startedAt + STUDENT_MOVE_PENDING_STALE_MS,
    )).toBe(true);
    expect(isStalePendingStudentMoveLock(
      preparingLock.record,
      preparingLock.record.startedAt + STUDENT_MOVE_PENDING_STALE_MS * 2,
    )).toBe(false);
  });

  it('preparing과 10분 미만 pending은 증거를 읽거나 자동 정리하지 않는다', async () => {
    const readEvidence = vi.fn();
    const release = vi.fn();

    await expect(recoverStaleStudentMoveLock({
      currentValue: dualLockValue(preparingLock),
      requestedClassKeys: ['1-1-1', '1-1-2'],
      now: preparingLock.record.startedAt + STUDENT_MOVE_PENDING_STALE_MS * 2,
      readEvidence,
      release,
    })).resolves.toEqual({ status: 'blocked', reason: 'preparing' });

    const pendingLock = pendingStudentMoveLock(preparingLock, pendingStartedAt);
    await expect(recoverStaleStudentMoveLock({
      currentValue: dualLockValue(pendingLock),
      requestedClassKeys: ['1-1-1', '1-1-2'],
      now: pendingLock.record.startedAt + STUDENT_MOVE_PENDING_STALE_MS - 1,
      readEvidence,
      release,
    })).resolves.toEqual({ status: 'blocked', reason: 'pending' });
    expect(readEvidence).not.toHaveBeenCalled();
    expect(release).not.toHaveBeenCalled();
  });

  it('미반영이 정확히 확인된 오래된 pending만 정리해 한 번 재선점할 수 있게 한다', async () => {
    const pendingLock = pendingStudentMoveLock(preparingLock, pendingStartedAt);
    const release = vi.fn(async () => true);
    const result = await recoverStaleStudentMoveLock({
      currentValue: dualLockValue(pendingLock),
      requestedClassKeys: ['1-1-1', '1-1-2'],
      now: pendingLock.record.startedAt + STUDENT_MOVE_PENDING_STALE_MS,
      readEvidence: async () => ({
        commitMarkerState: 'absent',
        sourceStudentExists: true,
        destinationStudentExists: false,
      }),
      release,
    });

    expect(result).toEqual({ status: 'retry', lock: pendingLock });
    expect(release).toHaveBeenCalledOnce();
    expect(release).toHaveBeenCalledWith(pendingLock);
  });

  it('완료가 정확히 확인된 오래된 pending은 잠금만 정리하고 목적지를 반환한다', async () => {
    const pendingLock = pendingStudentMoveLock(preparingLock, pendingStartedAt);
    const result = await recoverStaleStudentMoveLock({
      currentValue: dualLockValue(pendingLock),
      requestedClassKeys: ['1-1-1', '1-1-2'],
      now: pendingLock.record.startedAt + STUDENT_MOVE_PENDING_STALE_MS,
      readEvidence: async () => ({
        commitMarkerState: 'committed',
        sourceStudentExists: false,
        destinationStudentExists: true,
      }),
      release: async () => true,
    });

    expect(result).toEqual({ status: 'completed', lock: pendingLock });
  });

  it('증거가 섞였거나 dual lock이 정확하지 않으면 자동 정리하지 않는다', async () => {
    const pendingLock = pendingStudentMoveLock(preparingLock, pendingStartedAt);
    const release = vi.fn(async () => true);
    await expect(recoverStaleStudentMoveLock({
      currentValue: dualLockValue(pendingLock),
      requestedClassKeys: ['1-1-1', '1-1-2'],
      now: pendingLock.record.startedAt + STUDENT_MOVE_PENDING_STALE_MS,
      readEvidence: async () => ({
        commitMarkerState: 'absent',
        sourceStudentExists: false,
        destinationStudentExists: true,
      }),
      release,
    })).resolves.toEqual({ status: 'manual' });
    expect(release).not.toHaveBeenCalled();

    await expect(recoverStaleStudentMoveLock({
      currentValue: dualLockValue(pendingLock),
      requestedClassKeys: ['1-1-1', '1-1-2'],
      now: pendingLock.record.startedAt + STUDENT_MOVE_PENDING_STALE_MS,
      readEvidence: async () => ({
        commitMarkerState: 'invalid',
        sourceStudentExists: true,
        destinationStudentExists: false,
      }),
      release,
    })).resolves.toEqual({ status: 'manual' });
    expect(release).not.toHaveBeenCalled();

    const incompleteDual = { '1-1-1': dualLockValue(pendingLock)['1-1-1'] };
    await expect(recoverStaleStudentMoveLock({
      currentValue: incompleteDual,
      requestedClassKeys: ['1-1-1', '1-1-2'],
      now: pendingLock.record.startedAt + STUDENT_MOVE_PENDING_STALE_MS,
      readEvidence: vi.fn(),
      release,
    })).resolves.toEqual({ status: 'manual' });
  });
});
