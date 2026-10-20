import { describe, expect, it } from 'vitest';
import { buildAdminDashboard, type AdminDashboardSource } from '@/utils/adminDashboard';
import { getSundaysForYear } from '@/utils/dates';
import type { AttendanceCheck } from '@/utils/attendanceChecks';

const nowMs = Date.parse('2026-09-05T03:00:00.000Z');

function source(overrides: Partial<AdminDashboardSource> = {}): AdminDashboardSource {
  return { curYear: 2026, classData: {}, attData: {}, months: getSundaysForYear(2026), events: {}, ...overrides };
}

function mixedSource(): AdminDashboardSource {
  return source({
    classData: {
      '1-1-1': {
        teacher: '홍교사',
        students: [
          { id: 'o', name: '출석학생' },
          { id: 'x', name: '결석학생' },
          { id: 't', name: '이전지각학생' },
          { id: 'blank', name: '미입력학생' },
          { id: 'missing', name: '장결학생', jang: true },
        ],
      },
    },
    attData: ({
      '1-1-1': {
        o: { '7-4': 'O' },
        x: { '7-4': 'X' },
        t: { '7-4': 'T' },
        blank: { '7-4': '' },
        removed: { '7-4': 'O' },
      },
    }) as unknown as AdminDashboardSource['attData'],
  });
}

describe('관리자 주간 현황의 조회 주일', () => {
  it('최근 경과한 주일을 기본으로 선택하고 행사 주일을 선택 목록에서 제외한다', () => {
    const result = buildAdminDashboard(source({ events: { '7-4': '수련회' } }), { nowMs });
    expect(result.selectedWeek).toMatchObject({ key: '7-3', label: '8월 23일' });
    expect(result.weeks.some((week) => week.key === '7-4')).toBe(false);
    expect(result.weeks[0].dateValue).toBeLessThan(result.weeks.at(-1)!.dateValue);
  });

  it('KST 주일 자정부터 해당 주일을 기본 후보에 포함한다', () => {
    const saturday = buildAdminDashboard(source(), { nowMs: Date.parse('2026-09-05T14:59:59.000Z') });
    const sunday = buildAdminDashboard(source(), { nowMs: Date.parse('2026-09-05T15:00:00.000Z') });
    expect(saturday.selectedWeek?.key).toBe('7-4');
    expect(sunday.selectedWeek).toMatchObject({ key: '8-0', label: '9월 6일' });
  });

  it('과거 연도는 마지막 정상 주일, 미래 연도는 첫 정상 주일을 기본으로 고른다', () => {
    const past = buildAdminDashboard(source({ curYear: 2025, months: getSundaysForYear(2025) }), { nowMs });
    const future = buildAdminDashboard(source({ curYear: 2027, months: getSundaysForYear(2027) }), { nowMs });
    expect(past.selectedWeek).toMatchObject({ label: '12월 28일' });
    expect(future.selectedWeek).toMatchObject({ label: '1월 3일' });
  });

  it('현재 연도의 첫 주일 전에는 첫 정상 주일을 기본으로 고른다', () => {
    const result = buildAdminDashboard(source(), { nowMs: Date.parse('2026-01-01T00:00:00.000Z') });
    expect(result.selectedWeek).toMatchObject({ label: '1월 4일' });
  });

  it('유효한 사용자 선택은 기본값보다 우선하고 행사·삭제된 선택은 다시 파생한다', () => {
    expect(buildAdminDashboard(source(), { nowMs, weekKey: '10-0' }).selectedWeek?.key).toBe('10-0');
    expect(buildAdminDashboard(source({ events: { '10-0': '행사' } }), { nowMs, weekKey: '10-0' }).selectedWeek?.key).toBe('7-4');
    expect(buildAdminDashboard(source(), { nowMs, weekKey: 'gone' }).selectedWeek?.key).toBe('7-4');
  });

  it('모든 주일이 행사이면 가짜 미입력 업무나 0% 비율을 만들지 않는다', () => {
    const result = buildAdminDashboard(source({
      months: [{ month: 9, sundays: [6] }],
      events: { '0-0': '행사' },
      classData: { '1-1-1': { students: [{ id: 'a', name: '학생' }] } },
      attData: { '1-1-1': { a: { '0-0': 'O' } } },
    }), { nowMs });
    expect(result.weeks).toEqual([]);
    expect(result.selectedWeek).toBeNull();
    expect(result.rows[0]).toMatchObject({ status: 'no-week', studentCount: 1, recorded: 0, unentered: 0, attendanceRate: null, inputRate: null });
    expect(result.summary.pendingClassCount).toBe(0);
  });

  it('주일 목록이 비어 있어도 선택과 비율은 null이다', () => {
    const result = buildAdminDashboard(source({ months: [] }), { nowMs });
    expect(result.selectedWeek).toBeNull();
    expect(result.summary).toMatchObject({ classCount: 0, attendanceRate: null, inputRate: null });
  });
});

