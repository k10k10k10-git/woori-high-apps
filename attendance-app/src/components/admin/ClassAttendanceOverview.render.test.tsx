/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { initialState } from '@/store/AppContext';
import type { AttendanceCheck } from '@/utils/attendanceChecks';

const mocks = vi.hoisted(() => ({ state: null as unknown as typeof initialState, dispatch: vi.fn(), push: vi.fn() }));
vi.mock('@/store/AppContext', async original => ({ ...await original<typeof import('@/store/AppContext')>(),
  useApp: () => ({ state: mocks.state, dispatch: mocks.dispatch }) }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mocks.push }) }));
import ClassAttendanceOverview from './ClassAttendanceOverview';

const check = (allAbsent = false): AttendanceCheck => ({ revision: 1, startedAt: 1792886400000, updatedAt: 1792886400000,
  updatedBy: 'teacher', operationId: 'fixture-check', allAbsent, targetSid: 'a', targetToken: 'a', expected: '', value: 'O', roster: { a: 'a' } });

beforeEach(() => {
  mocks.dispatch.mockClear(); mocks.push.mockClear();
  const students = [{ id: 'a', name: '학생A' }, { id: 'b', name: '학생B' }];
  mocks.state = { ...initialState, curYear: 2026, months: [{ month: 10, sundays: [25] }], events: {},
    classData: { '1-1-1': { teacher: '담임1', students }, '1-1-2': { teacher: '담임2', students },
      '1-1-3': { teacher: '담임3', students: [...students, { id: 'long', name: '장결', jang: true }] } },
    attData: { '1-1-2': { a: { '0-0': 'O' }, b: { '0-0': 'X' } },
      '1-1-3': { a: { '0-0': 'X' }, b: { '0-0': 'X' }, long: { '0-0': 'O' } } },
    attendanceChecks: { '1-1-2': { '0-0': check() }, '1-1-3': { '0-0': check(true) } },
  };
});
afterEach(cleanup);

describe('새 출석 방식의 관리자 반별 현황', () => {
  it('미시작·입력 있음·전원 결석 확인과 최근 저장을 나누며 완료라고 표시하지 않는다', () => {
    render(<ClassAttendanceOverview weekKey="0-0" />);
    const empty = screen.getByRole('button', { name: '1부 1학년 1반 담임1' }).closest('tr')!;
    expect(within(empty).getByText('미시작')).toBeTruthy();
    expect(within(empty).getByText('0명 / —')).toBeTruthy();
    const started = screen.getByRole('button', { name: '1부 1학년 2반 담임2' }).closest('tr')!;
    expect(within(started).getByText('입력 있음')).toBeTruthy();
    expect(within(started).getByText(/마지막 저장/).tagName).toBe('TIME');
    expect(screen.queryByRole('button', { name: /^완료/ })).toBeNull();
    const absent = screen.getByRole('button', { name: '1부 1학년 3반 담임3' }).closest('tr')!;
    expect(within(absent).getByText('출석 0명 확인')).toBeTruthy();
    expect(within(absent).getByText('0명 출석 체크')).toBeTruthy();
    expect(within(absent).getByText('1명 / 2명')).toBeTruthy();
    expect(document.querySelector('.cao-note')?.textContent).toContain('입력 있음은 완료를 뜻하지 않으며');
  });

  it('상태 필터로 미시작·입력 있음·전원 결석 반을 각각 바로 찾는다', () => {
    render(<ClassAttendanceOverview weekKey="0-0" />);
    fireEvent.click(screen.getByRole('button', { name: /^확인 필요/ }));
    expect(screen.getByRole('button', { name: '1부 1학년 1반 담임1' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: '1부 1학년 2반 담임2' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /^입력 있음/ }));
    expect(screen.getByRole('button', { name: '1부 1학년 2반 담임2' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: '1부 1학년 1반 담임1' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /^출석 0명 확인/ }));
    expect(screen.getByRole('button', { name: '1부 1학년 3반 담임3' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: '1부 1학년 2반 담임2' })).toBeNull();
  });

  it('새 주일 전용 필터를 선택한 뒤 이전 날짜로 이동해도 선택 가능한 전체 필터로 돌아간다', () => {
    const { rerender } = render(<ClassAttendanceOverview weekKey="0-0" />);
    fireEvent.click(screen.getByRole('button', { name: /^출석 0명 확인/ }));
    mocks.state = { ...mocks.state, months: [{ month: 10, sundays: [18, 25] }] };
    rerender(<ClassAttendanceOverview weekKey="0-0" />);
    expect(screen.getByRole('button', { name: /^전체/ }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.queryByRole('button', { name: /^출석 0명 확인/ })).toBeNull();
    expect(screen.getByRole('button', { name: '1부 1학년 1반 담임1' })).toBeTruthy();
  });
});
