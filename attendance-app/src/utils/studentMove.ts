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
 * 목적지에 같은 출석 셀이 이미 있으면 목적지 값을 유지한다. 출석 구독 스냅샷이 없는
 * 상태에서 원본 경로를 추측해 지우지 않도록, 실제 원본 출석이 전달된 경우에만 이관한다.
 */
export function buildStudentMovePayload({
  year,
  fromCk,
  toCk,
  student,
  sourceAttendance,
  destinationAttendance,
  lockPaths,
  commitPath,
  adminChangePath,
  adminChange,
}: StudentMovePayloadInput): Record<string, Student | NormalizedAttendanceRecord | AdminChangeEntry | boolean | null> {
  if (fromCk === toCk) throw new Error('학생 이동의 원본 반과 목적지 반이 같습니다.');

  const payload: Record<string, Student | NormalizedAttendanceRecord | AdminChangeEntry | boolean | null> = {
    [`classes/${year}/${fromCk}/students/${student.id}`]: null,
    [`classes/${year}/${toCk}/students/${student.id}`]: { ...student },
    [lockPaths[0]]: null,
    [lockPaths[1]]: null,
    [commitPath]: true,
    [adminChangePath]: adminChange,
  };

  const normalizedSource = normalizeMoveRecord(sourceAttendance);
  const normalizedDestination = normalizeMoveRecord(destinationAttendance);
  if (Object.keys(normalizedSource).length > 0) {
    payload[`attendance/${year}/${fromCk}/${student.id}`] = null;
    payload[`attendance/${year}/${toCk}/${student.id}`] = {
      ...normalizedSource,
      ...normalizedDestination,
    };
  }

  return payload;
}