describe('한 번 누르는 출석 체크의 반별 상태', () => {
  const check = (allAbsent = false): AttendanceCheck => ({ revision: 1, startedAt: 100, updatedAt: 200, updatedBy: '교사', operationId: 'check-1',
    allAbsent, targetSid: 'a', targetToken: '학생A', expected: '', value: 'O', roster: { a: '학생A', b: '학생B' } });
  const students = [{ id: 'a', name: '학생A' }, { id: 'b', name: '학생B' }];
  const now = Date.parse('2026-10-26T00:00:00+09:00');

  it('미시작·입력 있음·일반 학생 출석 0명 확인과 기존 입력을 구분하며 완료로 오해시키지 않는다', () => {
    const result = buildAdminDashboard(source({ months: [{ month: 10, sundays: [25] }],
      classData: { '1-1-1': { students }, '1-1-2': { students: [...students, { id: 'long', name: '장결', jang: true }] }, '1-1-3': { students }, '1-1-4': { students } },
      attData: { '1-1-1': { a: { '0-0': 'O' }, b: { '0-0': 'X' } }, '1-1-2': { a: { '0-0': 'X' }, b: { '0-0': 'X' }, long: { '0-0': 'O' } },
        '1-1-4': { a: { '0-0': 'O' }, b: { '0-0': 'X' } } },
      attendanceChecks: { '1-1-1': { '0-0': check() }, '1-1-2': { '0-0': check(true) } },
    }), { nowMs: now });
    expect(result.oneTap).toBe(true);
    expect(result.rows.map(row => row.status)).toEqual(['started', 'all-absent', 'empty', 'complete']);
    expect(result.rows[0]).toMatchObject({ inputPresent: 1, inputRecorded: 2, lastSavedAt: 200 });
    expect(result.rows[1]).toMatchObject({ inputPresent: 0, present: 1, status: 'all-absent' });
    expect(result.rows[2]).toMatchObject({ present: 0, absent: 0, recorded: 0, attendanceRate: null, lastSavedAt: null });
    expect(result.summary).toMatchObject({ startedClassCount: 1, allAbsentClassCount: 1, completeClassCount: 1, emptyClassCount: 1, pendingClassCount: 1, recorded: 7 });
  });

  it('체크 이후 새로 추가된 학생의 빈칸은 소급 결석으로 만들지 않고 확인 대상으로 남긴다', () => {
    const result = buildAdminDashboard(source({ months: [{ month: 10, sundays: [25] }],
      classData: { '1-1-1': { students } }, attData: { '1-1-1': { a: { '0-0': 'O' } } }, attendanceChecks: { '1-1-1': { '0-0': check() } },
    }), { nowMs: now });
    expect(result.rows[0]).toMatchObject({ status: 'started', present: 1, absent: 0, unentered: 1, inputRecorded: 1 });
    expect(result.summary.pendingClassCount).toBe(1);
  });

  it('전원 결석 확인 뒤 일반 학생의 O가 있으면 입력 있음이며 이전 날짜는 기존 상태로 계산한다', () => {
    const data = source({ months: [{ month: 10, sundays: [18, 25] }], classData: { '1-1-1': { students } },
      attData: { '1-1-1': { a: { '0-0': 'O', '0-1': 'O' }, b: { '0-0': 'X', '0-1': 'X' } } },
      attendanceChecks: { '1-1-1': { '0-0': check(true), '0-1': check(true) } },
    });
    expect(buildAdminDashboard(data, { nowMs: now }).rows[0].status).toBe('started');
    const before = buildAdminDashboard(data, { nowMs: now, weekKey: '0-0' });
    expect(before.oneTap).toBe(false); expect(before.rows[0]).toMatchObject({ status: 'complete', lastSavedAt: null });
  });
});

