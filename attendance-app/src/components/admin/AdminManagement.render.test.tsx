/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { initialState } from '@/store/AppContext';

const mocks = vi.hoisted(() => ({ state: {} as typeof initialState, dispatch: vi.fn(), push: vi.fn() }));
vi.mock('@/store/AppContext', async original => ({
  ...await original<typeof import('@/store/AppContext')>(),
  useApp: () => ({ state: mocks.state, dispatch: mocks.dispatch }),
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock('@/components/modals/StudentModal', () => ({ default: () => <div>학생 수정 창</div> }));
vi.mock('@/components/modals/MoveStudentModal', () => ({ default: ({ target }: { target: { sid: string } }) => <div>학생 이동 창 {target.sid}</div> }));

import ClassAttendanceOverview from './ClassAttendanceOverview';
import StudentDirectory from './StudentDirectory';

beforeEach(() => {
  mocks.dispatch.mockClear(); mocks.push.mockClear();
  mocks.state = {
    ...initialState,
    curYear: 2026,
    months: [{ month: 9, sundays: [6] }],
    events: {},
    classData: {
      '1-1-1': { teacher: '김담임', students: [
        { id: 'a', name: '김하나', phone: '010-1111-2222', pphone: '010-9999-0000', school: '새봄고' },
        { id: 'b', name: '박두나', jang: true },
      ] },
      '2-2-3': { teacher: '이담임', students: [{ id: 'c', name: '이세나', phone: '010-3333-4444' }] },
    },
    attData: { '1-1-1': { a: { '0-0': 'O' }, b: { '0-0': 'X' } } },
  };
});
afterEach(cleanup);

describe('관리자 명단·출석 접근 경로', () => {
  it('반을 먼저 선택하지 않고 전체 학생을 검색하고 이동을 시작한다', () => {
    render(<StudentDirectory onOpenClass={vi.fn()} />);
    expect(screen.getByText('전체').nextElementSibling?.textContent).toBe('3명');
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: '33334444' } });
    const table = screen.getByRole('table');
    expect(within(table).getByText('이세나')).toBeTruthy();
    expect(within(table).queryByText('김하나')).toBeNull();
    fireEvent.click(within(table).getByRole('button', { name: '이동' }));
    expect(screen.getByText('학생 이동 창 c')).toBeTruthy();
  });

  it('반별 입력률과 출석률을 구분하고 미입력을 결석으로 계산하지 않는다', () => {
    render(<ClassAttendanceOverview />);
    const row = screen.getByRole('button', { name: '1부 1학년 1반 김담임' }).closest('tr')!;
    expect(within(row).getByText('100%')).toBeTruthy();
    expect(within(row).getByText('50%')).toBeTruthy();
    const emptyRow = screen.getByRole('button', { name: '2부 2학년 3반 이담임' }).closest('tr')!;
    const cells = within(emptyRow).getAllByRole('cell');
    expect(cells[1].textContent).toBe('1명');
    expect(cells[5].textContent).toBe('1명');
    expect(cells[7].textContent).toBe('—');
  });
});
