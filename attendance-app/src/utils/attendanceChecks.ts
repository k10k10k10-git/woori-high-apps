import type { AttValue, MonthEntry, Student } from '@/types';

// 이전 주일의 미입력을 소급해 결석으로 바꾸지 않는다.
export const ONE_TAP_START_DATE = '2026-10-25';
export type AttendanceCheck = {
  revision: number; startedAt: number; updatedAt: number; updatedBy: string; operationId: string;
  allAbsent: boolean; targetSid: string; targetToken: string; expected: AttValue; value: AttValue; roster: Record<string, string>;
};
export type AttendanceChecks = Record<string, Record<string, AttendanceCheck>>;
export const attendanceStudentToken = (student: Pick<Student, 'name' | 'birth' | 'personId'>) => student.personId || `legacy:${student.name}|${student.birth ?? ''}`;
export const attendanceChecksPath = (year: number, ck?: string, key?: string) => ['attendanceChecks', year, ck, key].filter(value => value !== undefined).join('/');

export function attendanceWeekDate(year: number, months: MonthEntry[], key: string): string | null {
  if (!/^(?:[0-9]|1[01])-[0-4]$/.test(key)) return null;
  const [mi, di] = key.split('-').map(Number);
  const month = months[mi]?.month, day = months[mi]?.sundays[di];
  return month && day ? `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}` : null;
}

export function usesOneTap(year: number, months: MonthEntry[], key: string | null): boolean {
  const date = key ? attendanceWeekDate(year, months, key) : null;
  return !!date && date >= ONE_TAP_START_DATE;
}

export function attendanceCheckFor(source: { attendanceChecks?: AttendanceChecks }, ck: string, key: string | null) {
  return key ? source.attendanceChecks?.[ck]?.[key] : undefined;
}

export function normalizeAttendanceChecks(value: unknown): AttendanceChecks {
  if (value == null) return {};
  if (typeof value !== 'object' || Array.isArray(value)) throw new Error('반별 체크 상태를 확인해 주세요.');
  const result: AttendanceChecks = {};
  for (const [ck, weeks] of Object.entries(value)) {
    if (!weeks || typeof weeks !== 'object' || Array.isArray(weeks)) throw new Error('반별 체크 상태를 확인해 주세요.');
    result[ck] = {};
    for (const [key, record] of Object.entries(weeks)) {
      const check = record as AttendanceCheck | null;
      if (!check || !Number.isInteger(check.revision) || check.revision < 1 || !Number.isFinite(check.startedAt)
        || !Number.isFinite(check.updatedAt) || typeof check.allAbsent !== 'boolean' || typeof check.operationId !== 'string'
        || typeof check.targetToken !== 'string' || typeof check.updatedBy !== 'string' || typeof check.targetSid !== 'string'
        || !['', 'O', 'X'].includes(check.expected) || !['', 'O', 'X'].includes(check.value)
        || !check.roster || typeof check.roster !== 'object' || Array.isArray(check.roster)
        || !Object.values(check.roster).every(token => typeof token === 'string')) throw new Error('출석 체크 상태를 확인하지 못했습니다. 다시 불러와 주세요.');
      result[ck][key] = check;
    }
  }
  return result;
}
