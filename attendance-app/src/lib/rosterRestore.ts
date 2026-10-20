import { db, onValue, ref } from '@/lib/db';
import { auth } from '@/lib/firebase/client';
import { buildAdminChangeEntry } from '@/utils/adminChange';
import { sameStoredValue } from '@/utils/studentPersistence';
import { createStudentMoveLockTransaction } from '@/utils/studentMoveLockRequest';
import { patchStudentMoveOnce, readStudentMoveValue } from '@/utils/studentMoveRequest';
import { awaitStudentMoveStep } from '@/utils/studentMoveStep';
import {
  acquireStudentMoveLocks, confirmStudentMoveLockOwnership, findStudentMoveLockConflict,
  releaseStudentMoveLocks, serverAdjustedStudentMoveTime, studentMoveCommitPath,
  studentMoveLockPaths, studentMoveLockYearPath, STUDENT_MOVE_PENDING_STALE_MS,
  type StudentMoveLockIdentity,
} from '@/utils/studentMoveLock';
import type { Student } from '@/types';

// 실제 반이 아닌 복원 전용 잠금 키다. 학생 이동의 기존 잠금/불변 완료 표식 계약을 재사용한다.
// ponytail: 복원·사본 삭제만 연도별 직렬화한다. 처리량이 문제될 때만 인물별 잠금으로 세분화한다.
const RESTORE_LOCK = '__roster_restore__';
type Copy = Record<string, unknown> & { ck: string; deletedAt: number };
export type RosterRestoreInput = {
  year: number; kind: 'students' | 'classes'; key: string; value: unknown; actor: string;
};
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const validKey = (value: unknown): value is string => typeof value === 'string' && !!value && !/[.#$\[\]/\u0000-\u001f\u007f]/.test(value);

async function serverNow() {
  const info = async (path: string) => {
    let off: (() => void) | undefined;
    try {
      return await awaitStudentMoveStep(new Promise<unknown>((resolve, reject) => {
        off = onValue(ref(db, path), snap => resolve(snap.val()), reject, { onlyOnce: true });
      }), { timeoutMs: 5000 });
    } finally { off?.(); }
  };
  const [connected, offset] = await Promise.all([info('.info/connected'), info('.info/serverTimeOffset')]);
  const now = serverAdjustedStudentMoveTime(Date.now(), offset, connected);
  if (now === null) throw new Error('서버 시간을 확인하지 못했습니다. 연결을 확인하고 다시 시도해 주세요.');
  return now;
}

function restoredValue(input: RosterRestoreInput, permanentDelete: boolean): { copy: Copy; students: Student[]; value: Record<string, unknown> } {
  const copy = input.value;
  if (!Number.isInteger(input.year) || !['students', 'classes'].includes(input.kind) || !validKey(input.key) || !object(copy)
    || typeof copy.ck !== 'string' || !/^[12]-[1-3]-[1-9]\d*$/.test(copy.ck)
    || typeof copy.deletedAt !== 'number' || !Number.isFinite(copy.deletedAt)) {
    throw new Error('삭제본 정보를 확인할 수 없습니다. 목록을 다시 불러와 주세요.');
  }
  const value = { ...copy };
  delete value.ck; delete value.deletedAt;
  if (permanentDelete) return { copy: copy as Copy, value, students: [] };
  if (input.kind === 'classes' && copy.students != null && !object(copy.students)) throw new Error('반 삭제본의 학생 정보를 확인해 주세요.');
  const students = input.kind === 'students' ? [value] : Object.entries(object(copy.students) ? copy.students : {}).map(([id, student]) => {
    if (!object(student)) throw new Error('반 삭제본의 학생 정보를 확인해 주세요.');
    return { ...student, id };
  });
  if (students.some(student => !validKey(student.id) || typeof student.name !== 'string' || !student.name.trim()
    || (student.personId != null && typeof student.personId !== 'string'))) {
    throw new Error('삭제본의 학생 정보를 확인해 주세요.');
  }
  return { copy: copy as Copy, value, students: students as Student[] };
}

function rejectDuplicateStudents(students: Student[], yearValue: Record<string, unknown>) {
  const existing = Object.values(yearValue).flatMap(value => object(value) && object(value.students) ? Object.values(value.students).filter(object) : []);
  const seen = new Set<string>();
  for (const student of students) {
    if (student.personId) {
      if (seen.has(student.personId) || existing.some(value => value.personId === student.personId)) {
        throw new Error('같은 학생이 현재 명단에 이미 있습니다. 다른 반으로 이동했는지 확인해 주세요.');
      }
      seen.add(student.personId);
    } else if (existing.some(value => typeof value.name === 'string' && value.name.trim() === student.name.trim())) {
      throw new Error('영구 인물 ID가 없는 동명 학생이 현재 명단에 있습니다. 동일인 여부를 먼저 확인해 주세요.');
    }
  }
}

/** 복원과 사본 소비를 한 원자 요청으로 확정한다. 출석 원장은 읽거나 쓰지 않는다. */
export function restoreRoster(input: RosterRestoreInput, isCurrent: () => boolean): Promise<void> {
  return applyRosterCopy(input, isCurrent, false);
}

export function permanentDeleteRosterCopy(input: RosterRestoreInput, isCurrent: () => boolean): Promise<void> {
  return applyRosterCopy(input, isCurrent, true);
}

async function applyRosterCopy(input: RosterRestoreInput, isCurrent: () => boolean, permanentDelete: boolean) {
  const { copy, value, students } = restoredValue(input, permanentDelete);
  const user = auth.currentUser;
  if (!user || !isCurrent()) throw new Error('로그인 또는 조회 상태가 변경되었습니다. 목록을 다시 열어 주세요.');
  const current = () => auth.currentUser === user && isCurrent();
  const idToken = await awaitStudentMoveStep(user.getIdToken());
  if (!current()) throw new Error('로그인 또는 조회 상태가 변경되었습니다.');
  const connection = { databaseUrl: process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL, idToken };
  const read = (path: string) => readStudentMoveValue({ ...connection, path, isCurrent: current });
  const transaction = createStudentMoveLockTransaction({ ...connection, path: studentMoveLockYearPath(input.year), isCurrent: current });
  const cleanup = createStudentMoveLockTransaction({ ...connection, path: studentMoveLockYearPath(input.year),
    isCurrent: () => auth.currentUser === user, timeoutMs: 5000 });
  const now = await serverNow();
  const operationId = `roster_${permanentDelete ? 'delete' : 'restore'}_${crypto.randomUUID()}`;
  const lock: StudentMoveLockIdentity = { ownerUid: user.uid, operationId,
    record: { fromCk: RESTORE_LOCK, toCk: copy.ck, sid: permanentDelete ? '__delete__' : input.kind === 'students' ? students[0].id : '__class__', phase: 'pending', startedAt: now } };
  const commitPath = studentMoveCommitPath(input.year, lock);
  const copyPath = `trash/${input.year}/${input.kind}/${input.key}`;
  let ownedOrUnknown = false, preserve = false;
  try {
    ownedOrUnknown = true;
    let acquired = await acquireStudentMoveLocks(lock, transaction);
    if (!acquired.acquired) {
      ownedOrUnknown = false;
      const conflict = findStudentMoveLockConflict(acquired.currentValue, [RESTORE_LOCK, copy.ck]);
      if (conflict.status !== 'found' || conflict.lock.record.fromCk !== RESTORE_LOCK
        || !/^roster_(restore|delete)_/.test(conflict.lock.operationId)
        || now - conflict.lock.record.startedAt < STUDENT_MOVE_PENDING_STALE_MS) {
        throw new Error('관련 반 또는 삭제 목록에서 다른 작업이 진행 중입니다. 잠시 후 다시 시도해 주세요.');
      }
      const marker = await read(studentMoveCommitPath(input.year, conflict.lock));
      if ((marker !== null && marker !== true) || !await releaseStudentMoveLocks(conflict.lock, transaction)) {
        throw new Error('이전 복원 상태를 확인하지 못했습니다. 목록을 다시 불러와 주세요.');
      }
      ownedOrUnknown = true;
      acquired = await acquireStudentMoveLocks(lock, transaction);
      if (!acquired.acquired) { ownedOrUnknown = false; throw new Error('삭제 목록이 다시 사용 중입니다. 잠시 후 다시 시도해 주세요.'); }
    }
    const latestCopy = await read(copyPath);
    if (!sameStoredValue(latestCopy, copy)) throw new Error('삭제본이 이미 처리되었거나 변경되었습니다. 목록을 다시 불러와 주세요.');
    const payload: Record<string, unknown> = { [copyPath]: null, [commitPath]: true,
      ...Object.fromEntries(studentMoveLockPaths(input.year, lock).map(path => [path, null])) };
    if (!permanentDelete) {
      const yearValue = await read(`classes/${input.year}`);
      if (yearValue !== null && !object(yearValue)) throw new Error('현재 명단을 확인할 수 없어 복원하지 않았습니다.');
      const yearClasses = (yearValue ?? {}) as Record<string, unknown>;
      rejectDuplicateStudents(students, yearClasses);
      const target = yearClasses[copy.ck];
      const change = buildAdminChangeEntry({ classKey: copy.ck, teacher: typeof value.teacher === 'string' ? value.teacher : object(target) && typeof target.teacher === 'string' ? target.teacher : undefined,
        ...(input.kind === 'students' ? { student: students[0] } : { studentName: `반 전체 (${students.length}명)` }),
        action: '학생 복원', changeSummary: '최근 삭제 목록에서 명단 복원 · 출석 기록 유지', actor: input.actor });
      const classPath = `classes/${input.year}/${copy.ck}`;
      if (input.kind === 'students') {
        if (!object(target) || (target.students != null && !object(target.students))
          || (object(target.students) && target.students[students[0].id] != null)) {
          throw new Error('반이 없거나 같은 학생 ID가 이미 존재합니다. 현재 명단을 확인해 주세요.');
        }
        payload[`${classPath}/students/${students[0].id}`] = value;
        payload[`${classPath}/adminChanges/${operationId}`] = change;
      } else {
        if (target != null) throw new Error('같은 반이 이미 존재합니다. 현재 명단을 보호하기 위해 복원을 중단했습니다.');
        payload[classPath] = { ...value, students: Object.fromEntries(students.map(student => [student.id, student])),
          adminChanges: { ...(object(value.adminChanges) ? value.adminChanges : {}), [operationId]: change } };
      }
    }
    if (!await confirmStudentMoveLockOwnership(lock, transaction) || !current()) throw new Error('복원 잠금 또는 조회 상태가 변경되었습니다.');
    preserve = true; // 전송 후 결과 불명은 실패가 아니다. 만료 복구가 늦은 요청을 fencing한다.
    const result = await patchStudentMoveOnce({ ...connection, payload });
    if (result.status === 'rejected') { preserve = false; throw new Error('서버가 요청을 거절했습니다. 현재 명단과 권한을 확인해 주세요.'); }
    if (result.status === 'unknown') {
      let marker: unknown;
      try { marker = await read(commitPath); } catch { /* 증거 조회 실패는 pending 보존 */ }
      if (marker !== true) throw new Error('처리 결과를 확인하지 못해 잠금을 보존했습니다. 재적용하지 말고 목록을 다시 확인해 주세요.');
    }
    ownedOrUnknown = false; preserve = false;
  } finally {
    if (ownedOrUnknown && !preserve) {
      await awaitStudentMoveStep(releaseStudentMoveLocks(lock, cleanup), { timeoutMs: 5000 }).catch(() => {});
    }
  }
}