describe('관리자 주간 현황의 집계', () => {
  it('O·X와 이전 T를 입력으로 세고 빈 값·누락·명단에서 삭제된 학생을 구분한다', () => {
    const result = buildAdminDashboard(mixedSource(), { nowMs });
    expect(result.rows[0]).toMatchObject({
      classKey: '1-1-1', label: '1부 1학년 1반', teacher: '홍교사',
      studentCount: 5, longAbsentCount: 1, recorded: 3, present: 2, absent: 1,
      inputStudentCount: 4, inputRecorded: 3, unentered: 1, attendanceRate: 67, inputRate: 75, status: 'partial',
    });
    expect(result.summary).toMatchObject({ classCount: 1, partialClassCount: 1, pendingClassCount: 1, recorded: 3, unentered: 1 });
  });

  it('장결자의 명단과 입력을 전체 현황에 모두 포함하고 이전 지각은 출석으로 합친다', () => {
    const data = mixedSource();
    data.attData['1-1-1'].missing = { '7-4': 'O' };
    const result = buildAdminDashboard(data, { nowMs });
    expect(result.summary).toMatchObject({
      studentCount: 5, longAbsentCount: 1, recorded: 4, present: 3, attendanceRate: 75,
      inputStudentCount: 4, inputRecorded: 3, unentered: 1, inputRate: 75,
    });
  });

  it('일반 학생 20명이 모두 입력되고 장결 1명이 미기록이어도 입력 업무는 완료다', () => {
    const students = Array.from({ length: 20 }, (_, index) => ({ id: `a${index}`, name: `일반학생${index}` }));
    const data = source({
      classData: { '1-1-1': { students: [...students, { id: 'jang', name: '장결학생', jang: true }] } },
      attData: { '1-1-1': Object.fromEntries(students.map((student) => [student.id, { '7-4': 'O' as const }])) },
    });
    const result = buildAdminDashboard(data, { nowMs });
    expect(result.rows[0]).toMatchObject({
      studentCount: 21, longAbsentCount: 1, recorded: 20, present: 20, attendanceRate: 100,
      inputStudentCount: 20, inputRecorded: 20, unentered: 0, inputRate: 100, status: 'complete',
    });
    expect(result.summary).toMatchObject({ completeClassCount: 1, pendingClassCount: 0, inputStudentCount: 20, inputRecorded: 20, unentered: 0, inputRate: 100 });
  });

  it('전원 장결인 반은 빈 반과 구분하되 입력 대기나 완료 반으로 세지 않는다', () => {
    const result = buildAdminDashboard(source({
      classData: {
        '1-1-1': { students: [{ id: 'jang', name: '장결학생', jang: true }] },
        '1-1-2': { students: [] },
      },
      attData: { '1-1-1': { jang: { '7-4': 'O' } } },
    }), { nowMs });
    expect(result.rows[0]).toMatchObject({
      studentCount: 1, recorded: 1, present: 1, attendanceRate: 100,
      inputStudentCount: 0, inputRecorded: 0, unentered: 0, inputRate: null, status: 'no-targets',
    });
    expect(result.rows[1].status).toBe('no-students');
    expect(result.summary).toMatchObject({ noTargetClassCount: 1, noStudentClassCount: 1, completeClassCount: 0, pendingClassCount: 0, inputRate: null });
  });

  it('장결자만 기록된 반은 일반 학생의 미입력 업무를 진행 중으로 바꾸지 않는다', () => {
    const result = buildAdminDashboard(source({
      classData: { '1-1-1': { students: [{ id: 'a', name: '일반학생' }, { id: 'jang', name: '장결학생', jang: true }] } },
      attData: { '1-1-1': { jang: { '7-4': 'X' } } },
    }), { nowMs });
    expect(result.rows[0]).toMatchObject({
      studentCount: 2, recorded: 1, absent: 1, attendanceRate: 0,
      inputStudentCount: 1, inputRecorded: 0, unentered: 1, inputRate: 0, status: 'empty',
    });
    expect(result.summary).toMatchObject({ emptyClassCount: 1, partialClassCount: 0, pendingClassCount: 1 });
  });

  it('조회 주일이 없으면 전원 장결 반도 입력 완료나 대기 업무를 만들지 않는다', () => {
    const result = buildAdminDashboard(source({
      months: [],
      classData: { '1-1-1': { students: [{ id: 'jang', name: '장결학생', jang: true }] } },
    }), { nowMs });
    expect(result.rows[0]).toMatchObject({ status: 'no-week', inputStudentCount: 0, inputRecorded: 0, unentered: 0, inputRate: null });
    expect(result.summary).toMatchObject({ noTargetClassCount: 0, completeClassCount: 0, pendingClassCount: 0 });
  });

  it('완료·진행·미입력·빈 반을 구분하고 빈 반을 입력 완료로 세지 않는다', () => {
    const result = buildAdminDashboard(source({
      classData: {
        '1-1-1': { students: [{ id: 'a', name: '완료' }] },
        '1-1-2': { students: [{ id: 'a', name: '입력' }, { id: 'b', name: '미입력' }] },
        '1-1-3': { students: [{ id: 'a', name: '미입력' }] },
        '1-1-4': { students: [] },
      },
      attData: ({ '1-1-1': { a: { '7-4': 'X' } }, '1-1-2': { a: { '7-4': 'T' } }, '1-1-3': { a: { '7-4': '' } } }) as unknown as AdminDashboardSource['attData'],
    }), { nowMs });
    expect(result.rows.map((row) => row.status)).toEqual(['complete', 'partial', 'empty', 'no-students']);
    expect(result.rows[2]).toMatchObject({ inputRate: 0, attendanceRate: null, teacher: '' });
    expect(result.rows[3]).toMatchObject({ inputRate: null, attendanceRate: null });
    expect(result.summary).toMatchObject({ classCount: 4, completeClassCount: 1, partialClassCount: 1, emptyClassCount: 1, noStudentClassCount: 1, pendingClassCount: 2 });
  });

  it('전체 출석률은 반별 비율 평균이 아닌 실제 입력 인원으로 계산한다', () => {
    const result = buildAdminDashboard(source({
      classData: {
        '1-1-1': { students: [{ id: 'a', name: '출석' }] },
        '1-1-2': { students: [{ id: 'a', name: '결석1' }, { id: 'b', name: '결석2' }, { id: 'c', name: '결석3' }] },
      },
      attData: { '1-1-1': { a: { '7-4': 'O' } }, '1-1-2': { a: { '7-4': 'X' }, b: { '7-4': 'X' }, c: { '7-4': 'X' } } },
    }), { nowMs });
    expect(result.rows.map((row) => row.attendanceRate)).toEqual([100, 0]);
    expect(result.summary).toMatchObject({ attendanceRate: 25, inputRate: 100 });
  });

  it('명단이 하나도 없어도 비율을 0%나 NaN으로 표시하지 않는다', () => {
    const result = buildAdminDashboard(source(), { nowMs });
    expect(result.rows).toEqual([]);
    expect(result.summary).toMatchObject({ classCount: 0, studentCount: 0, recorded: 0, attendanceRate: null, inputRate: null, pendingClassCount: 0 });
  });
});

