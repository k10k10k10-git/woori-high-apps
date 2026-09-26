/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { initialState } from '@/store/AppContext';

const mocks = vi.hoisted(() => ({ state: {} as typeof initialState, dispatch: vi.fn(), push: vi.fn(), params: '' }));
vi.mock('@/store/AppContext', async original => ({
  ...await original<typeof import('@/store/AppContext')>(),
  useApp: () => ({ state: mocks.state, dispatch: mocks.dispatch }),
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mocks.push }), useSearchParams: () => new URLSearchParams(mocks.params) }));
vi.mock('@/components/modals/StudentModal', () => ({ default: () => <div>학생 수정 창</div> }));
vi.mock('@/components/modals/MoveStudentModal', () => ({ default: ({ target }: { target: { sid: string } }) => <div>학생 이동 창 {target.sid}</div> }));
vi.mock('@/components/tabs/AttendanceTab', () => ({ default: () => <div>출석 입력 화면</div> }));
vi.mock('@/components/tabs/StatTab', () => ({ default: () => <div>출석 통계 화면</div> }));
vi.mock('@/components/tabs/overall/OverallDashboard', () => ({ default: () => <div>전체 통계 화면</div> }));

import ClassAttendanceOverview from './ClassAttendanceOverview';
import AttendanceManagement from './AttendanceManagement';
import StudentDirectory from './StudentDirectory';

