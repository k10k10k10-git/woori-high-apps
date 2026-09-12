import type { AdminChangeEntry } from '@/utils/adminChange';
import type { AttValue, Student } from '@/types';
import { normalizeAttendanceRecord } from '@/utils/attendanceValue';

/** Firebase에서 직접 읽은 이전 T 값까지 받을 수 있는 원시 출석 레코드다. */
export type AttendanceRecord = Record<string, unknown>;
type NormalizedAttendanceRecord = Record<string, AttValue>;

function normalizeMoveRecord(value: AttendanceRecord | undefined): NormalizedAttendanceRecord {
  if (!value || Array.isArray(value)) return {};
  const normalized: NormalizedAttendanceRecord = {};
  for (const [cellKey, mark] of Object.entries(value)) {
    if (mark === '') normalized[cellKey] = '';
    else {
      const next = normalizeAttendanceRecord({ [cellKey]: mark });
      if (cellKey in next) normalized[cellKey] = next[cellKey];
    }
  }
  return normalized;
}

export function isValidStudentMoveDestination(
  classKeys: readonly string[],
  fromCk: string,
  toCk: string,
): boolean {
  return toCk !== '' && toCk !== fromCk && classKeys.includes(toCk);
}

type StudentMovePayloadInput = {
  year: number;
  fromCk: string;
  toCk: string;
  student: Student;
  destinationId?: string;
  destinationStudent?: unknown;
  sourceAttendance?: AttendanceRecord;
  destinationAttendance?: AttendanceRecord;
  lockPaths: readonly [string, string];
  commitPath: string;
  adminChangePath: string;
  adminChange: AdminChangeEntry;
};

/**
 * 학생과 출석을 같은 루트 update로 옮긴다.
 *
 * 목적지 명단 또는 출석이 있으면 다른 학생의 기록일 수 있으므로 병합하지 않는다.
 * 잠금 안에서 확인한 빈 ID로만 이동하고 원본 출석이 있는 경우에만 이관한다.
 */
export function buildStudentMovePayload({
  year,
  fromCk,
  toCk,
  student,
  destinationId = student.id,
  destinationStudent,
  sourceAttendance,
  destinationAttendance,
  lockPaths,
  commitPath,
  adminChangePath,
  adminChange,
}: StudentMovePayloadInput): Record<string, Student | NormalizedAttendanceRecord | AdminChangeEntry | boolean | null> {
  if (fromCk === toCk) throw new Error('학생 이동의 원본 반과 목적지 반이 같습니다.');
  if (!destinationId || /[.#$\[\]/\u0000-\u001f\u007f]/.test(destinationId)) throw new Error('목적지 학생 ID가 올바르지 않습니다.');
  if (destinationStudent != null || destinationAttendance != null) {
    throw new Error('목적지의 기존 학생 또는 출석을 덮어쓸 수 없습니다.');
  }

  const payload: Record<string, Student | NormalizedAttendanceRecord | AdminChangeEntry | boolean | null> = {
    [`classes/${year}/${fromCk}/students/${student.id}`]: null,
    [`classes/${year}/${toCk}/students/${destinationId}`]: { ...student, id: destinationId },
    [lockPaths[0]]: null,
    [lockPaths[1]]: null,
    [commitPath]: true,
    [adminChangePath]: { ...adminChange, studentId: destinationId },
  };

  const normalizedSource = normalizeMoveRecord(sourceAttendance);
  if (Object.keys(normalizedSource).length > 0) {
    payload[`attendance/${year}/${fromCk}/${student.id}`] = null;
    payload[`attendance/${year}/${toCk}/${destinationId}`] = normalizedSource;
  }

  return payload;
}
