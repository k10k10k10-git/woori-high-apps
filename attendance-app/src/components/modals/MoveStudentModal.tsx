'use client';
import { useState } from 'react';
import { db, get, onDisconnect, ref, runTransaction } from '@/lib/db';
import { auth } from '@/lib/firebase/client';
import { useApp } from '@/store/AppContext';
import { showToast } from '@/utils/toast';
import { adminActor, adminChangePath, buildAdminChangeEntry } from '@/utils/adminChange';
import {
  buildStudentMovePayload,
  isValidStudentMoveDestination,
  type AttendanceRecord,
} from '@/utils/studentMove';
import {
  acquireStudentMoveLocks,
  confirmStudentMoveLockOwnership,
  createStudentMoveLockRecord,
  createStudentMoveOperationId,
  pendingStudentMoveLock,
  recoverStaleStudentMoveLock,
  releaseStudentMoveLocks,
  serverAdjustedStudentMoveTime,
  studentMoveCommitPath,
  studentMoveLockDisconnectPayload,
  studentMoveLockPaths,
  studentMoveLockYearPath,
  transitionStudentMoveLocksToPending,
  type StudentMoveLockIdentity,
  type StudentMoveLockTransaction,
} from '@/utils/studentMoveLock';
import { isStudentMoveCommitted, patchStudentMoveOnce } from '@/utils/studentMoveRequest';
import type { MoveTarget, Student } from '@/types';

