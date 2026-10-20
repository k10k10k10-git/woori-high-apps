'use client';
import { useEffect, useRef, useState } from 'react';
import { db, onDisconnect, onValue, push, ref } from '@/lib/db';
import { auth } from '@/lib/firebase/client';
import { useApp } from '@/store/AppContext';
import { useModalFocus } from '@/hooks/useModalFocus';
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
  studentMoveDestinationId,
  studentMoveOperationWithDestination,
  studentMoveLockDisconnectPayload,
  studentMoveLockPaths,
  studentMoveLockYearPath,
  transitionStudentMoveLocksToPending,
  type StudentMoveLockIdentity,
  type StudentMoveLockTransaction,
} from '@/utils/studentMoveLock';
import { isStudentMoveCommitted, patchStudentMoveOnce, readStudentMoveValue } from '@/utils/studentMoveRequest';
import { createStudentMoveLockTransaction } from '@/utils/studentMoveLockRequest';
import { awaitStudentMoveStep } from '@/utils/studentMoveStep';
import { mergeStudentEdit } from '@/utils/studentPersistence';
import type { MoveTarget, Student } from '@/types';

export default function MoveStudentModal({ target, onClose }: { target: MoveTarget; onClose: () => void }) {
  const { state, dispatch, getState } = useApp();
  const { classData, curYear } = state;
  const [opened] = useState(() => ({
    target: { ...target }, year: curYear, revision: state.dataRevision, user: auth.currentUser,
    student: structuredClone(classData[target.fromCk]?.students.find(s => s.id === target.sid)),
  }));
  const student = opened.student;

  const [toPart, setToPart]   = useState(target.fromCk.split('-')[0]);
  const [toGrade, setToGrade] = useState(target.fromCk.split('-')[1]);
  const [toClass, setToClass] = useState('');
  const [reviewing, setReviewing] = useState(false);
  const [saving, setSaving] = useState(false);
  const inFlight = useRef(false);
  const active = useRef(true);
  const operation = useRef<AbortController | null>(null);
  useEffect(() => {
    active.current = true;
    return () => { active.current = false; operation.current?.abort(); };
  }, []);
  const dialogRef = useRef<HTMLDivElement>(null);
  const close = () => { if (!inFlight.current) onClose(); };
  useModalFocus({ containerRef: dialogRef, onDismiss: close });

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
    if (inFlight.current) return;
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
    const isScreenCurrent = () => {
      const current = getState();
      return active.current && currentUser === opened.user && auth.currentUser === currentUser
        && current.curYear === opened.year && current.dataRevision === opened.revision
        && target.sid === opened.target.sid && target.fromCk === opened.target.fromCk
        && current.userRole?.role === 'admin';
    };
    if (!isScreenCurrent()) return;
    const visibleStudent = getState().classData[target.fromCk]?.students.find(s => s.id === target.sid);
    if (!visibleStudent || !mergeStudentEdit(visibleStudent, student, student)) {
      showToast('선택한 학생 정보가 변경되었습니다. 창을 닫고 명단에서 다시 선택해 주세요.');
      return;
    }
    const controller = new AbortController();
    operation.current = controller;
    const isCurrent = () => isScreenCurrent() && !controller.signal.aborted;
    const wait = <T,>(work: Promise<T>) => awaitStudentMoveStep(work, {
      signal: controller.signal, onTimeout: () => controller.abort(),
    });
    const startedAt = Date.now();
    // 화면 스냅샷은 ID 선택에만 사용한다. 쓰기 직전 두 반 잠금 안에서 다시 검사한다.
    const collision = classData[toCk]?.students.some(s => s.id === target.sid)
      || state.attData[toCk]?.[target.sid] != null;
    const destinationId = collision
      ? push(ref(db, `classes/${curYear}/${toCk}/students`)).key!
      : target.sid;
    if (collision && !student.personId) {
      showToast('영구 인물 ID가 없어 통합 사이트 연결을 보존할 수 없습니다. 관리자에게 확인해 주세요.');
      return;
    }
    let operationId: string;
    try {
      operationId = studentMoveOperationWithDestination(createStudentMoveOperationId(startedAt), destinationId);
    } catch {
      showToast('학생 내부 ID를 확인할 수 없어 이동을 시작하지 않았습니다. 관리자에게 확인해 주세요.');
      return;
    }
    inFlight.current = true;
    setSaving(true);
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
    let transactLock: StudentMoveLockTransaction;
    let cleanupTransact: StudentMoveLockTransaction;
    let ownLockState: 'none' | 'owned' | 'unknown' = 'none';
    let pendingCleanupLock: StudentMoveLockIdentity | null = null;
    let preserveUncertainLock = false;
    let operationCompleted = false;
    let disconnectCleanup: ReturnType<typeof onDisconnect> | null = null;
    // 늦은 취소가 새 이동 작업의 예약을 지우지 않도록 작업 leaf만 취소한다.
    const cancelDisconnect = () => Promise.all(lockPaths.map(path => onDisconnect(ref(db, path)).cancel()));
    const registerDisconnect = async () => {
      const registration = disconnectCleanup!.update(disconnectPayload);
      void registration.then(() => {
        if (!isCurrent()) void awaitStudentMoveStep(cancelDisconnect(), { timeoutMs: 5000 }).catch(() => {});
      }, () => {});
      await wait(registration);
      if (!isCurrent()) throw new Error('이동 화면이 변경되었습니다.');
    };
    // .info는 서버 GET 경로가 아니라 SDK의 로컬 연결 정보 구독이다.
    const readInfo = async (path: string): Promise<unknown> => {
      let unsubscribe: (() => void) | undefined;
      let timeout: ReturnType<typeof setTimeout> | undefined;
      try {
        return await new Promise((resolve, reject) => {
          timeout = setTimeout(() => reject(new Error('연결 정보 응답 없음')), 5000);
          unsubscribe = onValue(ref(db, path), snapshot => resolve(snapshot.val()), reject, { onlyOnce: true });
        });
      } finally {
        clearTimeout(timeout);
        unsubscribe?.();
      }
    };
    const readServerNow = async (): Promise<number | null> => {
      try {
        const [connected, offset] = await Promise.all([
          readInfo('.info/connected'),
          readInfo('.info/serverTimeOffset'),
        ]);
        return serverAdjustedStudentMoveTime(
          Date.now(),
          offset,
          connected,
        );
      } catch {
        return null;
      }
    };

    try {
      const idToken = await wait(currentUser.getIdToken());
      if (!isCurrent()) return;
      const transactionInput = { databaseUrl: process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL,
        idToken, path: studentMoveLockYearPath(curYear) };
      transactLock = createStudentMoveLockTransaction({ ...transactionInput, isCurrent });
      // 화면 해제 뒤에도 정확히 이 작업의 잠금만 정리할 수 있다. 새 잠금 선점에는 쓰지 않는다.
      cleanupTransact = createStudentMoveLockTransaction({ ...transactionInput,
        isCurrent: () => auth.currentUser === currentUser, timeoutMs: 5000 });
      const readValue = (path: string) => readStudentMoveValue({
        databaseUrl: process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL, idToken, path, isCurrent,
      });
      const recoveryNow = await readServerNow();
      if (!isCurrent()) return;
      if (recoveryNow === null) {
        showToast('서버 시간을 확인할 수 없어 학생 이동을 시작하지 않았습니다. 연결을 확인해 주세요.');
        return;
      }
      // 준비 잠금도 서버 보정 시각으로 기록해야 잘못된 기기 시계로 조기 만료되지 않는다.
      lock = { ...lock, record: { ...lock.record, startedAt: recoveryNow } };
      // 두 반의 자기 작업 leaf만 한 연결 종료 update로 지워 부분 잠금을 남기지 않는다.
      disconnectCleanup = onDisconnect(lockYearRef);
      await registerDisconnect();

      ownLockState = 'unknown';
      let acquisition = await acquireStudentMoveLocks(lock, transactLock);
      if (!isCurrent()) return;
      ownLockState = acquisition.acquired ? 'owned' : 'none';
      if (!acquisition.acquired) {
        const recovery = await recoverStaleStudentMoveLock({
          currentValue: acquisition.currentValue,
          requestedClassKeys: [target.fromCk, toCk],
          now: recoveryNow,
          readEvidence: async (staleLock) => {
            const staleCommitPath = studentMoveCommitPath(curYear, staleLock);
            const [commitValue, sourceValue, destinationValue] = await Promise.all([
              readValue(staleCommitPath),
              readValue(`classes/${curYear}/${staleLock.record.fromCk}/students/${staleLock.record.sid}`),
              readValue(`classes/${curYear}/${staleLock.record.toCk}/students/${studentMoveDestinationId(staleLock)}`),
            ]);
            return {
              commitMarkerState: commitValue == null
                ? 'absent'
                : commitValue === true ? 'committed' : 'invalid',
              sourceStudentExists: sourceValue != null,
              destinationStudentExists: destinationValue != null,
            };
          },
          release: (staleLock) => releaseStudentMoveLocks(staleLock, transactLock),
        });
        if (!isCurrent()) return;

        if (recovery.status === 'completed') {
          if (!isCurrent()) return;
          selectClass(recovery.lock.record.toCk);
          showToast('이전 학생 이동이 완료된 것을 확인하고 남은 잠금을 정리했습니다.', 'success');
          operationCompleted = true;
        } else if (recovery.status === 'retry') {
          // 안전하게 중단된 pending을 정확히 지운 경우에만 한 번 다시 선점한다.
          ownLockState = 'unknown';
          acquisition = await acquireStudentMoveLocks(lock, transactLock);
          if (!isCurrent()) return;
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
        await registerDisconnect();

        // 두 반을 잠근 뒤 최신값을 읽어 학생 수정·출석 입력·목적지 SID 생성을 함께 차단한다.
        const [sourceStudentValue, destinationClassValue, sourceAttendanceValue, destinationAttendanceValue] = await Promise.all([
          readValue(`classes/${curYear}/${target.fromCk}/students/${target.sid}`),
          readValue(`classes/${curYear}/${toCk}`),
          readValue(`attendance/${curYear}/${target.fromCk}/${target.sid}`),
          readValue(`attendance/${curYear}/${toCk}/${destinationId}`),
        ]);
        if (!isCurrent()) return;

        if (sourceStudentValue == null) {
          showToast('원래 반에서 학생을 찾을 수 없습니다. 명단을 새로 확인해 주세요.');
          return;
        }
        if (destinationClassValue == null) {
          showToast('이동할 반이 더 이상 존재하지 않습니다. 명단을 새로 확인해 주세요.');
          return;
        }
        const destinationStudents = (destinationClassValue as { students?: Record<string, Student> }).students ?? {};
        if (destinationStudents[destinationId] != null || destinationAttendanceValue != null) {
          showToast('이동할 반의 명단 또는 출석이 변경되었습니다. 기존 기록은 유지했습니다. 명단을 확인하고 다시 이동해 주세요.');
          return;
        }

        const latestStudent = { ...(sourceStudentValue as Student), id: target.sid };
        if (!mergeStudentEdit(latestStudent, student, student)) {
          showToast('원래 반의 학생 정보가 변경되었습니다. 명단을 새로 확인해 주세요.');
          return;
        }
        if (latestStudent.personId && Object.values(destinationStudents).some(s => s.personId === latestStudent.personId)) {
          showToast('같은 인물의 학생이 목적지에 이미 있습니다. 중복 명단을 먼저 확인해 주세요.');
          return;
        }
        const sourceAttendance = (sourceAttendanceValue ?? undefined) as AttendanceRecord | undefined;
        const destinationAttendance = (destinationAttendanceValue ?? undefined) as AttendanceRecord | undefined;
        const changePath = adminChangePath(curYear, toCk, operationId);
        const commitPath = studentMoveCommitPath(curYear, lock);
        const payload = buildStudentMovePayload({
          year: curYear,
          fromCk: target.fromCk,
          toCk,
          student: latestStudent,
          destinationId,
          destinationStudent: destinationStudents[destinationId],
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
        await wait(cancelDisconnect());
        disconnectCleanup = null;
        if (!await confirmStudentMoveLockOwnership(lock, transactLock)) {
          throw new Error('학생 이동 잠금 소유권을 확인할 수 없습니다.');
        }

        if (!isCurrent()) throw new Error('로그인 또는 조회 상태가 변경되었습니다.');

        // 전송 뒤 예외·화면 해제는 실패가 아니다. 명시 거절/성공 외에는 pending을 보존한다.
        preserveUncertainLock = true;
        const patchResult = await patchStudentMoveOnce({
          databaseUrl: process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL,
          idToken,
          payload,
        });
        if (patchResult.status === 'rejected') {
          preserveUncertainLock = false;
          throw new Error('학생 이동 요청이 거절되었습니다.');
        }
        if (patchResult.status === 'unknown') {
          let committed = false;
          try {
            const [commitValue, latestSourceValue, latestDestinationValue] = await Promise.all([
              readValue(commitPath),
              readValue(`classes/${curYear}/${target.fromCk}/students/${target.sid}`),
              readValue(`classes/${curYear}/${toCk}/students/${destinationId}`),
            ]);
            const latestDestination = latestDestinationValue as Student | null;
            committed = isStudentMoveCommitted({
              commitMarkerIsTrue: commitValue === true,
              sourceStudentExists: latestSourceValue != null,
              destinationStudentExists: latestDestination != null
                && latestDestination.personId === latestStudent.personId
                && latestDestination.name === latestStudent.name,
            });
          } catch {
            // 네트워크가 끊긴 경우 성공과 실패를 추측하지 않는다.
          }
          if (!committed) {
            preserveUncertainLock = true;
            if (isCurrent()) showToast('이동 결과가 불명확해 두 반의 잠금을 유지했습니다. 새로고침 후 학생 상태를 확인해 주세요.');
            return;
          }
        }
        ownLockState = 'none';
        preserveUncertainLock = false;
        if (!isCurrent()) return;
        selectClass(toCk);
        showToast('기존 명단을 보존하고 학생과 출석 기록을 함께 이동했습니다.', 'success');
        operationCompleted = true;
      }
    } catch {
      if (isScreenCurrent()) showToast('학생 이동을 완료하지 못했습니다. 연결을 확인한 뒤 창을 닫고 명단을 다시 확인해 주세요.');
      return; // 실패 시 모달 유지
    } finally {
      if (!preserveUncertainLock && (ownLockState === 'owned' || ownLockState === 'unknown')) {
        // 단계 응답이 불명확하면 두 phase를 각각 정확히 대조하고 자기 dual lock만 정리한다.
        const cleanup = async () => {
          let removed = await releaseStudentMoveLocks(lock, cleanupTransact).catch(() => false);
          if (!removed && pendingCleanupLock) {
            removed = await releaseStudentMoveLocks(pendingCleanupLock, cleanupTransact).catch(() => false);
          }
          // 해제 확인 전에는 연결 종료 예약을 남겨 서버의 자기 잠금을 정리한다.
          if (removed && disconnectCleanup) await cancelDisconnect();
        };
        await awaitStudentMoveStep(cleanup(), { timeoutMs: 5000 }).catch(() => {});
      } else if (!preserveUncertainLock && disconnectCleanup) {
        // 선점하지 못했거나 성공한 작업은 존재하지 않는 자기 leaf 예약만 취소한다.
        await awaitStudentMoveStep(cancelDisconnect(), { timeoutMs: 5000 }).catch(() => {});
        disconnectCleanup = null;
      }
      controller.abort();
      if (active.current) setSaving(false);
      inFlight.current = false;
      if (operation.current === controller) operation.current = null;
    }
    if (operationCompleted && isScreenCurrent()) onClose();
  }

  return (
    <div ref={dialogRef} tabIndex={-1} className="modal-overlay center-modal" onClick={close}
      role="dialog" aria-modal="true" aria-label="학생 이동" aria-busy={saving}>
      <div className="modal-dialog" onClick={e => e.stopPropagation()}>
        <div className="modal-title">학생 이동</div>
        <p className="move-intro"><strong>{student?.name}</strong> 학생의 현재 소속과 이동할 반을 확인해 주세요.</p>
        <div className="move-comparison" aria-label="학생 이동 전후">
          <div><span>현재 소속</span><strong>{classLabel(target.fromCk)}</strong><small>담임 {classData[target.fromCk]?.teacher || '미등록'} · {classData[target.fromCk]?.students.length ?? 0}명</small></div>
          <span aria-hidden="true">→</span>
          <div><span>이동할 소속</span><strong>{toCk ? classLabel(toCk) : '반을 선택하세요'}</strong><small>{toCk ? `담임 ${classData[toCk]?.teacher || '미등록'} · ${classData[toCk]?.students.length ?? 0}명` : '등록된 반만 선택할 수 있습니다.'}</small></div>
        </div>
        <div className="move-selects">
          <select aria-label="이동할 부서" disabled={saving || reviewing} className="form-select" style={{ flex: 1 }} value={toPart} onChange={e => {
            setToPart(e.target.value);
            setToClass('');
            setReviewing(false);
          }}>
            <option value="1">1부</option>
            <option value="2">2부</option>
          </select>
          <select aria-label="이동할 학년" disabled={saving || reviewing} className="form-select" style={{ flex: 1 }} value={toGrade} onChange={e => {
            setToGrade(e.target.value);
            setToClass('');
            setReviewing(false);
          }}>
            {[1,2,3].map(g => <option key={g} value={String(g)}>{g}학년</option>)}
          </select>
          <select aria-label="이동할 반" disabled={saving || reviewing} className="form-select" style={{ flex: 1 }} value={toClass} onChange={e => { setToClass(e.target.value); setReviewing(false); }}>
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
        {reviewing && <div className="move-review" role="status">
          <strong>이동 전 마지막으로 확인해 주세요.</strong>
          <p>{classLabel(target.fromCk)}에서 {classLabel(toCk)}으로 이동합니다.</p>
          <ul><li>학생 기본 정보를 유지합니다.</li><li>기존 출석 기록을 함께 이동합니다.</li><li>목적지의 기존 명단은 덮어쓰지 않습니다.</li></ul>
        </div>}
        <div className="btn-row">
          <button className="btn-secondary" onClick={() => reviewing ? setReviewing(false) : close()} disabled={saving}>{reviewing ? '이전' : '취소'}</button>
          {!reviewing ? <button className="btn-primary" onClick={() => setReviewing(true)} disabled={!toCk || saving}>이동 내용 확인</button>
            : <button className="btn-primary" onClick={handleMove} disabled={!toCk || saving}>{saving ? '이동 중...' : '이동 확정'}</button>}
        </div>
      </div>
    </div>
  );
}
