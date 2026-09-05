import { describe, expect, it } from 'vitest';
import { buildAttendanceEntry } from '@/utils/attendanceEntry';
import { getSundaysForYear } from '@/utils/dates';
import type { UserRole } from '@/types';

const nowMs = Date.parse('2026-09-05T03:00:00.000Z');
const admin: UserRole = { role: 'admin' };
const teacher: UserRole = { role: 'teacher', part: '1', grade: '1', class: '1' };
const source = { curYear: 2026, months: getSundaysForYear(2026), events: {}, userRole: admin };

describe('대시보드에서 출석 날짜 전달', () => {
  it('관리자는 최근 4회보다 오래된 정상 주일을 출석 체크에서 선택한다', () => {
    const result = buildAttendanceEntry(source, { nowMs, queryWeekKey: '0-0' });
    expect(result.selectedWeek).toMatchObject({ key: '0-0', label: '1월 4일' });
    expect(result.editableWeeks).toHaveLength(52);
    expect(result.editableWeeks[0].dateValue).toBeGreaterThan(result.editableWeeks.at(-1)!.dateValue);
  });

  it('관리자 선택 범위는 기존 전체표처럼 미래 정상 주일도 포함한다', () => {
    const result = buildAttendanceEntry(source, { nowMs, queryWeekKey: '11-3' });
    expect(result.selectedWeek).toMatchObject({ key: '11-3', label: '12월 27일' });
  });

  it('관리자의 기본값은 목록 맨 위 미래 날짜가 아닌 최근 경과 주일이다', () => {
    const result = buildAttendanceEntry(source, { nowMs });
    expect(result.selectedWeek).toMatchObject({ key: '7-4', label: '8월 30일' });
  });

  it('교사의 오래된 주일·미래 주일 쿼리는 최근 4회 밖으로 편집 범위를 넓히지 않는다', () => {
    for (const queryWeekKey of ['0-0', '11-3']) {
      const result = buildAttendanceEntry({ ...source, userRole: teacher }, { nowMs, queryWeekKey });
      expect(result.editableWeeks.map((week) => week.key)).toEqual(['7-4', '7-3', '7-2', '7-1']);
      expect(result.selectedWeek?.key).toBe('7-4');
    }
  });

  it('데모 교사도 같은 최근 4회 제한을 지키고 유효한 쿼리는 적용한다', () => {
    const demoRole = { ...teacher, name: '담임 (데모)' };
    expect(buildAttendanceEntry({ ...source, userRole: demoRole }, { nowMs, queryWeekKey: '0-0' }).selectedWeek?.key).toBe('7-4');
    expect(buildAttendanceEntry({ ...source, userRole: demoRole }, { nowMs, queryWeekKey: '7-2' }).selectedWeek?.key).toBe('7-2');
  });

  it('역할이 확인되지 않았다고 관리자 전체 범위를 주지 않는다', () => {
    const result = buildAttendanceEntry({ ...source, userRole: null }, { nowMs, queryWeekKey: '0-0' });
    expect(result.editableWeeks).toHaveLength(4);
    expect(result.selectedWeek?.key).toBe('7-4');
  });

  it('행사와 잘못된 키는 정상 기본 주일로 되돌린다', () => {
    for (const queryWeekKey of ['0-0', '99-99', '0-0/../../attendance', '']) {
      const result = buildAttendanceEntry({ ...source, events: { '0-0': '행사' } }, { nowMs, queryWeekKey });
      expect(result.selectedWeek?.key).toBe('7-4');
      expect(result.editableWeeks.some((week) => week.key === '0-0')).toBe(false);
    }
  });

  it('사용자가 콤보에서 다시 선택하면 URL 날짜보다 우선한다', () => {
    const result = buildAttendanceEntry(source, { nowMs, queryWeekKey: '0-0', pickedWeekKey: '3-0' });
    expect(result.selectedWeek).toMatchObject({ key: '3-0', label: '4월 5일' });
  });

  it('수동 선택이 나중에 행사로 제외되면 유효한 URL 날짜 또는 기본값으로 복구한다', () => {
    const data = { ...source, events: { '3-0': '행사' } };
    expect(buildAttendanceEntry(data, { nowMs, queryWeekKey: '0-0', pickedWeekKey: '3-0' }).selectedWeek?.key).toBe('0-0');
    expect(buildAttendanceEntry(data, { nowMs, queryWeekKey: 'gone', pickedWeekKey: '3-0' }).selectedWeek?.key).toBe('7-4');
  });

  it('관리자 과거·미래 연도 기본값과 교사 미래 연도 빈 목록을 구분한다', () => {
    const past = { ...source, curYear: 2025, months: getSundaysForYear(2025) };
    const future = { ...source, curYear: 2027, months: getSundaysForYear(2027) };
    expect(buildAttendanceEntry(past, { nowMs }).selectedWeek?.label).toBe('12월 28일');
    expect(buildAttendanceEntry(future, { nowMs }).selectedWeek?.label).toBe('1월 3일');
    expect(buildAttendanceEntry({ ...future, userRole: teacher }, { nowMs, queryWeekKey: '0-0' })).toEqual({ editableWeeks: [], selectedWeek: null });
  });

  it('정상 주일이 없으면 URL이 있어도 선택하지 않는다', () => {
    const result = buildAttendanceEntry({ ...source, months: [{ month: 1, sundays: [4] }], events: { '0-0': '행사' } }, { nowMs, queryWeekKey: '0-0' });
    expect(result).toEqual({ editableWeeks: [], selectedWeek: null });
  });
});
