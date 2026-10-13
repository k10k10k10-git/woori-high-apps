/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { initialState } from '@/store/AppContext';
import type { AttValue } from '@/types';

const mocks = vi.hoisted(() => ({ state: {} as typeof initialState, dispatch: vi.fn(), push: vi.fn(), params: '', downloadCSV: vi.fn(), downloadXLSX: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/utils/export', () => ({ downloadCSV: mocks.downloadCSV, downloadXLSX: mocks.downloadXLSX }));
vi.mock('@/lib/longAbsentReturn', () => ({ returnLongAbsentStudent: vi.fn() }));
vi.mock('@/store/AppContext', async original => ({
  ...await original<typeof import('@/store/AppContext')>(),
  useApp: () => ({ state: mocks.state, dispatch: mocks.dispatch }),
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mocks.push }), useSearchParams: () => new URLSearchParams(mocks.params) }));
vi.mock('@/components/modals/HistoryModal', () => ({ default: () => <div>학생 출석 이력</div> }));
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
  mocks.downloadCSV.mockClear(); mocks.downloadXLSX.mockClear();
  localStorage.clear();
  mocks.state = {
    ...initialState,
    curYear: 2026,
    months: [{ month: 9, sundays: [6] }],
    events: {},
    classData: {
      '1-1-1': { teacher: '김담임', students: [
        { id: 'a', num: 1, name: '김하나', birth: '2010-03-14', phone: '010-1111-2222', pphone: '010-9999-0000', school: '새봄고', addr: '경기도 성남시 테스트로 12' },
        { id: 'b', num: 2, name: '박두나', jang: true },
      ] },
      '2-2-3': { teacher: '이담임', students: [{ id: 'c', num: 1, name: '이세나', phone: '010-3333-4444' }] },
    },
    attData: { '1-1-1': { a: { '0-0': 'O' }, b: { '0-0': 'X' } } },
  };
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it('개인 상세도 주소·생년월일·연간 출석률·등급을 같은 기준으로 표시한다', () => {
  render(<StudentDirectory onOpenClass={vi.fn()} />);
  fireEvent.click(screen.getByText('보기 설정'));
  fireEvent.click(screen.getByRole('button', { name: '간편 목록' }));
  fireEvent.click(screen.getByRole('button', { name: '김하나' }));
  const detail = screen.getByRole('complementary');
  expect(within(detail).getByText('경기도 성남시 테스트로 12')).toBeTruthy();
  expect(within(detail).getByText('2010-03-14')).toBeTruthy();
  expect(within(detail).getByText('100%')).toBeTruthy();
  expect(within(detail).getByText('A')).toBeTruthy();
});

describe('관리자 명단·출석 접근 경로', () => {
  it('장결 학생 상세에서 동일 학생·반의 복귀 확인창을 제공한다', () => {
    mocks.state.userRole = { role: 'admin' };
    render(<StudentDirectory onOpenClass={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /^박두나\s*장결$/ }));
    fireEvent.click(within(screen.getByRole('complementary')).getByRole('button', { name: '일반 명단 복귀' }));
    expect(screen.getByRole('dialog', { name: '일반 명단 복귀' }).textContent).toContain('박두나');
    expect(screen.getByRole('dialog').textContent).toContain('1부 1학년 1반');
  });
  it('모바일 간편 명단은 이름·소속만 보여 주고 상세 제목으로 스크롤한다', () => {
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true })));
    const scroll = vi.fn();
    HTMLElement.prototype.scrollIntoView = scroll;
    render(<StudentDirectory onOpenClass={vi.fn()} />);
    expect(screen.getAllByRole('columnheader').map(cell => cell.textContent)).toEqual(['이름', '현재 소속']);
    fireEvent.click(screen.getByRole('button', { name: '김하나' }));
    expect(scroll).toHaveBeenCalledWith({ block: 'start' });
    expect(document.activeElement).toBe(screen.getByRole('complementary'));
  });
  it.each(['table', 'compact', 'overview'])('%s 보기의 이름에서 같은 상세·이력·이동 경로를 제공한다', view => {
    localStorage.setItem('woori-admin-directory-view', view);
    render(<StudentDirectory onOpenClass={vi.fn()} />);
    const name = screen.getByRole('button', { name: '김하나' });
    fireEvent.click(name);
    const detail = screen.getByRole('complementary', { name: '김하나 학생 상세' });
    expect(document.activeElement).toBe(detail);
    expect(within(detail).getByText('100%')).toBeTruthy();
    expect(within(detail).getByRole('button', { name: '정보 수정' })).toBeTruthy();
    fireEvent.click(within(detail).getByRole('button', { name: '출석 이력' }));
    expect(mocks.dispatch).toHaveBeenLastCalledWith({ type: 'OPEN_HISTORY_MODAL', payload: { sid: 'a', ck: '1-1-1' } });
    fireEvent.click(within(detail).getByRole('button', { name: '닫기' }));
    expect(screen.queryByRole('complementary')).toBeNull();
    expect(document.activeElement).toBe(name);
  });
  it.each(['CSV', 'Excel'])('%s 명단에는 상태 대신 연간 출석률·등급을 내보내고 장결 기록과 무기록을 구분한다', format => {
    render(<StudentDirectory onOpenClass={vi.fn()} />);
    fireEvent.click(screen.getByText('명단 내보내기'));
    fireEvent.click(screen.getByRole('button', { name: format }));
    const download = format === 'CSV' ? mocks.downloadCSV : mocks.downloadXLSX;
    const rows = download.mock.calls[0][0];
    expect(rows[0]).toEqual(['이름', '부서', '학년', '반', '담임 교사', '학생 연락처', '보호자 연락처', '학교', '주소', '생년월일', '출석률', '등급']);
    expect(rows[1].slice(8, 10)).toEqual(['경기도 성남시 테스트로 12', '2010-03-14']);
    expect(rows.slice(1).map((row: string[]) => [row[0], ...row.slice(-2)]))
      .toEqual([['김하나', '100%', 'A'], ['박두나', '0%', 'D'], ['이세나', '—', '—']]);
    expect(JSON.stringify(rows)).not.toMatch(/장결|일반|정상/);
  });

  it('내보내기도 학기 선택과 무관하게 행사·미입력을 제외하고 이전 T를 출석으로 계산한다', () => {
    mocks.state = { ...mocks.state, curView: 'first',
      months: [{ month: 1, sundays: [4, 11, 18] }, { month: 9, sundays: [6, 13] }],
      events: { '0-1': '행사' },
      attData: { '1-1-1': { a: { '0-0': 'T' as unknown as AttValue, '0-1': 'X', '1-0': 'X' } } },
    };
    render(<StudentDirectory onOpenClass={vi.fn()} />);
    fireEvent.click(screen.getByText('명단 내보내기'));
    fireEvent.click(screen.getByRole('button', { name: 'Excel' }));
    expect(mocks.downloadXLSX.mock.calls[0][0][1].slice(-2)).toEqual(['50%', 'D']);
  });

  it.each([[9, '90%', 'A'], [8, '80%', 'B'], [7, '70%', 'C'], [6, '60%', 'D']])('출석 %i/10회의 등급 경계를 기존 출석부와 맞춘다', (present, rate, grade) => {
    mocks.state = { ...mocks.state,
      months: [{ month: 1, sundays: [4, 11, 18, 25] }, { month: 2, sundays: [1, 8, 15, 22] }, { month: 3, sundays: [1, 8] }],
      attData: { '1-1-1': { a: Object.fromEntries(['0-0', '0-1', '0-2', '0-3', '1-0', '1-1', '1-2', '1-3', '2-0', '2-1'].map((key, index) => [key, index < Number(present) ? 'O' : 'X'])) } },
    };
    render(<StudentDirectory onOpenClass={vi.fn()} />);
    fireEvent.click(screen.getByText('명단 내보내기'));
    fireEvent.click(screen.getByRole('button', { name: 'CSV' }));
    expect(mocks.downloadCSV.mock.calls[0][0][1].slice(-2)).toEqual([rate, grade]);
  });

  it('명단 내보내기는 검색 결과만 포함하며 상태 대신 해당 학생의 출석률·등급을 유지한다', () => {
    render(<StudentDirectory onOpenClass={vi.fn()} />);
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: '김하나' } });
    fireEvent.click(screen.getByText('명단 내보내기'));
    fireEvent.click(screen.getByRole('button', { name: 'Excel' }));
    const rows = mocks.downloadXLSX.mock.calls[0][0];
    expect(rows).toHaveLength(2);
    expect(rows[1].slice(-2)).toEqual(['100%', 'A']);
  });

  it('반을 먼저 선택하지 않고 전체 학생을 검색하고 이동을 시작한다', () => {
    render(<StudentDirectory onOpenClass={vi.fn()} />);
    expect(screen.getByRole('status').textContent).toContain('3명 / 전체 3명');
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: '33334444' } });
    const table = screen.getByRole('table');
    expect(within(table).getByText('이세나')).toBeTruthy();
    expect(within(table).queryByText('김하나')).toBeNull();
    fireEvent.click(within(table).getByRole('button', { name: '이세나' }));
    fireEvent.click(within(screen.getByRole('complementary')).getByRole('button', { name: '소속 이동' }));
    expect(screen.getByText('학생 이동 창 c')).toBeTruthy();
  });

  it('상세 표에서 연락처와 생년월일까지 한눈에 보여 준다', () => {
    render(<StudentDirectory onOpenClass={vi.fn()} />);
    expect(screen.getByRole('button', { name: '명단 표' }).getAttribute('aria-pressed')).toBe('true');
    const table = screen.getByRole('table', { name: '2026년 전체 학생 상세 표' });
    expect(within(table).getByRole('columnheader', { name: '학생 연락처' })).toBeTruthy();
    expect(within(table).getByRole('columnheader', { name: '보호자 연락처' })).toBeTruthy();
    expect(within(table).getByRole('columnheader', { name: '생년월일' })).toBeTruthy();
    expect(within(table).getByRole('link', { name: '010-1111-2222' }).getAttribute('href')).toBe('tel:01011112222');
    expect(within(table).getByText('2010-03-14')).toBeTruthy();
    expect(within(table).queryByRole('columnheader', { name: '담임 교사' })).toBeNull();
    expect(within(table).getByRole('columnheader', { name: '주소' })).toBeTruthy();
    expect(within(table).getByRole('columnheader', { name: '출석률' })).toBeTruthy();
    expect(within(table).getByText('경기도 성남시 테스트로 12')).toBeTruthy();
    expect(within(table).getByText('100%')).toBeTruthy();
    expect(screen.getByRole('button', { name: '명단 표' }).getAttribute('aria-pressed')).toBe('true');
  });

  it('명단 출석률은 학기 선택과 무관한 연간 기록이며 행사·미입력은 결석으로 세지 않는다', () => {
    mocks.state = { ...mocks.state, curView: 'first',
      months: [{ month: 1, sundays: [4, 11, 18] }, { month: 9, sundays: [6, 13] }],
      events: { '0-1': '행사' },
      attData: { '1-1-1': { a: { '0-0': 'O', '0-1': 'X', '1-0': 'X' } } },
    };
    const page = render(<StudentDirectory onOpenClass={vi.fn()} />);
    const table = screen.getByRole('table');
    const student = within(table).getByRole('row', { name: /김하나/ });
    expect(within(student).getByText('50%')).toBeTruthy();
    const noRecords = within(table).getByRole('row', { name: /이세나/ });
    expect(within(noRecords).getAllByRole('cell')[7].textContent).toBe('—');
    mocks.state = { ...mocks.state, attData: { '1-1-1': { a: { '0-0': 'O', '1-0': 'O' } } } };
    page.rerender(<StudentDirectory onOpenClass={vi.fn()} />);
    expect(within(student).getByText('100%')).toBeTruthy();
  });

  it('바꾼 명단 보기를 저장하고 다시 열 때 복원한다', () => {
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false })));
    render(<StudentDirectory onOpenClass={vi.fn()} />);
    fireEvent.click(screen.getByText('보기 설정'));
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
    fireEvent.click(screen.getByText('보기 설정'));
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

  it('한눈에 보기를 부·학년 순서로 묶고 반이 많은 학년도 다음 학년과 섞지 않는다', () => {
    const classKeys = ['2-3-1', '1-2-1', '2-1-1', '1-3-1', '2-2-1',
      ...Array.from({ length: 7 }, (_, index) => `1-1-${7 - index}`)];
    mocks.state = { ...mocks.state, classData: Object.fromEntries(classKeys.map(key => [key, {
      teacher: '담임', students: [{ id: key, num: 1, name: key }],
    }])) };
    render(<StudentDirectory onOpenClass={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: '한눈에' }));
    const grades = screen.getAllByRole('region', { name: /^[12]부 [123]학년$/ });
    expect(grades.map(section => section.querySelector('h3')?.textContent))
      .toEqual(['1부 1학년', '1부 2학년', '1부 3학년', '2부 1학년', '2부 2학년', '2부 3학년']);
    expect(within(grades[0]).getAllByRole('region').map(section => section.querySelector('h4')?.textContent))
      .toEqual(Array.from({ length: 7 }, (_, index) => `1부 1학년 ${index + 1}반`));
    expect(within(grades[1]).getByRole('region', { name: '1부 2학년 1반' })).toBeTruthy();

    fireEvent.change(screen.getByRole('searchbox'), { target: { value: '2-3-1' } });
    expect(screen.getAllByRole('region', { name: /^[12]부 [123]학년$/ }).map(section => section.querySelector('h3')?.textContent))
      .toEqual(['2부 3학년']);
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
    expect(screen.getByRole('link', { name: '반 출석부' }).getAttribute('href')).toContain(`week=${encodeURIComponent(target)}`);
  });
});