describe('관리자 반 목록의 필터와 정렬', () => {
  const data = source({
    classData: {
      '2-1-1': { teacher: '이교사', students: [{ id: 'a', name: '다른부학생' }] },
      '1-1-10': { teacher: '홍교사', students: [{ id: 'a', name: '열반학생' }] },
      '1-2-1': { teacher: '다른학년교사', students: [] },
      '1-1-2': { teacher: '홍교사', students: [{ id: 'a', name: '둘반학생' }] },
    },
    attData: { '1-1-10': { a: { '7-4': 'O' } }, '1-1-2': { a: { '7-4': 'X' } } },
  });

  it('원장의 삽입 순서와 관계없이 부·학년·반의 숫자순을 유지한다', () => {
    const result = buildAdminDashboard(data, { nowMs });
    expect(result.rows.map((row) => row.classKey)).toEqual(['1-1-2', '1-1-10', '1-2-1', '2-1-1']);
    expect(Object.keys(data.classData)).toEqual(['2-1-1', '1-1-10', '1-2-1', '1-1-2']);
  });

  it('부·학년·검색은 동시에 적용하며 교사명 공백을 무시해도 반 순서는 그대로다', () => {
    const result = buildAdminDashboard(data, { nowMs, part: '1', grade: '1', search: ' 홍 교사 ' });
    expect(result.rows.map((row) => row.classKey)).toEqual(['1-1-2', '1-1-10']);
    expect(result.summary).toMatchObject({ classCount: 2, studentCount: 2, recorded: 2, attendanceRate: 50 });
    expect(result.overallSummary).toMatchObject({ classCount: 4, studentCount: 3 });
    expect(result.allRows).toHaveLength(4);
  });

  it('학생명이나 반 표기로 검색해도 해당 반의 전체 학생을 집계한다', () => {
    const student = buildAdminDashboard(mixedSource(), { nowMs, search: '장결학생' });
    expect(student.rows).toHaveLength(1);
    expect(student.summary.studentCount).toBe(5);
    expect(buildAdminDashboard(data, { nowMs, search: '1부 1학년 10반' }).rows.map((row) => row.classKey)).toEqual(['1-1-10']);
    expect(buildAdminDashboard(data, { nowMs, search: '2-1-1' }).rows.map((row) => row.classKey)).toEqual(['2-1-1']);
  });

  it('전체 필터와 공백 검색은 전체를 보여 주며 결과 없음은 전체 원장과 구분한다', () => {
    expect(buildAdminDashboard(data, { nowMs, part: 'all', grade: 'all', search: ' ' }).rows).toHaveLength(4);
    const result = buildAdminDashboard(data, { nowMs, search: '없는학생' });
    expect(result.rows).toEqual([]);
    expect(result.summary.classCount).toBe(0);
    expect(result.overallSummary.classCount).toBe(4);
  });
});
