/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { initialState } from '@/store/AppContext';
import { getSundaysForYear } from '@/utils/dates';

const mocks = vi.hoisted(() => ({ state: {} as typeof initialState, get: vi.fn(), ref: vi.fn((_db: unknown, path: string) => path) }));
vi.mock('@/lib/db', () => ({ db: {}, ref: mocks.ref, get: mocks.get }));
vi.mock('@/store/AppContext', async original => ({ ...await original<typeof import('@/store/AppContext')>(), useApp: () => ({ state: mocks.state }) }));
import HistoryModal from './HistoryModal';
const snap = (value: unknown) => ({ val: () => value, exists: () => value !== null });
function yearCard(year: number) { return screen.getByText(new RegExp(`^${year}년`)).closest('article')!; }
beforeEach(() => {
  mocks.state = { ...initialState, curYear: 2026, months: getSundaysForYear(2026), events: { '0-1': '합성 행사' }, userRole: { role: 'admin' },
    classData: { '1-2-1': { students: [{ id: 's1', name: '합성학생', personId: 'person_student_a' }] } },
    attData: { '1-2-1': { s1: { '0-0': 'O', '0-1': 'X' } } } };
  mocks.ref.mockClear();
  mocks.get.mockReset().mockImplementation((path: string) => Promise.resolve(snap(path.startsWith('classes')
    ? { '2-1-7': { students: { old: { name: '합성학생', personId: 'person_student_a' } } } }
    : path.startsWith('attendance') ? { '2-1-7': { old: { '0-0': 'O', '0-1': 'X' } } }
      : { event: { month: '1', day: '12', label: '과거 행사' } })));
});
afterEach(() => { cleanup(); vi.useRealTimers(); });
describe('학생 출석 이력 보호', () => {
  it.each(['2', '3'])('개별 %s학년 교사는 현재 반 이력만 표시하고 연도 전체 원장을 요청하지 않는다', async grade => {
    mocks.state = { ...mocks.state, userRole: { role: 'teacher', part: '1', grade, class: '1' },
      classData: { [`1-${grade}-1`]: { students: [{ id: 's1', name: '합성학생' }] } },
      attData: { [`1-${grade}-1`]: { s1: { '0-0': 'O' } } } };
    render(<HistoryModal sid="s1" curCk={`1-${grade}-1`} onClose={vi.fn()} />);
    expect(screen.getByRole('note').textContent).toContain('관리자에게 확인');
    await screen.findByText('100%');
    expect(mocks.get).not.toHaveBeenCalled();
  });

  it('현재·과거 행사와 같은 통계 기준으로 100%를 표시하고 미래 연도는 읽지 않는다', async () => {
    render(<HistoryModal sid="s1" curCk="1-2-1" onClose={vi.fn()} />);
    await screen.findByText('아직 해당 학년이 아닙니다.');
    expect(within(yearCard(2025)).getByText('100%')).toBeTruthy();
    expect(within(yearCard(2026)).getByText('100%')).toBeTruthy();
    expect(mocks.get.mock.calls.map(([path]) => path)).toEqual(['classes/2025', 'attendance/2025', 'events/2025']);
    expect(within(yearCard(2025)).getByLabelText('1월 출석 1회, 입력 1회')).toBeTruthy();
  });
  it('현재 출석 변경은 이력에 즉시 반영하고 과거 연도를 다시 읽지 않는다', async () => {
    const { rerender } = render(<HistoryModal sid="s1" curCk="1-2-1" onClose={vi.fn()} />);
    await screen.findByText('아직 해당 학년이 아닙니다.');
    mocks.state = { ...mocks.state, attData: { '1-2-1': { s1: { '0-0': 'X' } } } };
    rerender(<HistoryModal sid="s1" curCk="1-2-1" onClose={vi.fn()} />);
    expect(within(yearCard(2026)).getByText('0%')).toBeTruthy();
    expect(within(yearCard(2025)).getByText('100%')).toBeTruthy();
    expect(mocks.get).toHaveBeenCalledTimes(3);
  });
  it('다른 학생이 사용하는 옛 내부 ID 출석은 연결하지 않는다', async () => {
    mocks.get.mockImplementation((path: string) => Promise.resolve(snap(path.startsWith('classes')
      ? { '1-1-1': { students: {
        actual: { id: 'legacy', name: '합성학생', personId: 'person_student_a' },
        other: { id: 'legacy', name: '다른학생', personId: 'person_student_b' },
      } } } : path.startsWith('attendance') ? { '1-1-1': { legacy: { '0-0': 'O' } } } : {})));
    render(<HistoryModal sid="s1" curCk="1-2-1" onClose={vi.fn()} />);
    await screen.findByText('동일 학생 연결 확인 필요');
    expect(within(yearCard(2025)).queryByText('100%')).toBeNull();
  });
  it('같은 SID의 다른 학생 기록은 표시하지 않는다', async () => {
    mocks.get.mockImplementation((path: string) => Promise.resolve(snap(path.startsWith('classes')
      ? { '1-1-1': { students: { s1: { id: 's1', name: '다른학생', personId: 'person_student_b' } } } }
      : path.startsWith('attendance') ? { '1-1-1': { s1: { '0-0': 'X' } } } : {})));
    render(<HistoryModal sid="s1" curCk="1-2-1" onClose={vi.fn()} />);
    await screen.findByText('동일 학생 연결 확인 필요');
    expect(within(yearCard(2025)).queryByText('0%')).toBeNull();
    expect(within(yearCard(2025)).queryByText('D')).toBeNull();
  });
  it('무기록은 0%·D가 아니며 정상 빈 명단도 실패와 구분한다', async () => {
    mocks.state.attData = {};
    mocks.get.mockResolvedValue(snap(null));
    render(<HistoryModal sid="s1" curCk="1-2-1" onClose={vi.fn()} />);
    await screen.findByText('연결된 학생 명단 없음');
    expect(within(yearCard(2026)).getByText('— · 입력된 출석 기록 없음')).toBeTruthy();
    expect(screen.queryByText('D')).toBeNull();
    expect(screen.queryByText('0%')).toBeNull();
  });
  it('행사 또는 원장 조회 실패는 기록 소실처럼 표시하지 않고 재시도한다', async () => {
    mocks.get.mockRejectedValue(new Error('권한 또는 통신 오류'));
    render(<HistoryModal sid="s1" curCk="1-2-1" onClose={vi.fn()} />);
    expect((await screen.findByRole('alert')).textContent).toContain('기록이 없다는 뜻은 아닙니다');
    expect(screen.queryByText('연결된 학생 명단 없음')).toBeNull();
    mocks.get.mockResolvedValue(snap(null));
    fireEvent.click(screen.getByRole('button', { name: '다시 불러오기' }));
    await screen.findByText('연결된 학생 명단 없음');
    expect(screen.queryByRole('alert')).toBeNull();
  });
  it('조회가 멈추면 제한 시간 후 재시도를 제공한다', async () => {
    vi.useFakeTimers();
    mocks.get.mockImplementation(() => new Promise(() => {}));
    render(<HistoryModal sid="s1" curCk="1-2-1" onClose={vi.fn()} />);
    await act(async () => { await vi.advanceTimersByTimeAsync(15001); });
    expect(screen.getByRole('button', { name: '다시 불러오기' })).toBeTruthy();
  });
  it('대상 전환 후 늦게 온 응답은 새 학생 화면에 적용하지 않는다', async () => {
    let finish!: (value: ReturnType<typeof snap>) => void;
    mocks.get.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const { rerender } = render(<HistoryModal sid="s1" curCk="1-2-1" onClose={vi.fn()} />);
    mocks.state = { ...mocks.state, classData: { '1-2-1': { students: [{ id: 's2', name: '새학생', personId: 'person_student_new' }] } } };
    mocks.get.mockResolvedValue(snap(null));
    rerender(<HistoryModal sid="s2" curCk="1-2-1" onClose={vi.fn()} />);
    await screen.findByText('연결된 학생 명단 없음');
    await act(async () => { finish(snap({ '1-1-1': { students: { s1: { name: '합성학생', personId: 'person_student_a' } } } })); });
    await waitFor(() => expect(screen.getByText('새학생')).toBeTruthy());
    expect(within(yearCard(2025)).queryByText('100%')).toBeNull();
  });
});
