import type { AdminChangeEntry } from '@/utils/adminChange';
import type { AttValue, Student } from '@/types';

export type AttendanceRecord = Record<string, AttValue>;

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
}: StudentMovePayloadInput): Record<string, Student | AttendanceRecord | AdminChangeEntry | boolean | null> {
  if (fromCk === toCk) throw new Error('학생 이동의 원본 반과 목적지 반이 같습니다.');

  const payload: Record<string, Student | AttendanceRecord | AdminChangeEntry | boolean | null> = {
    [`classes/${year}/${fromCk}/students/${student.id}`]: null,
    [`classes/${year}/${toCk}/students/${student.id}`]: { ...student },
    [lockPaths[0]]: null,
    [lockPaths[1]]: null,
    [commitPath]: true,
    [adminChangePath]: adminChange,
  };

  if (sourceAttendance && Object.keys(sourceAttendance).length > 0) {
    payload[`attendance/${year}/${fromCk}/${student.id}`] = null;
    payload[`attendance/${year}/${toCk}/${student.id}`] = {
      ...sourceAttendance,
      ...(destinationAttendance ?? {}),
    };
  }

  return payload;
}
