import type { AttData, AttValue } from '@/types';

export const ATTENDANCE_OPTIONS = ['O', 'X'] as const satisfies readonly AttValue[];

/** 저장소의 이전 지각 값(T)은 출석(O)으로 읽고, 신규 값은 O/X만 허용한다. */
export function normalizeAttendanceValue(value: unknown): AttValue {
  if (value === 'O' || value === 'T') return 'O';
  if (value === 'X') return 'X';
  return '';
}

export function normalizeAttendanceRecord(value: unknown): Record<string, AttValue> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .map(([cellKey, mark]) => [cellKey, normalizeAttendanceValue(mark)] as const)
      .filter(([, mark]) => mark !== ''),
  );
}

/** Firebase의 연도 출석 스냅샷을 화면에서 사용하는 O/X 전용 형태로 정규화한다. */
export function normalizeAttendanceData(value: unknown): AttData {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const normalized: AttData = {};
  for (const [classKey, students] of Object.entries(value as Record<string, unknown>)) {
    if (!students || typeof students !== 'object' || Array.isArray(students)) continue;
    normalized[classKey] = {};
    for (const [studentId, record] of Object.entries(students as Record<string, unknown>)) {
      normalized[classKey][studentId] = normalizeAttendanceRecord(record);
    }
  }
  return normalized;
}
