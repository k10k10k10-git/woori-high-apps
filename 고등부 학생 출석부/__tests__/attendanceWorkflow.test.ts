import { describe, expect, it } from 'vitest';
import {
  activeAndLongAbsentStudents,
  consecutiveAbsentStudentIds,
  recentEditableWeeks,
  unenteredStudentIds,
} from '@/utils/attendanceWorkflow';
import type { AttData, MonthEntry, Student } from '@/types';

const months: MonthEntry[] = [
  { month: 8, sundays: [2, 9, 16, 23, 30] },
  { month: 9, sundays: [6] },
];

const students: Student[] = [
  { id: 'a', name: '활동학생' },
  { id: 'b', name: '장결학생', jang: true },
  { id: 'c', name: '미입력학생' },
];

describe('출석 현장 업무 파생', () => {
  it('오늘까지의 정상 주일만 최신순으로 네 개 고른다', () => {
    const result = recentEditableWeeks(
      2026,
      months,
      { '0-3': '여름 휴가' },
      Date.parse('2026-08-25T03:00:00.000Z'),
    );

    expect(result.map((week) => week.key)).toEqual(['0-2', '0-1', '0-0']);
    expect(result.map((week) => week.label)).toEqual(['8월 16일', '8월 9일', '8월 2일']);
  });

  it('장결자를 일상 출석 대상에서 분리한다', () => {
    const result = activeAndLongAbsentStudents(students);
    expect(result.active.map((student) => student.id)).toEqual(['a', 'c']);
    expect(result.longAbsent.map((student) => student.id)).toEqual(['b']);
  });

  it('미입력과 최근 연속 결석을 활동 학생 안에서 찾는다', () => {
    const attendance: AttData[string] = {
      a: { '0-2': 'X', '0-1': 'X', '0-0': 'X' },
      c: { '0-2': '', '0-1': 'O', '0-0': 'X' },
    };

    expect(unenteredStudentIds(students.filter((student) => !student.jang), attendance, '0-2')).toEqual(['c']);
    expect(consecutiveAbsentStudentIds(students.filter((student) => !student.jang), attendance, ['0-2', '0-1', '0-0'])).toEqual(['a']);
  });
});
