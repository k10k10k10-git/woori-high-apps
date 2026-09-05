import { describe, expect, it } from 'vitest';
import {
  ATTENDANCE_OPTIONS,
  normalizeAttendanceData,
  normalizeAttendanceRecord,
  normalizeAttendanceValue,
} from '@/utils/attendanceValue';

describe('출석 값 정규화', () => {
  it('신규 입력 선택지는 출석과 결석만 제공한다', () => {
    expect(ATTENDANCE_OPTIONS).toEqual(['O', 'X']);
  });

  it('출석·결석만 유지하고 이전 지각은 출석으로 바꾼다', () => {
    expect(normalizeAttendanceValue('O')).toBe('O');
    expect(normalizeAttendanceValue('X')).toBe('X');
    expect(normalizeAttendanceValue('T')).toBe('O');
    expect(normalizeAttendanceValue('')).toBe('');
    expect(normalizeAttendanceValue('unknown')).toBe('');
  });

  it('레코드에서 이전 지각을 바꾸고 저장되지 않는 빈값·잘못된 값은 제외한다', () => {
    expect(normalizeAttendanceRecord({ '0-0': 'O', '0-1': 'T', '0-2': 'X', '0-3': '', bad: 1 })).toEqual({
      '0-0': 'O',
      '0-1': 'O',
      '0-2': 'X',
    });
  });

  it('연도 스냅샷의 반·학생 키를 유지하면서 모든 셀을 정규화한다', () => {
    expect(normalizeAttendanceData({
      '1-1-1': {
        studentA: { '0-0': 'T', '0-1': 'X' },
        studentB: { '0-0': 'O' },
      },
    })).toEqual({
      '1-1-1': {
        studentA: { '0-0': 'O', '0-1': 'X' },
        studentB: { '0-0': 'O' },
      },
    });
  });
});