export default function MoveStudentModal({ target, onClose }: { target: MoveTarget; onClose: () => void }) {
  const { state, dispatch } = useApp();
  const { classData, curYear } = state;
  const student = classData[target.fromCk]?.students.find(s => s.id === target.sid);

  const [toPart, setToPart]   = useState(target.fromCk.split('-')[0]);
  const [toGrade, setToGrade] = useState(target.fromCk.split('-')[1]);
  const [toClass, setToClass] = useState('');
  const [saving, setSaving] = useState(false);

  const toCk = toClass ? `${toPart}-${toGrade}-${toClass}` : '';
  const classLabel = (value: string) => {
    const [part, grade, classNumber] = value.split('-');
    return `${part}부 ${grade}학년 ${classNumber}반`;
  };

  const selectClass = (classKey: string) => {
    const [part, grade, classNumber] = classKey.split('-');
    dispatch({ type: 'SET_PART', payload: part });
    dispatch({ type: 'SET_GRADE', payload: grade });
    dispatch({ type: 'SET_CLASS', payload: classNumber });
  };

  async function handleMove() {
    if (!isValidStudentMoveDestination(Object.keys(classData), target.fromCk, toCk)) {
      showToast('현재 명단에 있는 다른 반을 선택하세요.');
      return;
    }
    if (!student) return;
    const currentUser = auth.currentUser;
    if (!currentUser) {
      showToast('로그인 사용자를 확인할 수 없습니다. 다시 로그인해 주세요.');
      return;
    }
    setSaving(true);

    const startedAt = Date.now();
    const operationId = createStudentMoveOperationId(startedAt);
    let lock: StudentMoveLockIdentity = {
      ownerUid: currentUser.uid,
      operationId,
      record: createStudentMoveLockRecord({
        startedAt,
        fromCk: target.fromCk,
        toCk,
        sid: target.sid,
      }),
    };
    const lockYearRef = ref(db, studentMoveLockYearPath(curYear));
    const lockPaths = studentMoveLockPaths(curYear, lock);
    const disconnectPayload = studentMoveLockDisconnectPayload(lock);
    const transactLock: StudentMoveLockTransaction = async (updateValue) => {
      const result = await runTransaction(lockYearRef, updateValue, { applyLocally: false });
      return { committed: result.committed, value: result.snapshot.val() };
    };
    let ownLockState: 'none' | 'owned' | 'unknown' = 'none';
    let pendingCleanupLock: StudentMoveLockIdentity | null = null;
    let preserveUncertainLock = false;
    let operationCompleted = false;
    let disconnectCleanup: ReturnType<typeof onDisconnect> | null = null;
    const readServerNow = async (): Promise<number | null> => {
      try {
        const [connectedSnap, offsetSnap] = await Promise.all([
          get(ref(db, '.info/connected')),
          get(ref(db, '.info/serverTimeOffset')),
        ]);
        return serverAdjustedStudentMoveTime(
          Date.now(),
          offsetSnap.val(),
          connectedSnap.val(),
        );
      } catch {
        return null;
      }
    };

    try {
      const recoveryNow = await readServerNow();
      if (recoveryNow === null) {
        showToast('서버 시간을 확인할 수 없어 학생 이동을 시작하지 않았습니다. 연결을 확인해 주세요.');
        return;
      }

      // 두 반의 자기 작업 leaf만 한 연결 종료 update로 지워 부분 잠금을 남기지 않는다.
      disconnectCleanup = onDisconnect(lockYearRef);
      await disconnectCleanup.update(disconnectPayload);

      ownLockState = 'unknown';
      let acquisition = await acquireStudentMoveLocks(lock, transactLock);
      ownLockState = acquisition.acquired ? 'owned' : 'none';
      if (!acquisition.acquired) {
        const recovery = await recoverStaleStudentMoveLock({
          currentValue: acquisition.currentValue,
          requestedClassKeys: [target.fromCk, toCk],
          now: recoveryNow,
          readEvidence: async (staleLock) => {
            const staleCommitPath = studentMoveCommitPath(curYear, staleLock);
            const [commitSnap, sourceSnap, destinationSnap] = await Promise.all([
              get(ref(db, staleCommitPath)),
              get(ref(db, `classes/${curYear}/${staleLock.record.fromCk}/students/${staleLock.record.sid}`)),
              get(ref(db, `classes/${curYear}/${staleLock.record.toCk}/students/${staleLock.record.sid}`)),
            ]);
            return {
              commitMarkerState: !commitSnap.exists()
                ? 'absent'
                : commitSnap.val() === true ? 'committed' : 'invalid',
              sourceStudentExists: sourceSnap.exists(),
              destinationStudentExists: destinationSnap.exists(),
            };
          },
          release: (staleLock) => releaseStudentMoveLocks(staleLock, transactLock),
        });

        if (recovery.status === 'completed') {
          selectClass(recovery.lock.record.toCk);
          showToast('이전 학생 이동이 완료된 것을 확인하고 남은 잠금을 정리했습니다.', 'success');
          operationCompleted = true;
        } else if (recovery.status === 'retry') {
          // 안전하게 중단된 pending을 정확히 지운 경우에만 한 번 다시 선점한다.
          ownLockState = 'unknown';
          acquisition = await acquireStudentMoveLocks(lock, transactLock);
          ownLockState = acquisition.acquired ? 'owned' : 'none';
          if (!acquisition.acquired) {
            showToast('잠금이 다시 사용 중입니다. 잠시 후 다시 시도해 주세요.');
            return;
          }
        } else if (recovery.status === 'manual') {
          showToast('이전 학생 이동 상태가 섞여 있어 자동 정리하지 않았습니다. 관리자에게 확인해 주세요.');
          return;
        } else {
          showToast(
            recovery.reason === 'changed'
              ? '학생 이동 잠금이 변경되었습니다. 잠시 후 다시 시도해 주세요.'
              : '관련 반에서 학생 이동이 진행 중입니다. 잠시 후 다시 시도해 주세요.',
          );
          return;
        }
      }

      if (!operationCompleted) {
        // 재연결 뒤 선점됐을 수 있으므로 현재 연결에 두 leaf 정리를 다시 등록한다.
        await disconnectCleanup.update(disconnectPayload);

        // 두 반을 잠근 뒤 최신값을 읽어 학생 수정·출석 입력·목적지 SID 생성을 함께 차단한다.
        const [sourceStudentSnap, destinationClassSnap, sourceAttendanceSnap, destinationAttendanceSnap] = await Promise.all([
          get(ref(db, `classes/${curYear}/${target.fromCk}/students/${target.sid}`)),
          get(ref(db, `classes/${curYear}/${toCk}`)),
          get(ref(db, `attendance/${curYear}/${target.fromCk}/${target.sid}`)),
          get(ref(db, `attendance/${curYear}/${toCk}/${target.sid}`)),
        ]);

        if (!sourceStudentSnap.exists()) {
          showToast('원래 반에서 학생을 찾을 수 없습니다. 명단을 새로 확인해 주세요.');
          return;
        }
        if (!destinationClassSnap.exists()) {
          showToast('이동할 반이 더 이상 존재하지 않습니다. 명단을 새로 확인해 주세요.');
          return;
        }
        if (destinationClassSnap.child(`students/${target.sid}`).exists()) {
          showToast('이동할 반에 같은 학생 ID가 있습니다. 목적지 명단을 먼저 확인해 주세요.');
          return;
        }

        const latestStudent = { ...(sourceStudentSnap.val() as Student), id: target.sid };
        const sourceAttendance = sourceAttendanceSnap.exists()
          ? sourceAttendanceSnap.val() as AttendanceRecord
          : undefined;
        const destinationAttendance = destinationAttendanceSnap.exists()
          ? destinationAttendanceSnap.val() as AttendanceRecord
          : undefined;
        const changePath = adminChangePath(curYear, toCk, operationId);
        const commitPath = studentMoveCommitPath(curYear, lock);
        const payload = buildStudentMovePayload({
          year: curYear,
          fromCk: target.fromCk,
          toCk,
          student: latestStudent,
          sourceAttendance,
          destinationAttendance,
          lockPaths,
          commitPath,
          adminChangePath: changePath,
          adminChange: buildAdminChangeEntry({
            classKey: toCk,
            teacher: classData[toCk]?.teacher,
            student: latestStudent,
            action: '반 이동',
            changeSummary: `${classLabel(target.fromCk)}에서 ${classLabel(toCk)}으로 이동`,
            actor: adminActor(state.userRole),
          }),
        });
        const idToken = await currentUser.getIdToken();

        const pendingStartedAt = await readServerNow();
        if (pendingStartedAt === null) {
          throw new Error('학생 이동에 필요한 서버 시간을 확인할 수 없습니다.');
        }
        pendingCleanupLock = pendingStudentMoveLock(lock, pendingStartedAt);
        const pendingLock = await transitionStudentMoveLocksToPending(
          lock,
          pendingStartedAt,
          transactLock,
        );
        if (!pendingLock) throw new Error('학생 이동 잠금 단계를 전환할 수 없습니다.');
        lock = pendingLock;

        // pending은 자동 복구 대상으로 남겨야 하므로 종료 예약 취소가 확인된 뒤에만 PATCH한다.
        await disconnectCleanup.cancel();
        disconnectCleanup = null;
        if (!await confirmStudentMoveLockOwnership(lock, transactLock)) {
          throw new Error('학생 이동 잠금 소유권을 확인할 수 없습니다.');
        }

        const patchResult = await patchStudentMoveOnce({
          databaseUrl: process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL,
          idToken,
          payload,
        });
        if (patchResult.status === 'rejected') {
          throw new Error('학생 이동 요청이 거절되었습니다.');
        }
        if (patchResult.status === 'unknown') {
          let committed = false;
          try {
            const [commitSnap, latestSourceSnap, latestDestinationSnap] = await Promise.all([
              get(ref(db, commitPath)),
              get(ref(db, `classes/${curYear}/${target.fromCk}/students/${target.sid}`)),
              get(ref(db, `classes/${curYear}/${toCk}/students/${target.sid}`)),
            ]);
            committed = isStudentMoveCommitted({
              commitMarkerIsTrue: commitSnap.val() === true,
              sourceStudentExists: latestSourceSnap.exists(),
              destinationStudentExists: latestDestinationSnap.exists(),
            });
          } catch {
            // 네트워크가 끊긴 경우 성공과 실패를 추측하지 않는다.
          }
          if (!committed) {
            preserveUncertainLock = true;
            showToast('이동 결과가 불명확해 두 반의 잠금을 유지했습니다. 새로고침 후 학생 상태를 확인해 주세요.');
            return;
          }
        }
        ownLockState = 'none';
        selectClass(toCk);
        operationCompleted = true;
      }
    } catch {
      showToast('학생 이동에 실패했습니다. 다시 시도해 주세요.');
      return; // 실패 시 모달 유지
    } finally {
      if (!preserveUncertainLock && (ownLockState === 'owned' || ownLockState === 'unknown')) {
        // 단계 응답이 불명확하면 두 phase를 각각 정확히 대조하고 자기 dual lock만 정리한다.
        let removed = await releaseStudentMoveLocks(lock, transactLock).catch(() => false);
        if (!removed && pendingCleanupLock) {
          removed = await releaseStudentMoveLocks(pendingCleanupLock, transactLock).catch(() => false);
        }
        if (removed && disconnectCleanup) {
          await disconnectCleanup.cancel().catch(() => {});
          disconnectCleanup = null;
        }
      } else if (!preserveUncertainLock && disconnectCleanup) {
        // 선점하지 못했거나 성공한 작업은 존재하지 않는 자기 leaf 예약만 취소한다.
        await disconnectCleanup.cancel().catch(() => {});
        disconnectCleanup = null;
      }
      setSaving(false);
    }
    if (operationCompleted) onClose();
  }

  return (
    <div className="modal-overlay center-modal" onClick={onClose} onKeyDown={e => { if (e.key === 'Escape') onClose(); }}
      role="dialog" aria-modal="true" aria-label="학생 이동">
      <div className="modal-dialog" onClick={e => e.stopPropagation()}>
        <div className="modal-title">학생 이동</div>
        <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 14 }}>
          <strong>{student?.name}</strong>을(를) 다른 반으로 이동합니다.
        </div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <select className="form-select" style={{ flex: 1 }} value={toPart} onChange={e => {
            setToPart(e.target.value);
            setToClass('');
          }}>
            <option value="1">1부</option>
            <option value="2">2부</option>
          </select>
          <select className="form-select" style={{ flex: 1 }} value={toGrade} onChange={e => {
            setToGrade(e.target.value);
            setToClass('');
          }}>
            {[1,2,3].map(g => <option key={g} value={String(g)}>{g}학년</option>)}
          </select>
          <select className="form-select" style={{ flex: 1 }} value={toClass} onChange={e => setToClass(e.target.value)}>
            <option value="">반 선택</option>
            {Object.keys(classData)
              .filter(ck => ck.startsWith(`${toPart}-${toGrade}-`) && ck !== target.fromCk)
              .sort()
              .map(ck => {
                const c = ck.split('-')[2];
                const t = classData[ck]?.teacher;
                return <option key={ck} value={c}>{c}반{t ? ` · ${t}` : ''}</option>;
              })}
          </select>
        </div>
        <div className="btn-row">
          <button className="btn-secondary" onClick={onClose} disabled={saving}>취소</button>
          <button className="btn-primary" onClick={handleMove} disabled={!toCk || saving}>
            {saving ? '이동 중...' : '이동'}
          </button>
        </div>
      </div>
    </div>
  );
}