beforeEach(() => {
  mocks.dispatch.mockClear(); mocks.push.mockClear(); mocks.params = '';
  localStorage.clear();
  mocks.state = {
    ...initialState,
    curYear: 2026,
    months: [{ month: 9, sundays: [6] }],
    events: {},
    classData: {
      '1-1-1': { teacher: '김담임', students: [
        { id: 'a', num: 1, name: '김하나', birth: '2010-03-14', phone: '010-1111-2222', pphone: '010-9999-0000', school: '새봄고' },
        { id: 'b', num: 2, name: '박두나', jang: true },
      ] },
      '2-2-3': { teacher: '이담임', students: [{ id: 'c', num: 1, name: '이세나', phone: '010-3333-4444' }] },
    },
    attData: { '1-1-1': { a: { '0-0': 'O' }, b: { '0-0': 'X' } } },
  };
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('관리자 명단·출석 접근 경로', () => {
  it('반을 먼저 선택하지 않고 전체 학생을 검색하고 이동을 시작한다', () => {
    render(<StudentDirectory onOpenClass={vi.fn()} />);
    expect(screen.getByRole('status').textContent).toContain('3명 / 전체 3명');
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: '33334444' } });
    const table = screen.getByRole('table');
    expect(within(table).getByText('이세나')).toBeTruthy();
    expect(within(table).queryByText('김하나')).toBeNull();
    fireEvent.click(within(table).getByRole('button', { name: '이동' }));
    expect(screen.getByText('학생 이동 창 c')).toBeTruthy();
  });

  it('상세 표에서 연락처와 생년월일까지 한눈에 보여 준다', () => {
    render(<StudentDirectory onOpenClass={vi.fn()} />);
    expect(screen.getByRole('button', { name: '상세 표' }).getAttribute('aria-pressed')).toBe('true');
    const table = screen.getByRole('table', { name: '2026년 전체 학생 상세 표' });
    expect(within(table).getByRole('columnheader', { name: '학생 연락처' })).toBeTruthy();
    expect(within(table).getByRole('columnheader', { name: '보호자 연락처' })).toBeTruthy();
    expect(within(table).getByRole('columnheader', { name: '생년월일' })).toBeTruthy();
    expect(within(table).getByRole('link', { name: '010-1111-2222' }).getAttribute('href')).toBe('tel:01011112222');
    expect(within(table).getByText('2010-03-14')).toBeTruthy();
    expect(screen.getByRole('button', { name: '상세 표' }).getAttribute('aria-pressed')).toBe('true');
  });

  it('바꾼 명단 보기를 저장하고 다시 열 때 복원한다', () => {
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false })));
    render(<StudentDirectory onOpenClass={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: '간편 목록' }));
    expect(localStorage.getItem('woori-admin-directory-view')).toBe('compact');
    cleanup();
    render(<StudentDirectory onOpenClass={vi.fn()} />);
    expect(screen.getByRole('table', { name: '2026년 전체 학생 간편 목록' })).toBeTruthy();
  });

  it('모바일 첫 진입은 간편 목록이고 수동 선택은 기기 기본값보다 우선한다', () => {
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true })));
    render(<StudentDirectory onOpenClass={vi.fn()} />);
    expect(screen.getByRole('table', { name: '2026년 전체 학생 간편 목록' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '상세 표' }));
    cleanup();
    render(<StudentDirectory onOpenClass={vi.fn()} />);
    expect(screen.getByRole('table', { name: '2026년 전체 학생 상세 표' })).toBeTruthy();
  });

  it('한눈에 보기에서 반별로 번호·이름·장결을 읽고 선택을 복원한다', () => {
    render(<StudentDirectory onOpenClass={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: '한눈에' }));
    expect(screen.getByRole('button', { name: '한눈에' }).getAttribute('aria-pressed')).toBe('true');
    expect(localStorage.getItem('woori-admin-directory-view')).toBe('overview');
    expect(screen.queryByRole('table')).toBeNull();
    const firstClass = screen.getByRole('region', { name: '1부 1학년 1반' });
    const secondClass = screen.getByRole('region', { name: '2부 2학년 3반' });
    expect(within(firstClass).getByText('담임 김담임')).toBeTruthy();
    expect(within(firstClass).getByText('2명')).toBeTruthy();
    expect(within(firstClass).getAllByRole('listitem').map(item => item.textContent)).toEqual(['1김하나', '2박두나장결']);
    expect(within(secondClass).getAllByRole('listitem')[0].textContent).toBe('1이세나');
    cleanup();
    render(<StudentDirectory onOpenClass={vi.fn()} />);
    expect(screen.getByRole('button', { name: '한눈에' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('region', { name: '1부 1학년 1반' })).toBeTruthy();
  });

  it('한눈에 보기도 기존 명단 검색과 상태 필터를 공유한다', () => {
    render(<StudentDirectory onOpenClass={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: '한눈에' }));
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: '33334444' } });
    expect(screen.getByRole('status').textContent).toContain('1명 / 전체 3명');
    expect(screen.queryByRole('region', { name: '1부 1학년 1반' })).toBeNull();
    expect(screen.getByRole('region', { name: '2부 2학년 3반' })).toBeTruthy();
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: '' } });
    fireEvent.click(screen.getByText('필터 더보기'));
    fireEvent.change(screen.getByLabelText('상태'), { target: { value: 'long' } });
    const firstClass = screen.getByRole('region', { name: '1부 1학년 1반' });
    expect(within(firstClass).getAllByRole('listitem').map(item => item.textContent)).toEqual(['2박두나장결']);
    expect(screen.queryByRole('region', { name: '2부 2학년 3반' })).toBeNull();
  });

  it('반별 입력률과 출석률을 구분하고 미입력을 결석으로 계산하지 않는다', () => {
    render(<ClassAttendanceOverview />);
    expect(screen.getByRole('button', { name: /^\uc804\uccb4/ }).getAttribute('aria-pressed')).toBe('true');
    const row = screen.getByRole('button', { name: '1부 1학년 1반 김담임' }).closest('tr')!;
    expect(within(row).getByText('입력률 100%')).toBeTruthy();
    expect(within(row).getByText('50%')).toBeTruthy();
    const emptyRow = screen.getByRole('button', { name: '2부 2학년 3반 이담임' }).closest('tr')!;
    expect(within(emptyRow).getByText('1명')).toBeTruthy();
    expect(within(emptyRow).getByText('입력률 0%')).toBeTruthy();
    expect(within(emptyRow).getByText('—')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /^확인 필요/ }));
    expect(screen.queryByRole('button', { name: '1부 1학년 1반 김담임' })).toBeNull();
    expect(screen.getByRole('button', { name: '2부 2학년 3반 이담임' })).toBeTruthy();
  });

  it('대시보드의 출석 미입력 링크만 확인 필요 반으로 시작한다', () => {
    mocks.params = 'view=overview&status=pending';
    const page = render(<AttendanceManagement />);
    expect(screen.getByRole('button', { name: /^확인 필요/ }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.queryByRole('button', { name: '1부 1학년 1반 김담임' })).toBeNull();
    expect(screen.getByRole('button', { name: '2부 2학년 3반 이담임' })).toBeTruthy();

    mocks.params = 'view=overview';
    page.rerender(<AttendanceManagement />);
    expect(screen.getByRole('button', { name: /^전체/ }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: '1부 1학년 1반 김담임' })).toBeTruthy();
  });

  it('현황에서 고른 주일을 출석 입력 탭까지 유지한다', () => {
    mocks.state = { ...mocks.state, userRole: { role: 'admin' }, months: [{ month: 9, sundays: [6, 13] }] };
    render(<AttendanceManagement />);
    const week = screen.getByLabelText('조회 주일') as HTMLSelectElement;
    const target = [...week.options].map(option => option.value).find(value => value !== week.value)!;
    fireEvent.change(week, { target: { value: target } });
    expect(screen.getByRole('link', { name: '출석 입력' }).getAttribute('href')).toContain(`week=${encodeURIComponent(target)}`);
  });
});
