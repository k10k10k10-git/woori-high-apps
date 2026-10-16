import { describe, expect, it } from 'vitest';
import { attendanceEventDate } from '@/utils/attendanceEventDate';

describe('출석 제외 일정 날짜', () => {
  it('달력 날짜와 주일 여부를 검증하고 기존 DB 월·일 문자열을 반환한다', () => {
    expect(attendanceEventDate('2026-08-16', 2026)).toEqual({ month: '8', day: '16', sunday: true });
    expect(attendanceEventDate('2024-02-29', 2024)).toEqual({ month: '2', day: '29', sunday: false });
    expect(attendanceEventDate('2026-08-15', 2026)).toEqual({ month: '8', day: '15', sunday: false });
    for (const value of ['', '2026-2-01', '2026-02-29', '2026-04-31', '2026-00-01', '2026-12-32', '2026-08-16T00:00:00Z', ' 2026-08-16', '2025-08-17']) {
      expect(attendanceEventDate(value, 2026), value).toBeNull();
    }
  });
});
